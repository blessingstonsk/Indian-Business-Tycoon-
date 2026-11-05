import {
  createInitialGame,
  EMOTE_IDS,
  fail,
  INVITE_CODE_LENGTH,
  REACTION_LIMIT,
  REACTION_TTL_MS,
  RULESET,
  TOKEN_IDS,
  TOKENS,
  type GameEvent,
  type GameMode,
  type TurnTimer,
} from '../../../shared/index';
import { rateLimit, type Caller, type ServiceContext } from '../shared/context';
import { pairId, sha256, uidHash } from '../shared/ids';
import {
  PATHS,
  RETENTION,
  type FriendshipDoc,
  type InviteCodeDoc,
  type MemberDoc,
  type ReactionDoc,
  type RoomDoc,
  type RoomInviteDoc,
  type StoredGame,
  type UserDoc,
} from '../shared/model';
import { eventDocs } from '../game-engine/game-service';

export const inviteHash = (code: string) => sha256(`invite:${code}`);

type Data = Record<string, unknown>;
const asData = (v: object) => v as Data;

async function membersOf(ctx: ServiceContext, roomId: string): Promise<MemberDoc[]> {
  const rows = await ctx.db.query<MemberDoc>(`rooms/${roomId}/members`, [], { orderBy: { field: 'joinedAt', direction: 'asc' } });
  return rows.map((r) => r.data);
}

function requireMember(room: RoomDoc | null, uid: string): RoomDoc {
  if (!room) fail('ROOM_NOT_FOUND', 'Room not found');
  if (!room.memberUids.includes(uid)) fail('NOT_ROOM_MEMBER', 'You are not in this room');
  return room;
}

export async function createRoom(
  ctx: ServiceContext,
  caller: Caller,
  input: { maxPlayers: number; mode: GameMode; turnTimerSeconds: TurnTimer },
) {
  await rateLimit(ctx, `createRoom_${uidHash(caller.uid)}`, 5, 10 * 60 * 1000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = ctx.newCode(INVITE_CODE_LENGTH);
    const hash = inviteHash(inviteCode);
    const roomId = ctx.newId();
    const created = await ctx.db.runTransaction(async (tx) => {
      const user = await tx.get<UserDoc>(PATHS.user(caller.uid));
      if (!user) fail('PERMISSION_DENIED', 'Finish setting up your profile first');
      if (await tx.get(PATHS.inviteCode(hash))) return null;
      const rooms = await Promise.all(user.activeRoomIds.map((id) => tx.get<RoomDoc>(PATHS.room(id))));
      const live = user.activeRoomIds.filter((_, i) => rooms[i] && rooms[i]!.status !== 'ARCHIVED');
      if (live.length >= RETENTION.maxActiveRoomsPerUser) fail('RATE_LIMITED', 'Leave an old room before creating another');
      const now = ctx.clock.now();
      const room: RoomDoc = {
        roomId,
        inviteCode,
        inviteCodeHash: hash,
        hostUid: caller.uid,
        status: 'LOBBY',
        maxPlayers: input.maxPlayers,
        gameMode: input.mode,
        turnTimerSeconds: input.turnTimerSeconds,
        memberUids: [caller.uid],
        gameId: null,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        expiresAt: now + RETENTION.lobbyInactivityMs,
      };
      const member: MemberDoc = {
        uid: caller.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        token: TOKENS[0].id,
        ready: false,
        isHost: true,
        joinedAt: now,
      };
      tx.set(PATHS.room(roomId), asData(room));
      tx.set(PATHS.member(roomId, caller.uid), asData(member));
      tx.set(PATHS.inviteCode(hash), asData({ roomId, expiresAt: now + RETENTION.inviteCodeMs } satisfies InviteCodeDoc));
      tx.update(PATHS.user(caller.uid), { activeRoomIds: [...live, roomId], updatedAt: now });
      return { roomId, inviteCode };
    });
    if (created) return created;
  }
  fail('INTERNAL', 'Could not allocate a room code');
}

