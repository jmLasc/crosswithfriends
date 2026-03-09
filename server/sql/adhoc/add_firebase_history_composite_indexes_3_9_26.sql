-- Add composite indexes on firebase_history to reduce read amplification.
-- The (dfac_id, pid) index supports getUserGamesForPuzzle filtering.
-- The (dfac_id, solved) index supports getGuestPuzzleStatuses and getInProgressGames filtering.
-- Use CONCURRENTLY to avoid locking the table during creation.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_firebase_history_dfac_pid
  ON firebase_history (dfac_id, pid);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_firebase_history_dfac_solved
  ON firebase_history (dfac_id, solved);

-- The single-column dfac_id index is now redundant (composite indexes above cover it).
DROP INDEX CONCURRENTLY IF EXISTS idx_firebase_history_dfac;
