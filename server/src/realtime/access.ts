import type { Db, Filter } from '../db/types';
import type { GameArchiveDoc, StoredGame } from '../shared/model';

// Read permissions for live subscriptions. Clients can only read through these checks;
// every write goes through the HTTP API.

export interface QuerySpec {
  collection: string;
  where?: Filter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
}

const ID = '[A-Za-z0-9_-]+';
const re = (s: string) => new RegExp(`^${s}$`);

const P = {
  user: re(`users/(${ID})`),
  friendRequest: re(`friendRequests/${ID}`),
  friendship: re(`friendships/${ID}`),
  roomInvite: re(`roomInvites/${ID}`),
  room: re(`rooms/(${ID})`),
  roomChild: re(`rooms/(${ID})/(members|reactions)/${ID}`),
  game: re(`games/(${ID})`),
  gameEvent: re(`games/(${ID})/events/${ID}`),
  archive: re(`gameArchives/${ID}`),
  status: re(`status/${ID}`),
};

export async function isRoomMember(db: Db, roomId: string, uid: string): Promise<boolean> {
  return Boolean(await db.get(`rooms/${roomId}/members/${uid}`));
}

async function isGameMember(db: Db, gameId: string, uid: string, game?: StoredGame | null): Promise<boolean> {
  const g = game === undefined ? await db.get<StoredGame>(`games/${gameId}`) : game;
  return Boolean(g && (await isRoomMember(db, g.roomId, uid)));
}

/** May `uid` read the document at `path`? `data` is the current document (null if absent). */
export async function canReadDoc(db: Db, uid: string, path: string, data: Record<string, unknown> | null): Promise<boolean> {
  let m: RegExpMatchArray | null;
  if ((m = path.match(P.user))) return m[1] === uid;
  if ((m = path.match(P.status))) return true;
  if ((m = path.match(P.room)) || (m = path.match(P.roomChild))) return isRoomMember(db, m[1], uid);
  if ((m = path.match(P.game))) return data === null ? true : isGameMember(db, m[1], uid, data as unknown as StoredGame);
  if ((m = path.match(P.gameEvent))) return isGameMember(db, m[1], uid);
  if (data === null) return P.friendRequest.test(path) || P.friendship.test(path) || P.roomInvite.test(path) || P.archive.test(path);
  if (P.friendRequest.test(path)) return (data.participants as string[] | undefined)?.includes(uid) ?? false;
  if (P.friendship.test(path)) return (data.uids as string[] | undefined)?.includes(uid) ?? false;
  if (P.roomInvite.test(path)) return data.toUid === uid || data.fromUid === uid;
  if (P.archive.test(path)) return (data as unknown as GameArchiveDoc).participantUids?.includes(uid) ?? false;
  // games/{id}/private/*, receipts, rate limits, invite lookups, friend codes, archive jobs: server only.
  return false;
}

const hasFilter = (spec: QuerySpec, f: Filter) =>
  (spec.where ?? []).some(([field, op, value]) => field === f[0] && op === f[1] && value === f[2]);

/**
 * Only a fixed set of query shapes is allowed, each provably limited to the caller's data.
 * Top-level results are also filtered per document with canReadDoc as defence in depth.
 */
export async function canRunQuery(db: Db, uid: string, spec: QuerySpec): Promise<boolean> {
  if ((spec.limit ?? 0) > 200) return false;
  const c = spec.collection;
  if (c === 'friendships') return hasFilter(spec, ['uids', 'array-contains', uid]);
  if (c === 'friendRequests') return hasFilter(spec, ['participants', 'array-contains', uid]);
  if (c === 'roomInvites') return hasFilter(spec, ['toUid', '==', uid]);
  let m: RegExpMatchArray | null;
  if ((m = c.match(re(`rooms/(${ID})/(members|reactions)`)))) return isRoomMember(db, m[1], uid);
  if ((m = c.match(re(`games/(${ID})/events`)))) return isGameMember(db, m[1], uid);
  return false;
}
