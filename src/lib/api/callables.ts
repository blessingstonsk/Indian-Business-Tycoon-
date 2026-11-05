import type { ApiErrorCode, ApiResult, GameMode, TurnTimer } from '@shared';
import { API_URL, getSession, setSession, type Session } from '../backend';
import type { GameArchiveDoc, UserDoc } from '../../domain/docs';

export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly correlationId?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, data: unknown, auth: boolean): Promise<T> {
  const session = getSession();
  let result: ApiResult<T>;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth && session ? { authorization: `Bearer ${session.token}` } : {}) },
      body: JSON.stringify(data ?? {}),
      signal: AbortSignal.timeout(20_000),
    });
    result = (await res.json()) as ApiResult<T>;
  } catch {
    throw new ApiClientError('INTERNAL', 'Network problem – check your connection and retry', true);
  }
  if (!result.ok) {
    if (result.error.code === 'UNAUTHENTICATED' && auth) setSession(null);
    throw new ApiClientError(result.error.code, result.error.message, result.error.retryable, result.error.correlationId);
  }
  return result.data;
}

/** Calls POST /api/<name> on the game server and unwraps the ApiResult contract. */
export const call = <T>(name: string, data: unknown = {}) => request<T>(`/api/${name}`, data, true);

export interface RoomSettingsInput {
  maxPlayers: number;
  mode: GameMode;
  turnTimerSeconds: TurnTimer;
}

type SignInResult = Session & { profile: UserDoc };

export const api = {
  signInWithGoogle: (credential: string) => request<SignInResult>('/auth/google', { credential }, false),
  signInTestUser: (name: string) => request<SignInResult>('/auth/dev', { name }, false),
  bootstrapProfile: () => call<UserDoc>('bootstrapProfile'),
  updateProfile: (input: { displayName?: string; allowFriendRequests?: UserDoc['privacy']['allowFriendRequests'] }) =>
    call<UserDoc>('updateProfile', input),
  deleteAccount: () => call<{ deleted: boolean }>('deleteAccount'),
  sendFriendRequest: (friendCode: string) => call<{ requestId: string }>('sendFriendRequest', { friendCode }),
  respondFriendRequest: (requestId: string, response: 'ACCEPT' | 'REJECT') => call('respondFriendRequest', { requestId, response }),
  cancelFriendRequest: (requestId: string) => call('cancelFriendRequest', { requestId }),
  removeFriend: (friendUid: string) => call('removeFriend', { friendUid }),
  getMyArchives: (cursor: number | null, pageSize = 10) =>
    call<{ items: GameArchiveDoc[]; nextCursor: number | null }>('getMyArchives', { cursor, pageSize }),
  createRoom: (input: RoomSettingsInput) => call<{ roomId: string; inviteCode: string }>('createRoom', input),
  joinRoom: (inviteCode: string) => call<{ roomId: string }>('joinRoom', { inviteCode }),
  leaveRoom: (roomId: string) => call('leaveRoom', { roomId }),
  kickMember: (roomId: string, uid: string) => call('kickMember', { roomId, uid }),
  setReady: (roomId: string, ready: boolean) => call('setReady', { roomId, ready }),
  chooseToken: (roomId: string, token: string) => call('chooseToken', { roomId, token }),
  updateRoomSettings: (roomId: string, input: RoomSettingsInput) => call('updateRoomSettings', { roomId, ...input }),
  startGame: (roomId: string) => call<{ gameId: string }>('startGame', { roomId }),
  inviteFriend: (roomId: string, friendUid: string) => call('inviteFriend', { roomId, friendUid }),
  dismissInvite: (inviteId: string) => call('dismissInvite', { inviteId }),
  sendReaction: (roomId: string, gameId: string | null, emoteId: string) =>
    call<{ acceptedAt: number }>('sendReaction', { roomId, gameId, emoteId, nonce: crypto.randomUUID() }),
  submitGameAction: (command: unknown) => call<{ version: number; eventCount: number; replayed: boolean }>('submitGameAction', command),
};
