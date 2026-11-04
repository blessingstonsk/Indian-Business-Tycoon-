import { DomainError, fail, FRIEND_CODE_LENGTH } from '../../../shared/index';
import { rateLimit, type Caller, type ServiceContext } from '../shared/context';
import { pairId, uidHash } from '../shared/ids';
import {
  PATHS,
  type AllowFriendRequests,
  type FriendRequestDoc,
  type FriendshipDoc,
  type GameArchiveDoc,
  type PublicProfile,
  type RoomDoc,
  type UserDoc,
} from '../shared/model';

function sanitizeName(name: string | null, uid: string): string {
  const clean = (name ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 24);
  return clean.length >= 2 ? clean : `Player ${uid.slice(0, 4).toUpperCase()}`;
}

export function publicProfile(u: UserDoc): PublicProfile {
  return { displayName: u.displayName, photoURL: u.photoURL, friendCode: u.friendCode };
}

export async function requireProfile(ctx: ServiceContext, uid: string): Promise<UserDoc> {
  const u = await ctx.db.get<UserDoc>(PATHS.user(uid));
  if (!u) fail('PERMISSION_DENIED', 'Finish setting up your profile first');
  return u;
}

/** Idempotent: creates the profile and a unique friend code on first sign-in. */
export async function bootstrapProfile(ctx: ServiceContext, caller: Caller): Promise<UserDoc> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = ctx.newCode(FRIEND_CODE_LENGTH);
    const result = await ctx.db.runTransaction(async (tx) => {
      const existing = await tx.get<UserDoc>(PATHS.user(caller.uid));
      if (existing) return existing;
      if (await tx.get(PATHS.friendCode(code))) return null;
      const now = ctx.clock.now();
      const user: UserDoc = {
        uid: caller.uid,
        displayName: sanitizeName(caller.name, caller.uid),
        photoURL: caller.picture && /^https:\/\//.test(caller.picture) ? caller.picture : null,
        friendCode: code,
        friendCount: 0,
        privacy: { allowFriendRequests: 'everyone' },
        activeRoomIds: [],
        createdAt: now,
        updatedAt: now,
      };
      tx.set(PATHS.user(caller.uid), user as unknown as Record<string, unknown>);
      tx.set(PATHS.friendCode(code), { uid: caller.uid });
      return user;
    });
    if (result) return result;
  }
  fail('INTERNAL', 'Could not allocate a friend code');
}

export async function updateProfile(
  ctx: ServiceContext,
  caller: Caller,
  input: { displayName?: string; allowFriendRequests?: AllowFriendRequests },
): Promise<UserDoc> {
  const user = await ctx.db.runTransaction(async (tx) => {
    const u = await tx.get<UserDoc>(PATHS.user(caller.uid));
    if (!u) fail('PERMISSION_DENIED', 'Profile not found');
    const next: UserDoc = {
      ...u,
      displayName: input.displayName ?? u.displayName,
      privacy: { allowFriendRequests: input.allowFriendRequests ?? u.privacy.allowFriendRequests },
      updatedAt: ctx.clock.now(),
    };
    tx.set(PATHS.user(caller.uid), next as unknown as Record<string, unknown>);
    return next;
  });
  if (input.displayName) {
    // Refresh denormalized snapshots on friendships so friend lists show the new name.
    const friendships = await ctx.db.query<FriendshipDoc>('friendships', [['uids', 'array-contains', caller.uid]]);
    for (const f of friendships) {
      await ctx.db.runTransaction(async (tx) => {
        const cur = await tx.get<FriendshipDoc>(f.path);
        if (cur) tx.update(f.path, { profiles: { ...cur.profiles, [caller.uid]: publicProfile(user) } });
      });
    }
  }
  return user;
}

async function friendUids(ctx: ServiceContext, uid: string): Promise<Set<string>> {
  const rows = await ctx.db.query<FriendshipDoc>('friendships', [['uids', 'array-contains', uid]]);
  return new Set(rows.flatMap((r) => r.data.uids.filter((u) => u !== uid)));
}

const NOT_FOUND_MSG = 'No player found with that friend code';

