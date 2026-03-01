import {pool} from './pool';

export async function dismissGameForUser(userId: string, gid: string): Promise<void> {
  await pool.query(`INSERT INTO game_dismissals (user_id, gid) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    userId,
    gid,
  ]);
}

export async function isGameDismissedByUser(userId: string, gid: string): Promise<boolean> {
  const {rows} = await pool.query(`SELECT 1 FROM game_dismissals WHERE user_id = $1 AND gid = $2`, [
    userId,
    gid,
  ]);
  return rows.length > 0;
}
