import type {Request, Response, NextFunction} from 'express';
import path from 'path';
import fs from 'fs';
import {getGameInfo} from '../model/game';
import {getPuzzleInfo} from '../model/puzzle';
import {islinkExpanderBot, isFBMessengerCrawler} from '../../utils/link_preview_util';
import {InfoJson} from '../../src/shared/types';

/** Regex matching game/puzzle paths that should get dynamic OG tags */
const GAME_PATH_RE = /^\/(?:beta\/)?game\/([^/]+)$/;
const PLAY_PATH_RE = /^\/beta\/play\/([^/]+)$/;

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildOgHtml(info: InfoJson, canonicalUrl: string, ua: string): string {
  const title = escapeHtml(info.title || 'Cross with Friends');
  const author = info.author ? escapeHtml(info.author) : '';
  let description = 'Solve crossword puzzles together with friends in real time.';
  if (info.description) {
    description = escapeHtml(info.description);
  } else if (author) {
    description = `A crossword puzzle by ${author}`;
  }

  // Messenger only supports title + thumbnail, so combine fields
  const titleContent = isFBMessengerCrawler(ua)
    ? [info.title, info.author, info.description].filter(Boolean).map(escapeHtml).join(' | ')
    : title;

  const oembedUrl = author
    ? `https://crosswithfriends.com/api/oembed?author=${encodeURIComponent(info.author)}`
    : '';

  return `<!doctype html>
<html prefix="og: https://ogp.me/ns/website#">
  <head>
    <title>${titleContent}</title>
    <meta property="og:title" content="${titleContent}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="https://crosswithfriends.com/pwa-512x512.png" />
    <meta property="og:site_name" content="Cross with Friends" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${titleContent}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="https://crosswithfriends.com/pwa-512x512.png" />
    <meta name="theme-color" content="#6aa9f4" />
    ${oembedUrl ? `<link type="application/json+oembed" href="${escapeHtml(oembedUrl)}" />` : ''}
  </head>
  <body></body>
</html>`;
}

/**
 * Cache for the SPA index.html content.
 * When Render rewrites game/puzzle paths to the backend, non-bot requests
 * need to receive the SPA shell so the React app boots normally.
 */
let spaHtmlCache: string | null = null;

function getSpaHtml(): string | null {
  if (spaHtmlCache) return spaHtmlCache;

  // Try the production build directory first
  const buildIndex = path.join(__dirname, '..', '..', 'build', 'index.html');
  if (fs.existsSync(buildIndex)) {
    spaHtmlCache = fs.readFileSync(buildIndex, 'utf-8');
    return spaHtmlCache;
  }

  // Fall back to the source index.html (dev mode)
  const srcIndex = path.join(__dirname, '..', '..', 'index.html');
  if (fs.existsSync(srcIndex)) {
    spaHtmlCache = fs.readFileSync(srcIndex, 'utf-8');
    return spaHtmlCache;
  }

  return null;
}

/**
 * Middleware that intercepts game/puzzle URLs.
 * - Link-expanding bots get HTML with dynamic OG meta tags.
 * - Regular browsers get the SPA index.html so the React app boots normally.
 *   (Only relevant when Render rewrites route these paths to the backend.)
 */
export function ogTagsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isGamePath = GAME_PATH_RE.test(req.path) || PLAY_PATH_RE.test(req.path);
  if (!isGamePath) {
    next();
    return;
  }

  const ua = req.headers['user-agent'] || '';

  // Bot request — serve dynamic OG tags
  if (islinkExpanderBot(ua)) {
    const gameMatch = req.path.match(GAME_PATH_RE);
    if (gameMatch) {
      handleGameOg(gameMatch[1], res, ua);
      return;
    }
    const playMatch = req.path.match(PLAY_PATH_RE);
    if (playMatch) {
      handlePuzzleOg(playMatch[1], res, ua);
      return;
    }
  }

  // Non-bot request — serve the SPA shell if available (for Render rewrite setup)
  // When SERVE_STATIC is set, Express static middleware handles this instead, so skip.
  if (!process.env.SERVE_STATIC) {
    const spaHtml = getSpaHtml();
    if (spaHtml) {
      res.send(spaHtml);
      return;
    }
  }

  next();
}

async function handleGameOg(gid: string, res: Response, ua: string) {
  try {
    const info = (await getGameInfo(gid)) as InfoJson;
    if (!info || !info.title) {
      res.status(404).send('Game not found');
      return;
    }
    const canonicalUrl = `https://crosswithfriends.com/game/${gid}`;
    res.send(buildOgHtml(info, canonicalUrl, ua));
  } catch (err) {
    console.error(`[OG Tags] Error fetching game info for ${gid}:`, err);
    res.status(500).send('Error');
  }
}

async function handlePuzzleOg(pid: string, res: Response, ua: string) {
  try {
    const info = (await getPuzzleInfo(pid)) as InfoJson | null;
    if (!info) {
      res.status(404).send('Puzzle not found');
      return;
    }
    const canonicalUrl = `https://crosswithfriends.com/beta/play/${pid}`;
    res.send(buildOgHtml(info, canonicalUrl, ua));
  } catch (err) {
    console.error(`[OG Tags] Error fetching puzzle info for ${pid}:`, err);
    res.status(500).send('Error');
  }
}
