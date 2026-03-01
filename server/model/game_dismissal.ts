import {pool} from './pool';

export async function dismissGameForUser(userId: string, gid: string): Promise<void> {
  await pool.query(`INSERT INTO game_dismissals (user_id, gid) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    userId,
    gid,
  ]);
}

export async function undismissGameForUser(userId: string, gid: string): Promise<void> {
  await pool.query(`DELETE FROM game_dismissals WHERE user_id = $1 AND gid = $2`, [userId, gid]);
}
