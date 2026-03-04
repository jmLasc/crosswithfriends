# Phase 6: Data Integrity Analysis

**Created:** 2026-03-04
**Phase:** 06-data-integrity-analysis
**Depends on:** Phase 2 (Census), Phase 3 (Overlap), Phase 5 (Writes)
**Purpose:** Timestamp dependency chain analysis (DATA-03) and Firebase-only data inventory (DATA-04)

---

## Executive Summary

This document provides the data integrity foundation for Phase 7 (Removal Path Assessment) and Phase 9 (PostgreSQL Schema Analysis). It adds the *integrity analysis layer* on top of the read/write traces from Phases 4 and 5, connecting timestamps to data correctness and consolidating the Firebase-only data inventory with risk calibration.

**Timestamp chain finding:** Three distinct timestamp mechanisms exist in the codebase -- `SERVER_TIME` (a Firebase sentinel resolved server-side), `getTime()` (client-side `Date.now() + offset`), and `Date.now()` (raw client clock, dead with battle removal). The critical discovery is the `assignTimestamp()` ordering constraint: client-side `SERVER_TIME` replacement MUST happen before `assignTimestamp()` removal. The reverse order corrupts PostgreSQL data by storing raw `{'.sv':'timestamp'}` sentinel objects as JSON in the `ts` column and `event_payload` JSONB. All 7 `getTime()` call sites (definition + 6 consumers) can safely be replaced with `Date.now()` -- the offset is typically less than 1 second and is read only once at page load, meaning it becomes stale during long sessions.

**Firebase-only data finding:** Seven active RTDB path patterns have no PostgreSQL equivalent, with `user/{id}/history` rated as the highest-priority gap (HIGH severity). Guest users have zero PG fallback -- removing Firebase loses ALL game history for guests because `pgStatuses = {}` when `user?.id` is falsy. The legacy `solo` key variant in user history has a completely different data format with no PG equivalent and remains a decision-gate unknown. Five additional dead/legacy paths (battle, logSolve stats) require no migration action.

---

## Summary Table

Quick-scan reference for all timestamp call sites and Firebase-only paths.

### Timestamp Call Sites

| # | Call Site | Mechanism | Destination | Replace With | Risk |
|---|-----------|-----------|-------------|-------------|------|
| 1 | `firebase.js:40` | getTime() definition | N/A (definition) | `Date.now()` (remove offset) | LOW |
| 2 | `user.js:67` | getTime() | Firebase RTDB `user/{id}/history/{gid}.time` | `Date.now()` | LOW |
| 3 | `puzzle.js:54` | getTime() | Game create event payload (`createTime` field) | `Date.now()` | LOW |
| 4 | `Game.js:405` | getTime() | Client-side comparison (unaccounted solve time) | `Date.now()` | LOW |
| 5 | `Clock.js:51` | getTime() | Client-side display (clock elapsed time) | `Date.now()` | LOW |
| 6 | `Clock.js:78` | getTime() | Client-side comparison (cap check) | `Date.now()` | LOW |
| 7 | `Player.js:399` | getTime() | Client-side comparison (cursor timeout) | `Date.now()` | LOW |
| 8 | `game.js:213-391` | SERVER_TIME (x14 event types) | Socket.IO -> assignTimestamp() -> PG `game_events.ts` | `Date.now()` on client | LOW (with ordering constraint) |
| 9 | `game.js:192` | SERVER_TIME (direct .set()) | Firebase RTDB `game/{gid}/archivedEvents/unarchivedAt` | `Date.now()` or remove write | LOW |
| 10 | `demoGame.js:133` | SERVER_TIME | Demo create event (client-side only, not resolved) | `Date.now()` | LOW |

### Firebase-Only Data Paths

