// ========== GET /api/puzzlelist ============

import {CreateGameRequest, CreateGameResponse} from '../shared/types';
import {SERVER_URL} from './constants';

export async function createGame(data: CreateGameRequest): Promise<CreateGameResponse> {
  const url = `${SERVER_URL}/api/game`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return resp.json();
}

export async function dismissGame(gid: string, accessToken: string): Promise<boolean> {
  const resp = await fetch(`${SERVER_URL}/api/game/${gid}/dismiss`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  return resp.ok;
}

export async function undismissGame(gid: string, accessToken: string): Promise<void> {
  await fetch(`${SERVER_URL}/api/game/${gid}/undismiss`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${accessToken}`},
  });
}