export async function sendFriendRequest(ctx: ServiceContext, caller: Caller, friendCode: string) {
  await rateLimit(ctx, `friendReq_${uidHash(caller.uid)}`, 10, 60 * 60 * 1000);
  const codeDoc = await ctx.db.get<{ uid: string }>(PATHS.friendCode(friendCode));
  if (!codeDoc) fail('NOT_FOUND', NOT_FOUND_MSG);
  const toUid = codeDoc.uid;
  if (toUid === caller.uid) fail('INVALID_ACTION', 'That is your own friend code');

  const target = await ctx.db.get<UserDoc>(PATHS.user(toUid));
  if (!target) fail('NOT_FOUND', NOT_FOUND_MSG);
  if (target.privacy.allowFriendRequests === 'nobody') fail('NOT_FOUND', NOT_FOUND_MSG);
  if (target.privacy.allowFriendRequests === 'friendsOfFriends') {
    const [mine, theirs] = await Promise.all([friendUids(ctx, caller.uid), friendUids(ctx, toUid)]);
    if (![...mine].some((u) => theirs.has(u))) fail('NOT_FOUND', NOT_FOUND_MSG);
  }

  const id = `${caller.uid}_${toUid}`;
  const reverseId = `${toUid}_${caller.uid}`;
  return ctx.db.runTransaction(async (tx) => {
    const me = await tx.get<UserDoc>(PATHS.user(caller.uid));
    if (!me) fail('PERMISSION_DENIED', 'Profile not found');
    if (await tx.get(PATHS.friendship(pairId(caller.uid, toUid)))) fail('INVALID_ACTION', 'You are already friends');
    const reverse = await tx.get<FriendRequestDoc>(PATHS.friendRequest(reverseId));
    if (reverse?.status === 'PENDING') fail('INVALID_ACTION', 'They already sent you a request – check your inbox');
    const existing = await tx.get<FriendRequestDoc>(PATHS.friendRequest(id));
    if (existing?.status === 'PENDING') return { requestId: id };
    const now = ctx.clock.now();
    const req: FriendRequestDoc = {
      id,
      fromUid: caller.uid,
      toUid,
      participants: [caller.uid, toUid],
      from: publicProfile(me),
      to: publicProfile(target),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    tx.set(PATHS.friendRequest(id), req as unknown as Record<string, unknown>);
    return { requestId: id };
  });
}

export async function respondFriendRequest(ctx: ServiceContext, caller: Caller, requestId: string, response: 'ACCEPT' | 'REJECT') {
  return ctx.db.runTransaction(async (tx) => {
    const req = await tx.get<FriendRequestDoc>(PATHS.friendRequest(requestId));
    if (!req || req.toUid !== caller.uid) fail('NOT_FOUND', 'Request not found');
    if (req.status !== 'PENDING') return { status: req.status };
    const now = ctx.clock.now();
    if (response === 'REJECT') {
      tx.update(PATHS.friendRequest(requestId), { status: 'REJECTED', updatedAt: now });
      return { status: 'REJECTED' as const };
    }
    const [a, b] = await Promise.all([tx.get<UserDoc>(PATHS.user(req.fromUid)), tx.get<UserDoc>(PATHS.user(req.toUid))]);
    if (!a || !b) fail('NOT_FOUND', 'Request not found');
    const id = pairId(a.uid, b.uid);
    const existing = await tx.get(PATHS.friendship(id));
    if (!existing) {
      const doc: FriendshipDoc = {
        pairId: id,
        uids: [a.uid, b.uid].sort(),
        profiles: { [a.uid]: publicProfile(a), [b.uid]: publicProfile(b) },
        createdAt: now,
      };
      tx.set(PATHS.friendship(id), doc as unknown as Record<string, unknown>);
      tx.update(PATHS.user(a.uid), { friendCount: a.friendCount + 1, updatedAt: now });
      tx.update(PATHS.user(b.uid), { friendCount: b.friendCount + 1, updatedAt: now });
    }
    tx.update(PATHS.friendRequest(requestId), { status: 'ACCEPTED', updatedAt: now });
    return { status: 'ACCEPTED' as const };
  });
}

export async function cancelFriendRequest(ctx: ServiceContext, caller: Caller, requestId: string) {
  return ctx.db.runTransaction(async (tx) => {
    const req = await tx.get<FriendRequestDoc>(PATHS.friendRequest(requestId));
    if (!req || req.fromUid !== caller.uid) fail('NOT_FOUND', 'Request not found');
    if (req.status === 'PENDING') tx.update(PATHS.friendRequest(requestId), { status: 'CANCELLED', updatedAt: ctx.clock.now() });
    return { status: 'CANCELLED' as const };
  });
}

export async function removeFriend(ctx: ServiceContext, caller: Caller, friendUid: string) {
  return ctx.db.runTransaction(async (tx) => {
    const path = PATHS.friendship(pairId(caller.uid, friendUid));
    const f = await tx.get<FriendshipDoc>(path);
    if (!f) return { removed: false };
    const [a, b] = await Promise.all([tx.get<UserDoc>(PATHS.user(caller.uid)), tx.get<UserDoc>(PATHS.user(friendUid))]);
    tx.delete(path);
    const now = ctx.clock.now();
    if (a) tx.update(PATHS.user(a.uid), { friendCount: Math.max(0, a.friendCount - 1), updatedAt: now });
    if (b) tx.update(PATHS.user(b.uid), { friendCount: Math.max(0, b.friendCount - 1), updatedAt: now });
    return { removed: true };
  });
}

export async function getMyArchives(ctx: ServiceContext, caller: Caller, cursor: number | null, pageSize: number) {
  const rows = await ctx.db.query<GameArchiveDoc>('gameArchives', [['participantUids', 'array-contains', caller.uid]], {
    orderBy: { field: 'completedAt', direction: 'desc' },
    startAfter: cursor ?? undefined,
    limit: pageSize,
  });
  const items = rows.map((r) => r.data);
  return { items, nextCursor: items.length === pageSize ? items[items.length - 1].completedAt : null };
}

/**
 * Removes profile, friend edges, pending requests and friend code; pseudonymizes the user
 * in archives other players keep. The callable layer then deletes the Auth identity.
 */
export async function deleteAccountData(ctx: ServiceContext, caller: Caller): Promise<void> {
  const user = await ctx.db.get<UserDoc>(PATHS.user(caller.uid));
  if (user) {
    for (const roomId of user.activeRoomIds) {
      const room = await ctx.db.get<RoomDoc>(PATHS.room(roomId));
      if (room && room.status === 'IN_PROGRESS') {
        throw new DomainError('INVALID_ACTION', 'Resign from your active games before deleting your account');
      }
    }
  }
  const { leaveRoom } = await import('../room-service/rooms');
  for (const roomId of user?.activeRoomIds ?? []) {
    try {
      await leaveRoom(ctx, caller, roomId);
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
    }
  }
  for (const f of await ctx.db.query<FriendshipDoc>('friendships', [['uids', 'array-contains', caller.uid]])) {
    const other = f.data.uids.find((u) => u !== caller.uid);
    if (other) await removeFriend(ctx, caller, other);
  }
  for (const r of await ctx.db.query<FriendRequestDoc>('friendRequests', [['participants', 'array-contains', caller.uid]])) {
    await ctx.db.deleteTree(r.path);
  }
  for (const inv of await ctx.db.query('roomInvites', [['toUid', '==', caller.uid]])) await ctx.db.deleteTree(inv.path);
  const pseudonym = `deleted-${uidHash(caller.uid)}`;
  for (const a of await ctx.db.query<GameArchiveDoc>('gameArchives', [['participantUids', 'array-contains', caller.uid]])) {
    await ctx.db.runTransaction(async (tx) => {
      const cur = await tx.get<GameArchiveDoc>(a.path);
      if (!cur) return;
      tx.update(a.path, {
        participantUids: cur.participantUids.filter((u) => u !== caller.uid),
        winnerUid: cur.winnerUid === caller.uid ? pseudonym : cur.winnerUid,
        playerSnapshots: cur.playerSnapshots.map((s) =>
          s.uid === caller.uid ? { ...s, uid: pseudonym, displayName: 'Deleted player', photoURL: null } : s,
        ),
      });
    });
  }
  if (user) await ctx.db.deleteTree(PATHS.friendCode(user.friendCode));
  await ctx.db.deleteTree(PATHS.user(caller.uid));
}