export async function joinRoom(ctx: ServiceContext, caller: Caller, inviteCode: string) {
  await rateLimit(ctx, `joinRoom_${uidHash(caller.uid)}`, 10, 60 * 1000);
  const lookup = await ctx.db.get<InviteCodeDoc>(PATHS.inviteCode(inviteHash(inviteCode)));
  if (!lookup || lookup.expiresAt < ctx.clock.now()) fail('ROOM_NOT_FOUND', 'That room code is not valid');
  const roomId = lookup.roomId;
  const members = await membersOf(ctx, roomId);
  return ctx.db.runTransaction(async (tx) => {
    const room = await tx.get<RoomDoc>(PATHS.room(roomId));
    if (!room) fail('ROOM_NOT_FOUND', 'That room code is not valid');
    if (room.memberUids.includes(caller.uid)) return { roomId, alreadyMember: true };
    if (room.status !== 'LOBBY') fail('ROOM_NOT_JOINABLE', 'This game has already started');
    if (room.memberUids.length >= room.maxPlayers) fail('ROOM_FULL', 'This room is full');
    const user = await tx.get<UserDoc>(PATHS.user(caller.uid));
    if (!user) fail('PERMISSION_DENIED', 'Finish setting up your profile first');
    if (user.activeRoomIds.length >= RETENTION.maxActiveRoomsPerUser) fail('RATE_LIMITED', 'Leave an old room before joining another');
    const freshMembers = await Promise.all(room.memberUids.map((u) => tx.get<MemberDoc>(PATHS.member(roomId, u))));
    const used = new Set([...members, ...freshMembers.filter(Boolean)].map((m) => m!.token));
    const token = TOKENS.find((t) => !used.has(t.id))!.id;
    const now = ctx.clock.now();
    const member: MemberDoc = {
      uid: caller.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      token,
      ready: false,
      isHost: false,
      joinedAt: now,
    };
    tx.set(PATHS.member(roomId, caller.uid), asData(member));
    tx.update(PATHS.room(roomId), {
      memberUids: [...room.memberUids, caller.uid],
      updatedAt: now,
      lastActivityAt: now,
      expiresAt: now + RETENTION.lobbyInactivityMs,
    });
    tx.update(PATHS.user(caller.uid), { activeRoomIds: [...user.activeRoomIds, roomId], updatedAt: now });
    return { roomId, alreadyMember: false };
  });
}

export async function setReady(ctx: ServiceContext, caller: Caller, roomId: string, ready: boolean) {
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(roomId)), caller.uid);
    if (room.status !== 'LOBBY') fail('ROOM_NOT_JOINABLE', 'The game has already started');
    const now = ctx.clock.now();
    tx.update(PATHS.member(roomId, caller.uid), { ready });
    tx.update(PATHS.room(roomId), { updatedAt: now, lastActivityAt: now });
    return { ready };
  });
}

export async function chooseToken(ctx: ServiceContext, caller: Caller, roomId: string, token: string) {
  if (!TOKEN_IDS.has(token)) fail('INVALID_ACTION', 'Unknown token');
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(roomId)), caller.uid);
    if (room.status !== 'LOBBY') fail('ROOM_NOT_JOINABLE', 'The game has already started');
    const members = await Promise.all(room.memberUids.map((u) => tx.get<MemberDoc>(PATHS.member(roomId, u))));
    if (members.some((m) => m && m.uid !== caller.uid && m.token === token)) fail('INVALID_ACTION', 'That token is taken');
    tx.update(PATHS.member(roomId, caller.uid), { token });
    return { token };
  });
}

