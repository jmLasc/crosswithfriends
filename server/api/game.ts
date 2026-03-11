import * as Sentry from '@sentry/node';
import express from 'express';
import {CreateGameResponse, CreateGameRequest, InfoJson, GetGameResponse} from '../../src/shared/types';

import {addInitialGameEvent} from '../model/game';
import {getPuzzleSolves, invalidateInProgressCacheForUser} from '../model/puzzle_solve';
import {getPuzzleInfo} from '../model/puzzle';
import {verifyAccessToken} from '../auth/jwt';
import {dismissGameForUser, undismissGameForUser} from '../model/game_dismissal';
import {invalidateUserGamesCacheForUser} from '../model/user_games';
import {getDfacIdsForUser} from '../model/user';

const router = express.Router();

/**
 * @openapi
 * /game:
 *   post:
 *     tags: [Games]
 *     summary: Create a new game
 *     description: Create a new game session for a puzzle.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gid, pid]
 *             properties:
 *               gid: {type: string, description: Game ID}
 *               pid: {type: string, description: Puzzle ID}
 *     responses:
 *       200:
 *         description: Game created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gid: {type: string}
 *       404: {description: Puzzle not found}
 */
router.post<{}, CreateGameResponse | {error: string}, CreateGameRequest>('/', async (req, res, next) => {
  try {
    const gid = await addInitialGameEvent(req.body.gid, req.body.pid);
    // Invalidate user games cache so the "Your Games" page reflects the new game immediately
    if (req.body.dfac_id) {
      invalidateUserGamesCacheForUser(req.body.dfac_id);
    }
    res.json({gid});
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Puzzle not found')) {
      console.error(`[POST /api/game] ${e.message} (gid=${req.body.gid}, pid=${req.body.pid})`);
      res.status(404).json({error: e.message});
    } else {
      console.error(`[POST /api/game] Unexpected error (gid=${req.body.gid}, pid=${req.body.pid}):`, e);
      Sentry.captureException(e, {extra: {gid: req.body.gid, pid: req.body.pid}});
      next(e);
    }
  }
});

/**
 * @openapi
 * /game/{gid}:
 *   get:
 *     tags: [Games]
 *     summary: Get game details
 *     description: Returns game info including title, author, solve duration, and size.
 *     parameters:
 *       - in: path
 *         name: gid
 *         required: true
 *         schema: {type: string}
 *         description: Game ID
 *     responses:
 *       200:
 *         description: Game details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gid: {type: string}
 *                 title: {type: string}
 *                 author: {type: string}
 *                 duration: {type: number, description: Solve time in ms}
 *                 size: {type: string}
 *       404: {description: Game not found}
 */
router.get<{gid: string}, GetGameResponse>('/:gid', async (req, res) => {
  try {
    const {gid} = req.params;

    const puzzleSolves = await getPuzzleSolves([gid]);

    if (puzzleSolves.length === 0) {
      return res.sendStatus(404);
    }

    const gameState = puzzleSolves[0];
    const puzzleInfo = (await getPuzzleInfo(gameState.pid)) as InfoJson;

    res.json({
      gid,
      title: gameState.title,
      author: puzzleInfo?.author || 'Unknown',
      duration: gameState.time_taken_to_solve,
      size: gameState.size,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching game state:', error);
    res.sendStatus(500);
  }
  return undefined;
});

/**
 * @openapi
 * /game/{gid}/dismiss:
 *   post:
 *     tags: [Games]
 *     summary: Dismiss a game
 *     description: Hide a game from the authenticated user's in-progress list.
 *     security: [{bearerAuth: []}]
 *     parameters:
 *       - in: path
 *         name: gid
 *         required: true
 *         schema: {type: string}
 *     responses:
 *       204: {description: Game dismissed}
 *       401: {description: Not authenticated}
 */
router.post<{gid: string}>('/:gid/dismiss', async (req, res, next) => {
  try {
    const {gid} = req.params;

    // Require auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.sendStatus(401);
    }
    const payload = verifyAccessToken(authHeader.slice(7));
    if (!payload) return res.sendStatus(401);

    // Per-user dismissal — only hides the game for this user
    await dismissGameForUser(payload.userId, gid);
    // Invalidate caches so dismissed game disappears immediately
    invalidateInProgressCacheForUser(payload.userId);
    const dfacIds = await getDfacIdsForUser(payload.userId);
    for (const dfacId of dfacIds) invalidateUserGamesCacheForUser(dfacId);
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
  return undefined;
});

/**
 * @openapi
 * /game/{gid}/undismiss:
 *   post:
 *     tags: [Games]
 *     summary: Undismiss a game
 *     description: Restore a dismissed game to the authenticated user's in-progress list.
 *     security: [{bearerAuth: []}]
 *     parameters:
 *       - in: path
 *         name: gid
 *         required: true
 *         schema: {type: string}
 *     responses:
 *       204: {description: Game restored}
 *       401: {description: Not authenticated}
 */
router.post<{gid: string}>('/:gid/undismiss', async (req, res, next) => {
  try {
    const {gid} = req.params;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.sendStatus(401);
    }
    const payload = verifyAccessToken(authHeader.slice(7));
    if (!payload) return res.sendStatus(401);

    await undismissGameForUser(payload.userId, gid);
    invalidateInProgressCacheForUser(payload.userId);
    const dfacIds = await getDfacIdsForUser(payload.userId);
    for (const dfacId of dfacIds) invalidateUserGamesCacheForUser(dfacId);
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
  return undefined;
});

export default router;
