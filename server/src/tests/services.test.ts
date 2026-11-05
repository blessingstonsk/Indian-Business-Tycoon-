import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError, RULESET, type GameAction } from '../../../shared/index';
import { archiveGame, cleanupVerifiedGame } from '../archive-service/archive';
import { runCleanup } from '../cleanup/cleanup';
import { MemoryDb } from '../db/memory-db';
import * as friends from '../friend-service/friends';
import { submitGameAction, sweepTimeouts } from '../game-engine/game-service';
import * as rooms from '../room-service/rooms';
import type { Caller, ServiceContext } from '../shared/context';
import { randomCode } from '../shared/ids';
import { PATHS, RETENTION, type ArchiveJobDoc, type GameArchiveDoc, type RoomDoc, type StoredGame } from '../shared/model';

let db: MemoryDb;
let now: number;
let faces: number[];
let ctx: ServiceContext;
let n = 0;

const caller = (uid: string, name = uid): Caller => ({ uid, name, picture: null });
const alice = caller('alice', 'Alice');
const bob = caller('bob', 'Bob');
const cara = caller('cara', 'Cara');

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return 'OK';
}

beforeEach(async () => {
  db = new MemoryDb();
  now = 1_750_000_000_000;
  faces = [];
  ctx = {
    db,
    clock: { now: () => now },
    randomInt: (max) => (max === 6 && faces.length ? faces.shift()! - 1 : 0),
    newId: () => `id${++n}`,
    newCode: randomCode,
  };
  for (const c of [alice, bob, cara]) await friends.bootstrapProfile(ctx, c);
});

async function lobby(maxPlayers = 4, timer: 0 | 30 = 0) {
  const { roomId, inviteCode } = await rooms.createRoom(ctx, alice, { maxPlayers, mode: 'STANDARD', turnTimerSeconds: timer });
  return { roomId, inviteCode };
}

async function startedGame(timer: 0 | 30 = 0) {
  const { roomId, inviteCode } = await lobby(4, timer);
  await rooms.joinRoom(ctx, bob, inviteCode);
  await rooms.setReady(ctx, bob, roomId, true);
  const { gameId } = await rooms.startGame(ctx, alice, roomId);
  return { roomId, gameId };
}

const game = async (gameId: string) => (await db.get<StoredGame>(PATHS.game(gameId)))!;

function cmd(roomId: string, gameId: string, version: number, action: GameAction, commandId: string = randomUUID()) {
  return { commandId, roomId, gameId, expectedVersion: version, type: action.type, payload: action.payload };
}

async function act(who: Caller, roomId: string, gameId: string, action: GameAction, commandId?: string) {
  const g = await game(gameId);
  return submitGameAction(ctx, who, cmd(roomId, gameId, g.version, action, commandId));
}

describe('profiles', () => {
  it('bootstrap is idempotent and assigns a friend code', async () => {
    const a1 = await friends.bootstrapProfile(ctx, alice);
    const a2 = await friends.bootstrapProfile(ctx, alice);
    expect(a1.friendCode).toHaveLength(8);
    expect(a2.friendCode).toBe(a1.friendCode);
    expect(await db.get(PATHS.friendCode(a1.friendCode))).toEqual({ uid: 'alice' });
  });
});