| # | RTDB Path | Risk Level | Status | Migration Priority |
|---|-----------|------------|--------|-------------------|
| 1 | `user/{id}/history/{gid}` | HIGH | Active | P0 -- highest priority |
| 2 | `user/{id}/history.solo` | MEDIUM | Active (legacy read) | P1 -- requires format investigation |
| 3 | `game/{gid}/archivedEvents` | MEDIUM | Active (rare, LIVE-03 unknown) | P2 -- conditional on live data |
| 4 | `counters/gid` | MEDIUM | Active (legacy) | P2 -- conditional on LIVE-02 |
| 5 | `user/{id}/names/{username}` | LOW | Active | P3 -- informational data only |
| 6 | `.info/serverTimeOffset` | LOW | Active | P3 -- trivially replaceable |
| 7 | `game/{gid}/archivedEvents/unarchivedAt` | LOW | Active (rare) | P3 -- workflow metadata |
| 8 | `battle/*` (7 paths) | NONE | DEAD | N/A -- being removed in PR #352 |
| 9 | `stats/{pid}/solves/{gid}` | NONE | DEAD | N/A -- logSolve never wired |
| 10 | `puzzlelist/{pid}/stats/numSolves` | NONE | DEAD | N/A -- logSolve never wired |

---

## Section 1: Timestamp Dependency Chain (DATA-03)

### 1.1 Three Timestamp Mechanisms Overview

The codebase uses three distinct timestamp mechanisms, each with different accuracy characteristics, resolution points, and integrity implications.