export async function updateRoomSettings(
  ctx: ServiceContext,
  caller: Caller,
  roomId: string,
  input: { maxPlayers: number; mode: GameMode; turnTimerSeconds: TurnTimer },
) {
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(roomId)), caller.uid);
    if (room.hostUid !== caller.uid) fail('NOT_HOST', 'Only the host can change settings');
    if (room.status !== 'LOBBY') fail('ROOM_NOT_JOINABLE', 'Settings are locked once the game starts');
    if (input.maxPlayers < room.memberUids.length) fail('INVALID_ACTION', 'More players have already joined');
    const now = ctx.clock.now();
    tx.update(PATHS.room(roomId), {
      maxPlayers: input.maxPlayers,
      gameMode: input.mode,
      turnTimerSeconds: input.turnTimerSeconds,
      updatedAt: now,
      lastActivityAt: now,
    });
    return input;
  });
}

async function removeMember(ctx: ServiceContext, roomId: string, uid: string, actingUid: string, kick: boolean) {
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(roomId)), actingUid);
    if (kick && room.hostUid !== actingUid) fail('NOT_HOST', 'Only the host can remove players');
    if (kick && uid === actingUid) fail('INVALID_ACTION', 'Use Leave to exit your own room');
    if (!room.memberUids.includes(uid)) return { removed: false };
    if (room.status === 'IN_PROGRESS') fail('INVALID_ACTION', 'Resign from the game instead of leaving');
    const remaining = room.memberUids.filter((u) => u !== uid);
    const members = await Promise.all(remaining.map((u) => tx.get<MemberDoc>(PATHS.member(roomId, u))));
    const user = await tx.get<UserDoc>(PATHS.user(uid));
    const now = ctx.clock.now();
    tx.delete(PATHS.member(roomId, uid));
    if (user) tx.update(PATHS.user(uid), { activeRoomIds: user.activeRoomIds.filter((r) => r !== roomId), updatedAt: now });
    if (remaining.length === 0 && room.status === 'LOBBY') {
      tx.delete(PATHS.room(roomId));
      tx.delete(PATHS.inviteCode(room.inviteCodeHash));
      return { removed: true, roomDeleted: true };
    }
    let hostUid = room.hostUid;
    if (hostUid === uid) {
      // Elect the earliest remaining member as host.
      const next = members.filter(Boolean).sort((a, b) => a!.joinedAt - b!.joinedAt)[0]!;
      hostUid = next.uid;
      tx.update(PATHS.member(roomId, hostUid), { isHost: true });
    }
    tx.update(PATHS.room(roomId), { memberUids: remaining, hostUid, updatedAt: now, lastActivityAt: now });
    return { removed: true, roomDeleted: false };
  });
}

export const leaveRoom = (ctx: ServiceContext, caller: Caller, roomId: string) =>
  removeMember(ctx, roomId, caller.uid, caller.uid, false);

export async function kickMember(ctx: ServiceContext, caller: Caller, roomId: string, uid: string) {
  const r = await removeMember(ctx, roomId, uid, caller.uid, true);
  await ctx.db.deleteTree(PATHS.roomInvite(`${roomId}_${uid}`));
  return r;
}

export async function startGame(ctx: ServiceContext, caller: Caller, roomId: string) {
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(roomId)), caller.uid);
    if (room.hostUid !== caller.uid) fail('NOT_HOST', 'Only the host can start the game');
    if (room.status === 'IN_PROGRESS' && room.gameId) return { gameId: room.gameId, version: 0 };
    if (room.status !== 'LOBBY') fail('ROOM_NOT_JOINABLE', 'This room cannot start a game');
    const members = (await Promise.all(room.memberUids.map((u) => tx.get<MemberDoc>(PATHS.member(roomId, u)))))
      .filter((m): m is MemberDoc => m !== null)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    if (members.length < RULESET.minPlayers) fail('INVALID_ACTION', 'At least two players are needed');
    if (members.some((m) => !m.isHost && !m.ready)) fail('INVALID_ACTION', 'Everyone must be ready');

    const now = ctx.clock.now();
    const gameId = ctx.newId();
    const { game, priv, events } = createInitialGame(
      {
        gameId,
        roomId,
        settings: { maxPlayers: room.maxPlayers, mode: room.gameMode, turnTimerSeconds: room.turnTimerSeconds },
        players: members.map((m) => ({ uid: m.uid, displayName: m.displayName, photoURL: m.photoURL, token: m.token })),
      },
      { now, randomInt: ctx.randomInt, newId: ctx.newId },
    );
    const stored: StoredGame = { ...game, eventSeq: events.length, lastActivityAt: now };
    tx.set(PATHS.game(gameId), asData(stored));
    tx.set(PATHS.gamePrivate(gameId), asData(priv));
    for (const [path, doc] of eventDocs(gameId, 0, events as GameEvent[], 'start', caller.uid, game.version, now)) tx.set(path, doc);
    tx.update(PATHS.room(roomId), { status: 'IN_PROGRESS', gameId, updatedAt: now, lastActivityAt: now });
    // Membership is frozen once play starts, so the invite lookup is no longer needed.
    tx.delete(PATHS.inviteCode(room.inviteCodeHash));
    return { gameId, version: game.version };
  });
}

