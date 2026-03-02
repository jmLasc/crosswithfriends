import {pool} from './pool';

interface CellState {
  black?: boolean;
  isImage?: boolean;
  value?: string;
}

/**
 * Compute percent complete for a batch of games by replaying their events.
 * Returns a map of gid → percentComplete (0–100).
 */
export async function computeGamesProgress(gids: string[]): Promise<Map<string, number>> {
  if (gids.length === 0) return new Map();

  const startTime = Date.now();

  // Fetch all events for these games in one query, ordered by timestamp
  const result = await pool.query(
    `SELECT gid, event_type, event_payload
     FROM game_events
     WHERE gid = ANY($1)
     ORDER BY gid, ts ASC`,
    [gids]
  );

  // Group events by gid
  const eventsByGid = new Map<string, any[]>();
  for (const row of result.rows) {
    const list = eventsByGid.get(row.gid) || [];
    list.push(row);
    eventsByGid.set(row.gid, list);
  }

  const progressMap = new Map<string, number>();

  for (const gid of gids) {
    const events = eventsByGid.get(gid) || [];
    const percent = computeSingleGameProgress(events);
    progressMap.set(gid, percent);
  }

  const ms = Date.now() - startTime;
  console.log(`computeGamesProgress for ${gids.length} games took ${ms}ms`);

  return progressMap;
}

function computeSingleGameProgress(events: any[]): number {
  let grid: CellState[][] | null = null;
  let solution: string[][] | null = null;

  for (const event of events) {
    const payload = event.event_payload;
    const type = event.event_type || payload.type;

    if (type === 'create') {
      grid = payload.params?.game?.grid;
      solution = payload.params?.game?.solution;
    } else if (type === 'updateCell' && grid) {
      const {cell, value} = payload.params || {};
      const gridCell = cell && grid[cell.r]?.[cell.c];
      if (gridCell && !gridCell.black) {
        grid[cell.r][cell.c] = {...gridCell, value: value || ''};
      }
    } else if (type === 'reveal' && grid && solution) {
      const scope: {r: number; c: number}[] = payload.params?.scope || [];
      for (const {r, c} of scope) {
        const gridCell = grid[r]?.[c];
        if (gridCell && solution[r]?.[c]) {
          grid[r][c] = {...gridCell, value: solution[r][c]};
        }
      }
    } else if (type === 'reset' && grid) {
      const scope: {r: number; c: number}[] = payload.params?.scope || [];
      for (const {r, c} of scope) {
        const gridCell = grid[r]?.[c];
        if (gridCell) {
          grid[r][c] = {...gridCell, value: ''};
        }
      }
    }
  }

  if (!grid) return 0;

  let total = 0;
  let filled = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (!cell.black && !cell.isImage) {
        total += 1;
        if (cell.value && cell.value !== '') filled += 1;
      }
    }
  }

  if (total === 0) return 0;
  const percent = Math.round((filled / total) * 100);
  return filled < total ? Math.min(percent, 99) : 100;
}