describe('rooms', () => {
  it('create, join and reject a third player when max is two', async () => {
    const { roomId, inviteCode } = await lobby(2);
    await rooms.joinRoom(ctx, bob, inviteCode.toLowerCase().toUpperCase());
    expect(await code(() => rooms.joinRoom(ctx, cara, inviteCode))).toBe('ROOM_FULL');
    const room = await db.get<RoomDoc>(PATHS.room(roomId));
    expect(room!.memberUids).toEqual(['alice', 'bob']);
  });

  it('duplicate join does not create a duplicate seat', async () => {
    const { roomId, inviteCode } = await lobby();
    await Promise.all([rooms.joinRoom(ctx, bob, inviteCode), rooms.joinRoom(ctx, bob, inviteCode)]);
    const room = await db.get<RoomDoc>(PATHS.room(roomId));
    expect(room!.memberUids).toEqual(['alice', 'bob']);
  });

  it('assigns distinct tokens and rejects a taken token', async () => {
    const { roomId, inviteCode } = await lobby();
    await rooms.joinRoom(ctx, bob, inviteCode);
    const a = await db.get<{ token: string }>(PATHS.member(roomId, 'alice'));
    const b = await db.get<{ token: string }>(PATHS.member(roomId, 'bob'));
    expect(a!.token).not.toBe(b!.token);
    expect(await code(() => rooms.chooseToken(ctx, bob, roomId, a!.token))).toBe('INVALID_ACTION');
  });

  it('unknown codes give a generic error', async () => {
    expect(await code(() => rooms.joinRoom(ctx, bob, 'ZZZZZZ'))).toBe('ROOM_NOT_FOUND');
  });

  it('non-host cannot start; host cannot start before all ready', async () => {
    const { roomId, inviteCode } = await lobby();
    expect(await code(() => rooms.startGame(ctx, alice, roomId))).toBe('INVALID_ACTION');
    await rooms.joinRoom(ctx, bob, inviteCode);
    expect(await code(() => rooms.startGame(ctx, bob, roomId))).toBe('NOT_HOST');
    expect(await code(() => rooms.startGame(ctx, alice, roomId))).toBe('INVALID_ACTION');
    await rooms.setReady(ctx, bob, roomId, true);
    expect(await code(() => rooms.startGame(ctx, alice, roomId))).toBe('OK');
    expect(await code(() => rooms.joinRoom(ctx, cara, inviteCode))).toBe('ROOM_NOT_FOUND');
  });

  it('host leaving elects the earliest remaining member', async () => {
    const { roomId, inviteCode } = await lobby();
    await rooms.joinRoom(ctx, bob, inviteCode);
    now += 1000;
    await rooms.joinRoom(ctx, cara, inviteCode);
    await rooms.leaveRoom(ctx, alice, roomId);
    const room = await db.get<RoomDoc>(PATHS.room(roomId));
    expect(room!.hostUid).toBe('bob');
  });

  it('only friends can be invited', async () => {
    const { roomId } = await lobby();
    expect(await code(() => rooms.inviteFriend(ctx, alice, roomId, 'bob'))).toBe('PERMISSION_DENIED');
  });
});

