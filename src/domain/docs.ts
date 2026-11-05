// Client-side views of the documents the game server stores and pushes (see server/src/shared/model.ts).
import type { GameState, TurnTimer, GameMode } from '@shared';

export interface UserDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  friendCode: string;
  friendCount: number;
  privacy: { allowFriendRequests: 'everyone' | 'friendsOfFriends' | 'nobody' };
  activeRoomIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PublicProfile {
  displayName: string;
  photoURL: string | null;
  friendCode: string;
}

export interface RoomDoc {
  roomId: string;
  inviteCode: string;
  hostUid: string;
  status: 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
  maxPlayers: number;
  gameMode: GameMode;
  turnTimerSeconds: TurnTimer;
  memberUids: string[];
  gameId: string | null;
  createdAt: number;
  lastActivityAt: number;
}

export interface MemberDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  token: string;
  ready: boolean;
  isHost: boolean;
  joinedAt: number;
}

export interface ReactionDoc {
  id: string;
  uid: string;
  displayName: string;
  emoteId: string;
  createdAt: number;
  /** Server-side expiry; the UI uses createdAt + REACTION_TTL_MS. */
  ttlAt: number;
}

export interface FriendRequestDoc {
  id: string;
  fromUid: string;
  toUid: string;
  from: PublicProfile;
  to: PublicProfile;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  createdAt: number;
}

export interface FriendshipDoc {
  pairId: string;
  uids: string[];
  profiles: Record<string, PublicProfile>;
  createdAt: number;
}

export interface RoomInviteDoc {
  id: string;
  roomId: string;
  inviteCode: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  createdAt: number;
  expiresAt: number;
}

export interface EventDoc {
  sequence: number;
  commandId: string;
  actorUid: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
  versionAfter: number;
}

export type GameDoc = GameState & { eventSeq: number; lastActivityAt: number; stale?: boolean };

export interface GameArchiveDoc {
  gameId: string;
  roomId: string;
  rulesetVersion: string;
  playerSnapshots: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    token: string;
    finalCash: number;
    netWorth: number;
    rank: number;
    propertiesOwned: number;
    rentCollected: number;
    biggestTrade: number;
  }[];
  winnerUid: string | null;
  endReason: string | null;
  startedAt: number;
  completedAt: number;
  durationSeconds: number;
  totalTurns: number;
  eventSummary: { sequence: number; type: string; summary: string; createdAt: number }[];
  participantUids: string[];
}
