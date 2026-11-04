// Firestore document shapes owned by the backend. Timestamps are UTC epoch milliseconds.
import type { GameMode, GameState, TurnTimer } from '../../../shared/index';

export type AllowFriendRequests = 'everyone' | 'friendsOfFriends' | 'nobody';

export interface UserDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  friendCode: string;
  friendCount: number;
  privacy: { allowFriendRequests: AllowFriendRequests };
  activeRoomIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PublicProfile {
  displayName: string;
  photoURL: string | null;
  friendCode: string;
}

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';

export interface RoomDoc {
  roomId: string;
  inviteCode: string;
  inviteCodeHash: string;
  hostUid: string;
  status: RoomStatus;
  maxPlayers: number;
  gameMode: GameMode;
  turnTimerSeconds: TurnTimer;
  memberUids: string[];
  gameId: string | null;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  expiresAt: number;
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

export interface InviteCodeDoc {
  roomId: string;
  expiresAt: number;
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

export interface ReactionDoc {
  id: string;
  roomId: string;
  gameId: string | null;
  uid: string;
  displayName: string;
  photoURL: string | null;
  emoteId: string;
  createdAt: number;
  ttlAt: number;
}

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface FriendRequestDoc {
  id: string;
  fromUid: string;
  toUid: string;
  participants: string[];
  from: PublicProfile;
  to: PublicProfile;
  status: FriendRequestStatus;
  createdAt: number;
  updatedAt: number;
}

export interface FriendshipDoc {
  pairId: string;
  uids: string[];
  profiles: Record<string, PublicProfile>;
  createdAt: number;
}

export type StoredGame = GameState & { eventSeq: number; lastActivityAt: number; stale?: boolean };

export interface EventDoc {
  sequence: number;
  commandId: string;
  actorUid: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
  versionAfter: number;
}

export interface CommandReceiptDoc {
  gameId: string;
  uidHash: string;
  commandId: string;
  result: { version: number; eventCount: number };
  createdAt: number;
  ttlAt: number;
}

export type ArchiveJobStatus = 'PENDING' | 'VERIFIED' | 'CLEANED' | 'FAILED';

export interface ArchiveJobDoc {
  gameId: string;
  roomId: string;
  status: ArchiveJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  verifiedAt: number | null;
  cleanupAfter: number | null;
  cleanedAt: number | null;
}

export interface ArchivePlayerSnapshot {
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
}

export interface GameArchiveDoc {
  gameId: string;
  roomId: string;
  rulesetVersion: string;
  playerSnapshots: ArchivePlayerSnapshot[];
  winnerUid: string | null;
  endReason: string | null;
  startedAt: number;
  completedAt: number;
  durationSeconds: number;
  totalTurns: number;
  eventSummary: { sequence: number; type: string; actorUid: string; createdAt: number; summary: string }[];
  archiveVersion: 1;
  participantUids: string[];
  retentionUntil: number;
}

export const PATHS = {
  user: (uid: string) => `users/${uid}`,
  friendCode: (code: string) => `friendCodes/${code}`,
  friendRequest: (id: string) => `friendRequests/${id}`,
  friendship: (pairId: string) => `friendships/${pairId}`,
  room: (roomId: string) => `rooms/${roomId}`,
  member: (roomId: string, uid: string) => `rooms/${roomId}/members/${uid}`,
  reaction: (roomId: string, id: string) => `rooms/${roomId}/reactions/${id}`,
  inviteCode: (hash: string) => `inviteCodes/${hash}`,
  roomInvite: (id: string) => `roomInvites/${id}`,
  game: (gameId: string) => `games/${gameId}`,
  gamePrivate: (gameId: string) => `games/${gameId}/private/state`,
  event: (gameId: string, seq: number) => `games/${gameId}/events/${String(seq).padStart(8, '0')}`,
  receipt: (id: string) => `commandReceipts/${id}`,
  archiveJob: (gameId: string) => `archiveJobs/${gameId}`,
  archive: (gameId: string) => `gameArchives/${gameId}`,
  rateLimit: (key: string) => `rateLimits/${key}`,
};

export const RETENTION = {
  lobbyInactivityMs: 24 * 60 * 60 * 1000,
  completedGraceMs: 60 * 60 * 1000,
  staleGameMs: 48 * 60 * 60 * 1000,
  abandonedGameMs: 14 * 24 * 60 * 60 * 1000,
  archiveMs: 365 * 24 * 60 * 60 * 1000,
  roomInviteMs: 24 * 60 * 60 * 1000,
  closedFriendRequestMs: 30 * 24 * 60 * 60 * 1000,
  receiptMs: 7 * 24 * 60 * 60 * 1000,
  inviteCodeMs: 24 * 60 * 60 * 1000,
  maxActiveRoomsPerUser: 5,
};