export async function sendReaction(
  ctx: ServiceContext,
  caller: Caller,
  input: { roomId: string; gameId: string | null; emoteId: string; nonce: string },
) {
  if (!EMOTE_IDS.has(input.emoteId)) fail('INVALID_ACTION', 'Unknown reaction');
  await rateLimit(ctx, `react_${uidHash(caller.uid)}`, REACTION_LIMIT.count, REACTION_LIMIT.windowMs);
  const id = sha256(`${caller.uid}:${input.nonce}`).slice(0, 24);
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(input.roomId)), caller.uid);
    const existing = await tx.get<ReactionDoc>(PATHS.reaction(input.roomId, id));
    if (existing) return { acceptedAt: existing.createdAt };
    const member = await tx.get<MemberDoc>(PATHS.member(input.roomId, caller.uid));
    const now = ctx.clock.now();
    const doc: ReactionDoc = {
      id,
      roomId: room.roomId,
      gameId: input.gameId,
      uid: caller.uid,
      displayName: member?.displayName ?? 'Player',
      photoURL: member?.photoURL ?? null,
      emoteId: input.emoteId,
      createdAt: now,
      ttlAt: now + REACTION_TTL_MS,
    };
    tx.set(PATHS.reaction(input.roomId, id), asData(doc));
    return { acceptedAt: now };
  });
}

export async function inviteFriend(ctx: ServiceContext, caller: Caller, roomId: string, friendUid: string) {
  await rateLimit(ctx, `invite_${uidHash(caller.uid)}`, 20, 10 * 60 * 1000);
  return ctx.db.runTransaction(async (tx) => {
    const room = requireMember(await tx.get<RoomDoc>(PATHS.room(roomId)), caller.uid);
    if (room.status !== 'LOBBY') fail('ROOM_NOT_JOINABLE', 'The game has already started');
    const friendship = await tx.get<FriendshipDoc>(PATHS.friendship(pairId(caller.uid, friendUid)));
    if (!friendship) fail('PERMISSION_DENIED', 'You can only invite friends');
    const now = ctx.clock.now();
    const id = `${roomId}_${friendUid}`;
    const invite: RoomInviteDoc = {
      id,
      roomId,
      inviteCode: room.inviteCode,
      fromUid: caller.uid,
      fromName: friendship.profiles[caller.uid]?.displayName ?? 'A friend',
      toUid: friendUid,
      createdAt: now,
      expiresAt: now + RETENTION.roomInviteMs,
    };
    tx.set(PATHS.roomInvite(id), asData(invite));
    return { inviteId: id };
  });
}

export async function dismissInvite(ctx: ServiceContext, caller: Caller, inviteId: string) {
  const invite = await ctx.db.get<RoomInviteDoc>(PATHS.roomInvite(inviteId));
  if (!invite || invite.toUid !== caller.uid) fail('NOT_FOUND', 'Invite not found');
  await ctx.db.deleteTree(PATHS.roomInvite(inviteId));
  return { dismissed: true };
}