describe('game commands', () => {
  it('both clients read the same server-generated dice and position', async () => {
    const { roomId, gameId } = await startedGame();
    faces.push(1, 2);
    await act(alice, roomId, gameId, { type: 'ROLL_DICE', payload: {} });
    const g1 = await game(gameId);
    const g2 = await game(gameId);
    expect(g1.dice).toMatchObject({ first: 1, second: 2 });
    expect(g2.players[0].position).toBe(3);
    const events = await db.query(`games/${gameId}/events`, [], { orderBy: { field: 'sequence', direction: 'asc' } });
    expect(events.map((e) => (e.data as { sequence: number }).sequence)).toEqual(events.map((_, i) => i + 1));
  });

  it('rejects out-of-turn, stale-version and malformed commands', async () => {
    const { roomId, gameId } = await startedGame();
    expect(await code(() => act(bob, roomId, gameId, { type: 'ROLL_DICE', payload: {} }))).toBe('NOT_YOUR_TURN');
    const g = await game(gameId);
    expect(await code(() => submitGameAction(ctx, alice, cmd(roomId, gameId, g.version - 1, { type: 'ROLL_DICE', payload: {} })))).toBe('VERSION_CONFLICT');
    expect(await code(() => submitGameAction(ctx, alice, { ...cmd(roomId, gameId, g.version, { type: 'ROLL_DICE', payload: {} }), payload: { cheat: 12 } }))).toBe('INVALID_ACTION');
    expect(await code(() => act(cara, roomId, gameId, { type: 'ROLL_DICE', payload: {} }))).toBe('NOT_ROOM_MEMBER');
  });

  it('replaying the same commandId does not charge twice', async () => {
    const { roomId, gameId } = await startedGame();
    faces.push(1, 3); // GST Checkpost
    const id = randomUUID();
    const first = await act(alice, roomId, gameId, { type: 'ROLL_DICE', payload: {} }, id);
    const before = await game(gameId);
    const replay = await submitGameAction(ctx, alice, cmd(roomId, gameId, first.version - 1, { type: 'ROLL_DICE', payload: {} }, id));
    const after = await game(gameId);
    expect(replay.replayed).toBe(true);
    expect(after.version).toBe(before.version);
    expect(after.players[0].cash).toBe(RULESET.startingCash - 2000);
  });

  it('two simultaneous bids cannot both win an auction', async () => {
    const { roomId, gameId } = await startedGame();
    faces.push(1, 2);
    await act(alice, roomId, gameId, { type: 'ROLL_DICE', payload: {} });
    await act(alice, roomId, gameId, { type: 'DECLINE_PROPERTY', payload: {} });
    const v = (await game(gameId)).version;
    const results = await Promise.allSettled([
      submitGameAction(ctx, alice, cmd(roomId, gameId, v, { type: 'PLACE_BID', payload: { amount: 300 } })),
      submitGameAction(ctx, bob, cmd(roomId, gameId, v, { type: 'PLACE_BID', payload: { amount: 400 } })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as DomainError).code).toBe('VERSION_CONFLICT');
    const g = await game(gameId);
    expect(g.auction!.highestBidderUid).toBe(results[0].status === 'fulfilled' ? 'alice' : 'bob');
  });

  it('server sweeper enforces turn deadlines', async () => {
    const { gameId } = await startedGame(30);
    expect(await sweepTimeouts(ctx)).toBe(0);
    now += 31_000;
    faces.push(1, 3);
    expect(await sweepTimeouts(ctx)).toBe(1);
    const g = await game(gameId);
    expect(g.players[0].position).toBe(4);
  });
});

describe('reactions', () => {
  it('enforces the allowlist and the 3-per-5s rate limit; cleanup removes expired', async () => {
    const { roomId } = await lobby();
    const send = (emoteId: string) => rooms.sendReaction(ctx, alice, { roomId, gameId: null, emoteId, nonce: randomUUID() });
    expect(await code(() => send('hello world'))).toBe('INVALID_ACTION');
    await send('clap');
    await send('fire');
    await send('q_trade');
    expect(await code(() => send('clap'))).toBe('RATE_LIMITED');
    expect(await code(() => rooms.sendReaction(ctx, bob, { roomId, gameId: null, emoteId: 'clap', nonce: randomUUID() }))).toBe('NOT_ROOM_MEMBER');
    now += 10_000;
    const report = await runCleanup(ctx);
    expect(report.reactionsDeleted).toBe(3);
    expect(await db.query(`rooms/${roomId}/reactions`, [])).toHaveLength(0);
  });
});

describe('friends', () => {
  it('request, duplicate, accept, and remove', async () => {
    const bobCode = (await friends.bootstrapProfile(ctx, bob)).friendCode;
    const { requestId } = await friends.sendFriendRequest(ctx, alice, bobCode);
    const again = await friends.sendFriendRequest(ctx, alice, bobCode);
    expect(again.requestId).toBe(requestId);
    const aliceCode = (await friends.bootstrapProfile(ctx, alice)).friendCode;
    expect(await code(() => friends.sendFriendRequest(ctx, bob, aliceCode))).toBe('INVALID_ACTION');
    expect(await code(() => friends.respondFriendRequest(ctx, alice, requestId, 'ACCEPT'))).toBe('NOT_FOUND');
    await friends.respondFriendRequest(ctx, bob, requestId, 'ACCEPT');
    expect((await friends.bootstrapProfile(ctx, alice)).friendCount).toBe(1);
    expect(await code(() => friends.sendFriendRequest(ctx, alice, bobCode))).toBe('INVALID_ACTION');
    const { roomId } = await lobby();
    expect(await code(() => rooms.inviteFriend(ctx, alice, roomId, 'bob'))).toBe('OK');
    await friends.removeFriend(ctx, alice, 'bob');
    expect((await friends.bootstrapProfile(ctx, bob)).friendCount).toBe(0);
  });

  it('privacy setting blocks requests with a generic error', async () => {
    const bobCode = (await friends.bootstrapProfile(ctx, bob)).friendCode;
    await friends.updateProfile(ctx, bob, { allowFriendRequests: 'nobody' });
    expect(await code(() => friends.sendFriendRequest(ctx, alice, bobCode))).toBe('NOT_FOUND');
    const ownCode = (await friends.bootstrapProfile(ctx, alice)).friendCode;
    expect(await code(() => friends.sendFriendRequest(ctx, alice, ownCode))).toBe('INVALID_ACTION');
  });
});

describe('archive and cleanup lifecycle', () => {
  async function finishedGame() {
    const { roomId, gameId } = await startedGame();
    await act(bob, roomId, gameId, { type: 'RESIGN', payload: {} });
    return { roomId, gameId };
  }

  it('completion writes an outbox job, archive is verified before cleanup', async () => {
    const { roomId, gameId } = await finishedGame();
    const job = await db.get<ArchiveJobDoc>(PATHS.archiveJob(gameId));
    expect(job!.status).toBe('PENDING');
    expect(await code(() => act(alice, roomId, gameId, { type: 'ROLL_DICE', payload: {} }))).toBe('GAME_ALREADY_COMPLETED');

    expect(await archiveGame(ctx, gameId)).toBe('VERIFIED');
    const archive = await db.get<GameArchiveDoc>(PATHS.archive(gameId));
    expect(archive!.winnerUid).toBe('alice');
    expect(archive!.participantUids.sort()).toEqual(['alice', 'bob']);
    expect(archive!.rulesetVersion).toBe(RULESET.version);

    // Not yet past the grace period → nothing deleted.
    await runCleanup(ctx);
    expect(await db.get(PATHS.game(gameId))).not.toBeNull();

    now += RETENTION.completedGraceMs + 1;
    const report = await runCleanup(ctx);
    expect(report.gamesCleaned).toBe(1);
    expect(await db.get(PATHS.game(gameId))).toBeNull();
    expect(await db.get(PATHS.gamePrivate(gameId))).toBeNull();
    expect(await db.query(`games/${gameId}/events`, [])).toHaveLength(0);
    expect(await db.get(PATHS.room(roomId))).toBeNull();
    expect(await db.query('commandReceipts', [['gameId', '==', gameId]])).toHaveLength(0);
    expect(await db.get(PATHS.archive(gameId))).not.toBeNull();

    // Retry is safe: archive survives and nothing throws.
    const cleaned = (await db.get<ArchiveJobDoc>(PATHS.archiveJob(gameId)))!;
    await cleanupVerifiedGame(ctx, { ...cleaned, status: 'VERIFIED' });
    expect(await db.get(PATHS.archive(gameId))).not.toBeNull();
    expect((await friends.getMyArchives(ctx, bob, null, 10)).items).toHaveLength(1);
    expect((await friends.getMyArchives(ctx, cara, null, 10)).items).toHaveLength(0);
  });

  it('cleanup never deletes live data when the archive is missing', async () => {
    const { gameId } = await finishedGame();
    await archiveGame(ctx, gameId);
    await db.deleteTree(PATHS.archive(gameId));
    now += RETENTION.completedGraceMs + 1;
    await runCleanup(ctx);
    expect(await db.get(PATHS.game(gameId))).not.toBeNull();
  });

  it('abandoned lobbies expire after inactivity', async () => {
    const { roomId } = await lobby();
    now += RETENTION.lobbyInactivityMs + 1;
    const report = await runCleanup(ctx);
    expect(report.lobbiesExpired).toBe(1);
    expect(await db.get(PATHS.room(roomId))).toBeNull();
    expect((await friends.bootstrapProfile(ctx, alice)).activeRoomIds).toEqual([]);
  });

  it('account deletion pseudonymizes archives for the other players', async () => {
    const { gameId } = await finishedGame();
    await archiveGame(ctx, gameId);
    now += RETENTION.completedGraceMs + 1;
    await runCleanup(ctx);
    await friends.deleteAccountData(ctx, bob);
    const archive = (await db.get<GameArchiveDoc>(PATHS.archive(gameId)))!;
    expect(archive.participantUids).toEqual(['alice']);
    expect(archive.playerSnapshots.find((s) => s.displayName === 'Deleted player')).toBeTruthy();
    expect(await db.get(PATHS.user('bob'))).toBeNull();
  });
});
