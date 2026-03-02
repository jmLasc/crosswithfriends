import {SERVER_URL} from './constants';

const BATCH_SIZE = 20;

async function fetchBatch(gids: string[]): Promise<Record<string, number>> {
  const resp = await fetch(`${SERVER_URL}/api/game-progress`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({gids}),
  });
  if (!resp.ok) return {};
  return await resp.json();
}

export async function fetchGameProgress(gids: string[]): Promise<Record<string, number>> {
  if (gids.length === 0) return {};
  try {
    // Batch into chunks of BATCH_SIZE to match backend limit
    const batches: string[][] = [];
    for (let i = 0; i < gids.length; i += BATCH_SIZE) {
      batches.push(gids.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(batches.map(fetchBatch));
    return Object.assign({}, ...results);
  } catch (e) {
    console.error('Failed to fetch game progress:', e);
    return {};
  }
}