| Mechanism | Definition Location | How It Works | Destination | Integrity Implications | Status |
|-----------|-------------------|--------------|-------------|----------------------|--------|
| **SERVER_TIME** (event payload path) | `firebase.js:32` -- `firebase.database.ServerValue.TIMESTAMP` | Sentinel object `{'.sv':'timestamp'}` embedded in event payloads; sent through Socket.IO; `assignTimestamp()` on the Node.js server recursively replaces sentinels with `Date.now()` before PG insert | Socket.IO -> `SocketManager.assignTimestamp()` -> PG `game_events.ts` column | **Server-authoritative.** Single clock source (Node.js server). All game events get consistent timestamps from the same server clock. The sentinel is never resolved by Firebase in this path. | Active (~14 event types in game.js) |
| **SERVER_TIME** (direct Firebase path) | `firebase.js:32` (same constant) | Same sentinel, but passed directly to Firebase RTDB `.set()` call; Firebase server resolves it to Firebase's server clock | Firebase RTDB (direct write) | **Firebase-authoritative.** Different clock source than PG events (Firebase server vs Node.js server). Only 1 active usage. | Active (1 use: `game.js:192` unarchive) |
| **getTime()** | `firebase.js:40-42` -- `Date.now() + offset` | Reads `.info/serverTimeOffset` once at page load; offset is the difference between client clock and Firebase server clock; `getTime()` adds this offset to `Date.now()` | Firebase RTDB (user history), game create event payload, client-side display/comparison | **Client-estimated server time.** Offset captured once, never refreshed. Becomes stale during multi-hour sessions. Typical offset is less than 1 second. | Active (6 consumer call sites) |
| **Date.now()** | Native JavaScript | Raw client clock with zero server-time correction | Firebase RTDB (battle timestamps) | **No synchronization.** If client clock is wrong, stored timestamps are wrong. Inconsistent with other mechanisms. | **DEAD** (battle.js only, confirmed dead, PR #352 removing) |

**Key distinction:** `SERVER_TIME` takes two completely different paths depending on whether it is used in a Socket.IO event payload (where `assignTimestamp()` resolves it with `Date.now()`) or in a direct Firebase `.set()` call (where Firebase RTDB resolves it server-side). Treating all `SERVER_TIME` usages as equivalent misses the unarchive direct-write case at `game.js:192`.

### 1.2 getTime() Call Site Analysis

The `getTime()` function is defined at `firebase.js:40-42` and consumed by 6 call sites across 5 files. The function returns `Date.now() + offset` where `offset` is read once from `.info/serverTimeOffset` at page load (`firebase.js:34-38`).

**Offset staleness note:** The offset is read once via `.once('value')` and never refreshed. During multi-hour solving sessions, the offset becomes stale as the client clock drifts. Replacing `getTime()` with `Date.now()` (zero offset) may actually be *more consistent* than a stale offset, since the offset was only accurate at the moment of page load.

| # | File:Line | Component/Feature | Current Mechanism | Data Flow | Replacement: `Date.now()` | Replacement: `GET /api/time` | Risk Level |
|---|-----------|-------------------|-------------------|-----------|--------------------------|----------------------------|------------|
| 1 | `firebase.js:40` | Definition | `Date.now() + offset` where offset from `.info/serverTimeOffset` | N/A (definition, not a call site) | Remove offset, return `Date.now()` directly | Replace offset read with periodic `GET /api/time` calls | N/A |
| 2 | `user.js:67` | User history -- joinGame timestamp | `getTime()` -> `time` field in `{pid, solved, time, v2}` | Firebase RTDB `user/{id}/history/{gid}.time` | Timestamp changes by up to the offset amount (typically <1s). Stored time uses raw client clock instead of estimated server time. Negligible practical impact -- this timestamp is only used for display ordering. | More accurate than current approach (refreshable server time vs stale offset). Adds network dependency for a non-critical timestamp. Over-engineered for this use case. | LOW |
| 3 | `puzzle.js:54` | Puzzle -- game creation time | `getTime()` -> `createTime` field in game object | Embedded in create event payload `params.game.createTime`. Flows through Socket.IO to PG `event_payload` JSONB. **Not** the `timestamp` field that `assignTimestamp()` replaces -- this is a data field inside the payload. | `createTime` uses raw client time. Difference from current: up to the offset amount (<1s). `createTime` is a metadata field, not used for ordering or integrity checks. | Unnecessary complexity for a metadata timestamp. | LOW |
| 4 | `Game.js:405` | Game page -- unaccounted solve time | `getTime()` -> compared against `gameClock.lastUpdated` | Client-side calculation only. `gameClock.lastUpdated` was set server-side via `assignTimestamp()`. This is a **cross-clock comparison**: client-estimated server time vs server-assigned timestamp. Result: `unaccountedTime = getTime() - gameClock.lastUpdated`. | Uses `Date.now()` instead of `Date.now() + offset`. The comparison becomes `Date.now() - serverTimestamp`. With typical offset <1s, the unaccounted time changes by <1 second. Used only to add remaining elapsed time when recording a solve -- negligible impact. | Replaces one imprecise cross-clock comparison with another slightly different imprecise comparison. No practical improvement for this use case. | LOW |
| 5 | `Clock.js:51` | Clock display -- elapsed time | `getTime()` -> `now` variable -> `now - start` for elapsed display | Client-side display only. `start` is `this.props.startTime`, which was set server-side. Cross-clock comparison: `clientEstimatedServerTime - serverAssignedStart`. | Uses `Date.now() - serverAssignedStart`. Timer display changes by <1s. Users will not notice because the timer updates every 1 second (interval at `Clock.js:39`). | Over-engineered -- timer display does not need sub-second accuracy from a server endpoint. | LOW |
| 6 | `Clock.js:78` | Clock display -- cap check | `getTime()` -> `now > start + MAX_CLOCK_INCREMENT` | Client-side comparison. Checks if elapsed time exceeds maximum allowed clock increment. Cross-clock comparison against server-assigned `startTime`. | `Date.now() > serverAssignedStart + MAX_CLOCK_INCREMENT`. Cap check threshold shifts by <1s. `MAX_CLOCK_INCREMENT` is a large value (minutes to hours), so <1s difference is negligible. | Same analysis as site 5. | LOW |
| 7 | `Player.js:399` | Player -- cursor timeout filter | `getTime()` -> `currentTime` -> `cursor.timestamp > currentTime - CURSOR_TIMEOUT` | Client-side comparison. `cursor.timestamp` was set server-side via `assignTimestamp()`. `CURSOR_TIMEOUT` is 60000ms (60 seconds). Cross-clock comparison. | `Date.now()` instead of `Date.now() + offset`. Cursor timeout threshold shifts by <1s against a 60-second window. A cursor that should time out at exactly 60.0s might time out at 59.5s or 60.5s instead. Imperceptible to users. | Same analysis as sites 4-6. | LOW |

**Summary:** All 6 consumer call sites can safely be replaced with `Date.now()`. Sites 4-7 are cross-clock comparisons where the client-estimated server time is compared against server-assigned timestamps. The typical offset is less than 1 second, and the comparison windows are large (60 seconds for cursor timeout, minutes/hours for clock cap). Site 2 writes to Firebase RTDB -- the stored timestamp changes by up to the offset amount, which is negligible for display ordering. Site 3 writes a metadata field in the game create event payload -- also negligible.

No new server endpoint (`GET /api/time`) is needed for `getTime()` replacement. `Date.now()` is sufficient for all use cases.

### 1.3 SERVER_TIME Call Site Analysis

`SERVER_TIME` is defined at `firebase.js:32` as `firebase.database.ServerValue.TIMESTAMP` (runtime value: `{'.sv': 'timestamp'}`). It is used in two fundamentally different contexts.

#### A. Socket.IO Path (assignTimestamp resolves)

All ~14 event types in `game.js` embed `timestamp: SERVER_TIME` in event payloads sent through `this.addEvent()`. These events flow through Socket.IO to the server, where `assignTimestamp()` at `SocketManager.ts:14-27` recursively replaces the sentinel with `Date.now()`. The resolved timestamp is stored in PG `game_events.ts` column.

| # | Event Type | Method | Line | SERVER_TIME Locations | Persisted? | Notes |
|---|-----------|--------|------|----------------------|------------|-------|
| 1 | `updateCell` | `updateCell()` | 213 | `timestamp` | Yes | Grid cell change |
| 2 | `updateCursor` | `updateCursor()` | 228 | `timestamp` + `params.timestamp` | **No** (ephemeral) | Broadcast-only, not persisted to PG |
| 3 | `addPing` | `addPing()` | 240 | `timestamp` + `params.timestamp` | **No** (ephemeral) | Broadcast-only, not persisted to PG |
| 4 | `updateDisplayName` | `updateDisplayName()` | 252 | `timestamp` | Yes | Display name change |
| 5 | `updateColor` | `updateColor()` | 263 | `timestamp` | Yes | Player color change |
| 6 | `updateClock` | `updateClock()` | 274 | `timestamp` + `params.timestamp` | Yes | Clock start/pause action |
| 7 | `check` | `check()` | 285 | `timestamp` | Yes | Check cells correctness |
| 8 | `reveal` | `reveal()` | 295 | `timestamp` | Yes | Reveal cells |
| 9 | `reset` | `reset()` | 304 | `timestamp` | Yes | Reset cells |
| 10 | `markSolved` | `markSolved()` | 316 | `timestamp` | Yes | Mark puzzle solved |
| 11 | `unmarkSolved` | `unmarkSolved()` | 324 | `timestamp` | Yes | Unmark puzzle solved |
| 12 | `chat` (message) | `chat()` | 332 | `timestamp` | Yes | Chat message |
| 13 | `sendChatMessage` | `chat()` | 341 | `timestamp` | Yes | Fencing chat relay |
| 14 | `create` | `initialize()` | 391 | `timestamp` | Yes | Game creation event |

**Note on dual-timestamp events:** `updateCursor` (#2), `addPing` (#3), and `updateClock` (#6) embed `SERVER_TIME` in **both** the top-level `timestamp` and `params.timestamp`. The recursive `assignTimestamp()` walk replaces all sentinel instances within the event object.

**Note on ephemeral events:** `updateCursor` and `addPing` are in the `EPHEMERAL_EVENT_TYPES` set at `SocketManager.ts:32`. They are broadcast to connected clients but NOT persisted to PG `game_events`. The sentinel is still resolved by `assignTimestamp()` before broadcast.

**demoGame.js:133 -- SERVER_TIME in demo create event:**

`demoGame.js` extends the `Game` class and uses `SERVER_TIME` in a hardcoded demo create event at line 133:
```javascript
timestamp: SERVER_TIME,
type: 'create',
```

However, `demoGame.js` does **not** call `this.addEvent()` for this event. Instead, it pushes the event directly to `this.events` at line 136 (`this.events.push(s)`). The `events` array is the local client-side event list -- this event never flows through Socket.IO and never reaches `assignTimestamp()`. The `SERVER_TIME` sentinel (`{'.sv':'timestamp'}`) remains as a raw object in the client-side demo event. This is a **client-side-only usage** where the sentinel is never resolved to an actual timestamp.

Impact: When the demo game processes this event client-side, the `timestamp` field is the raw sentinel object `{'.sv':'timestamp'}` rather than a numeric timestamp. Any code that treats `event.timestamp` as a number will get unexpected behavior. However, demo games are synthetic/tutorial experiences and this has no data integrity implications for production data.

#### B. Firebase RTDB Path (Firebase resolves)

The **only** active `SERVER_TIME` usage that goes directly to Firebase RTDB:

**`game.js:192` -- unarchive timestamp:**
```javascript
this.ref.child('archivedEvents/unarchivedAt').set(SERVER_TIME);
```

This writes the sentinel `{'.sv':'timestamp'}` directly to Firebase RTDB at path `game/{gid}/archivedEvents/unarchivedAt`. Firebase resolves it server-side to the Firebase server's clock. This is fundamentally different from the Socket.IO path:
- **Clock source:** Firebase server clock (not Node.js server clock)
- **Resolution point:** Firebase RTDB server (not `assignTimestamp()`)
- **Data store:** Firebase RTDB only (never reaches PG)

This is the only `SERVER_TIME` usage that would break if Firebase is removed without replacement. However, the unarchive flow itself is conditional on LIVE-03 (whether archived games exist in production) and writes to a Firebase-only path. If the unarchive flow is removed as part of Firebase cleanup, this `SERVER_TIME` usage is removed with it.

### 1.4 assignTimestamp() Safeguard Analysis

`assignTimestamp()` at `SocketManager.ts:14-27` is the server-side function that replaces `SERVER_TIME` sentinels with actual timestamps before PG storage.

**Function definition (`SocketManager.ts:14-27`):**
```typescript
function assignTimestamp(event: SocketEvent) {
  if (event && typeof event === 'object') {
    if (event['.sv'] === 'timestamp') {
      return Date.now();
    }
    const result = event.constructor();
    for (const key in event) {
      result[key] = assignTimestamp(event[key]);
    }
    return result;
  }
  return event;
}
```

**Call sites:**
- Line 44: `const gameEvent: GameEvent = assignTimestamp(event);` -- called for every game event
- Line 52: `const roomEvent: RoomEvent = assignTimestamp(event);` -- called for every room event

**Downstream PG insert:** After `assignTimestamp()` resolves the sentinel, the event is passed to `addGameEvent()` which stores it in PG. The `ts` column is populated from `new Date(event.timestamp).toISOString()` -- this requires `event.timestamp` to be a numeric millisecond timestamp.

#### Bidirectional Dependency Chain

**Scenario 1: Removing assignTimestamp() BEFORE replacing SERVER_TIME in client code -- BREAKS**

If `assignTimestamp()` is removed while client code still sends `timestamp: SERVER_TIME` (i.e., `{'.sv': 'timestamp'}`), the sentinel object flows through to PG storage unchanged:

1. Client sends event with `timestamp: {'.sv': 'timestamp'}`
2. Without `assignTimestamp()`, the sentinel is not replaced
3. `addGameEvent()` receives the event with the raw sentinel object
4. `new Date({'.sv': 'timestamp'}).toISOString()` produces `"Invalid Date"` -- corrupts the `ts` column
5. The `event_payload` JSONB stores the raw `{'.sv': 'timestamp'}` object instead of a numeric timestamp
6. **Result:** PostgreSQL data corruption -- invalid timestamps in `ts` column, malformed payload data

**Scenario 2: Replacing SERVER_TIME with Date.now() on client BEFORE removing assignTimestamp() -- SAFE**

If client code is updated to send `timestamp: Date.now()` instead of `timestamp: SERVER_TIME`:

1. Client sends event with `timestamp: 1709582400000` (a numeric value)
2. `assignTimestamp()` recursively walks the event object
3. No objects match `event['.sv'] === 'timestamp'` -- the function passes through all values unchanged
4. `addGameEvent()` receives the event with a valid numeric timestamp
5. `new Date(1709582400000).toISOString()` produces a valid ISO string
6. **Result:** Everything works correctly. The timestamp comes from the client's `Date.now()` instead of the server's `Date.now()`, but the format is correct and the difference is negligible for non-critical timestamps.

#### Critical Ordering Constraint

**Client-side SERVER_TIME replacement MUST happen before assignTimestamp() removal. The reverse order corrupts PostgreSQL data.**

This ordering constraint is the key input for Phase 7's removal step dependency graph. The safe migration sequence is:

1. Replace all `SERVER_TIME` usages in client code with `Date.now()` (or server-provided timestamp)
2. Verify `assignTimestamp()` passes through numeric timestamps without modification
3. Remove `assignTimestamp()` from `SocketManager.ts` (now a no-op for all events)
4. Remove `SERVER_TIME` constant definition from `firebase.js`

`assignTimestamp()` MUST remain in place as a safeguard until Step 1 is fully deployed and verified. Even though it becomes a no-op after client-side replacement, keeping it during the transition period prevents data corruption if any client still sends the old sentinel format (e.g., cached client code, delayed deployments).

### 1.5 Replacement Strategy Matrix

Per-call-site recommendation for timestamp mechanism replacement.

#### getTime() Call Sites

| Call Site | Replace With | Rationale | Risk | Phase 7 Prerequisite |
|-----------|-------------|-----------|------|---------------------|
| `firebase.js:40` (definition) | `Date.now()` (remove offset logic entirely) | Offset is <1s, read once, becomes stale. `Date.now()` is simpler and more predictable. | LOW | Remove `.info/serverTimeOffset` read at lines 34-38 simultaneously |
| `user.js:67` (joinGame time) | `Date.now()` | Timestamp used for display ordering in user history. <1s difference is imperceptible. | LOW | None -- can replace independently |
| `puzzle.js:54` (createTime) | `Date.now()` | Metadata field in game creation. Not used for ordering or integrity. | LOW | None -- can replace independently |
| `Game.js:405` (unaccounted time) | `Date.now()` | Cross-clock comparison against server-assigned timestamp. <1s change in unaccounted time calculation. | LOW | None -- can replace independently |
| `Clock.js:51` (clock display) | `Date.now()` | Timer display updates every 1s. <1s offset change is imperceptible. | LOW | None -- can replace independently |
| `Clock.js:78` (cap check) | `Date.now()` | Comparison against large time window. <1s change is negligible. | LOW | None -- can replace independently |
| `Player.js:399` (cursor timeout) | `Date.now()` | 60s timeout window. <1s change is negligible. | LOW | None -- can replace independently |

**All `getTime()` sites can be replaced in a single commit.** No new `GET /api/time` endpoint is needed. The replacement is `getTime()` -> `Date.now()`, followed by removing the `getTime` function, the `offset` variable, and the `.info/serverTimeOffset` read from `firebase.js`.

#### SERVER_TIME in Socket.IO Events (game.js)

| Call Site | Replace With | Rationale | Risk | Phase 7 Prerequisite |
|-----------|-------------|-----------|------|---------------------|
| `game.js:213-391` (14 event types) | `Date.now()` on client side | `assignTimestamp()` continues to work (passes through numbers). Client `Date.now()` is acceptable because the server `Date.now()` in `assignTimestamp()` is also not NTP-synced -- both are "best effort" timestamps. | LOW | **Critical: must complete BEFORE removing assignTimestamp()** |

After all 14 event types use `Date.now()` instead of `SERVER_TIME`, `assignTimestamp()` becomes a no-op and can be removed in a subsequent step.

#### SERVER_TIME in Direct Firebase Write

| Call Site | Replace With | Rationale | Risk | Phase 7 Prerequisite |
|-----------|-------------|-----------|------|---------------------|
| `game.js:192` (unarchive unarchivedAt) | `Date.now()` directly, OR remove the write entirely | This writes to Firebase RTDB only. If unarchive flow is removed (conditional on LIVE-03 resolution), this write disappears with it. If kept, `Date.now()` is acceptable for a one-time "when was this unarchived" metadata timestamp. | LOW | Resolve LIVE-03 (archivedEvents presence) |

#### SERVER_TIME in Demo Game

| Call Site | Replace With | Rationale | Risk | Phase 7 Prerequisite |
|-----------|-------------|-----------|------|---------------------|
| `demoGame.js:133` | `Date.now()` | Currently the sentinel is never resolved (client-side only, never reaches `assignTimestamp()`). Replacing with `Date.now()` actually *fixes* the demo game timestamp to be a valid number instead of a raw sentinel object. | LOW (improvement) | None -- independent of main migration |

---

## Section 2: Firebase-Only Data Inventory (DATA-04)

*Placeholder -- completed in Task 2.*

---

## Cross-Phase References

*Placeholder -- completed in Task 2.*
