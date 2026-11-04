import { httpsCallable } from 'firebase/functions';
import type { ApiErrorCode, ApiResult, GameMode, TurnTimer } from '@shared';
import { firebase } from '../firebase/client';
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

/** Calls a backend function and unwraps the ApiResult contract. Network failures become retryable INTERNAL errors. */
export async function call<T>(name: string, data: unknown = {}): Promise<T> {
  let result: ApiResult<T>;
  try {
    const fn = httpsCallable<unknown, ApiResult<T>>(firebase().functions, name, { timeout: 20_000 });
    result = (await fn(data)).data;
  } catch {
    throw new ApiClientError('INTERNAL', 'Network problem – check your connection and retry', true);
  }
  if (!result.ok) throw new ApiClientError(result.error.code, result.error.message, result.error.retryable, result.error.correlationId);
  return result.data;
}

export interface RoomSettingsInput {
  maxPlayers: number;
  mode: GameMode;
  turnTimerSeconds: TurnTimer;
}

export const api = {
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
