import { getSpace, netWorth, ownedSpaceIds, standings } from '../../../shared/index';
import type { ServiceContext } from '../shared/context';
import {
  PATHS,
  RETENTION,
  type ArchiveJobDoc,
  type EventDoc,
  type GameArchiveDoc,
  type RoomDoc,
  type StoredGame,
  type UserDoc,
} from '../shared/model';

const EVENT_SUMMARY_LIMIT = 200;
const SUMMARIZED = new Set(['PROPERTY_BOUGHT', 'AUCTION_WON', 'RENT_PAID', 'BUILT', 'TRADE_ACCEPTED', 'SENT_TO_JAIL', 'BANKRUPT', 'GAME_COMPLETED']);

function summarize(e: EventDoc, names: Map<string, string>): string {
  const p = e.payload as Record<string, unknown>;
  const who = (uid: unknown) => names.get(uid as string) ?? 'A player';
  const where = (id: unknown) => getSpace(id as number).name;
  switch (e.type) {
    case 'PROPERTY_BOUGHT':
      return `${who(p.uid)} bought ${where(p.spaceId)} for ₹${p.price}`;
    case 'AUCTION_WON':
      return p.uid ? `${who(p.uid)} won ${where(p.spaceId)} at auction for ₹${p.amount}` : `${where(p.spaceId)} went unsold`;
    case 'RENT_PAID':
      return `${who(p.fromUid)} paid ₹${p.amount} rent to ${who(p.toUid)}`;
    case 'BUILT':
      return `${who(p.uid)} developed ${where(p.spaceId)} to level ${p.level}`;
    case 'TRADE_ACCEPTED':
      return `${who(p.fromUid)} and ${who(p.toUid)} traded (₹${p.value})`;
    case 'SENT_TO_JAIL':
      return `${who(p.uid)} went to Jail`;
    case 'BANKRUPT':
      return `${who(p.uid)} went bankrupt`;
    case 'GAME_COMPLETED':
      return `${who(p.winnerUid)} won the game`;
    default:
      return e.type;
  }
}

export function buildArchive(game: StoredGame, events: EventDoc[]): GameArchiveDoc {
  const ranks = new Map(standings(game).map((s) => [s.uid, s.rank]));
  const names = new Map(game.players.map((p) => [p.uid, p.displayName]));
  const completedAt = game.completedAt ?? game.updatedAt;
  return {
    gameId: game.gameId,
    roomId: game.roomId,
    rulesetVersion: game.rulesetVersion,
    playerSnapshots: game.players
      .map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        photoURL: p.photoURL,
        token: p.token,
        finalCash: p.cash,
        netWorth: netWorth(game, p.uid),
        rank: ranks.get(p.uid) ?? game.players.length,
        propertiesOwned: ownedSpaceIds(game, p.uid).length,
        rentCollected: p.stats.rentCollected,
        biggestTrade: p.stats.biggestTrade,
      }))
      .sort((a, b) => a.rank - b.rank),
    winnerUid: game.winnerUid,
    endReason: game.endReason,
    startedAt: game.startedAt,
    completedAt,
    durationSeconds: Math.round((completedAt - game.startedAt) / 1000),
    totalTurns: game.turnNumber,
    eventSummary: events
      .filter((e) => SUMMARIZED.has(e.type))
      .slice(-EVENT_SUMMARY_LIMIT)
      .map((e) => ({ sequence: e.sequence, type: e.type, actorUid: e.actorUid, createdAt: e.createdAt, summary: summarize(e, names) })),
    archiveVersion: 1,
    participantUids: game.players.map((p) => p.uid),
    retentionUntil: completedAt + RETENTION.archiveMs,
  };
}

function verify(archive: GameArchiveDoc | null, game: StoredGame): string | null {
  if (!archive) return 'archive missing';
  if (archive.gameId !== game.gameId) return 'gameId mismatch';
  const expected = [...game.players.map((p) => p.uid)].sort().join(',');
  if ([...archive.participantUids].sort().join(',') !== expected) return 'participants mismatch';
  if (archive.playerSnapshots.length !== game.players.length) return 'snapshots incomplete';
  if (!archive.completedAt || !archive.rulesetVersion) return 'required fields missing';
  return null;
}

/** Stage 2+3: write the deterministic archive, re-read and verify it, then schedule cleanup. Safe to retry. */
export async function archiveGame(ctx: ServiceContext, gameId: string): Promise<ArchiveJobDoc['status']> {
  const job = await ctx.db.get<ArchiveJobDoc>(PATHS.archiveJob(gameId));
  if (!job) return 'FAILED';
  if (job.status === 'VERIFIED' || job.status === 'CLEANED') return job.status;
  const now = ctx.clock.now();
  try {
    const game = await ctx.db.get<StoredGame>(PATHS.game(gameId));
    if (!game || game.status !== 'COMPLETED') throw new Error('game not completed');
    const existing = await ctx.db.get<GameArchiveDoc>(PATHS.archive(gameId));
    if (!existing) {
      const events = await ctx.db.query<EventDoc>(`games/${gameId}/events`, [], { orderBy: { field: 'sequence', direction: 'asc' } });
      const archive = buildArchive(game, events.map((e) => e.data));
      await ctx.db.runTransaction(async (tx) => {
        if (!(await tx.get(PATHS.archive(gameId)))) tx.set(PATHS.archive(gameId), archive as unknown as Record<string, unknown>);
      });
    }
    const problem = verify(await ctx.db.get<GameArchiveDoc>(PATHS.archive(gameId)), game);
    if (problem) throw new Error(`verification failed: ${problem}`);
    await ctx.db.runTransaction(async (tx) => {
      const room = await tx.get<RoomDoc>(PATHS.room(job.roomId));
      tx.update(PATHS.archiveJob(gameId), {
        status: 'VERIFIED',
        verifiedAt: now,
        cleanupAfter: now + RETENTION.completedGraceMs,
        attempts: job.attempts + 1,
        lastError: null,
      });
      if (room) tx.update(PATHS.room(job.roomId), { status: 'ARCHIVED', updatedAt: now });
    });
    return 'VERIFIED';
  } catch (e) {
    await ctx.db.runTransaction(async (tx) => {
      tx.update(PATHS.archiveJob(gameId), {
        status: job.attempts + 1 >= 5 ? 'FAILED' : 'PENDING',
        attempts: job.attempts + 1,
        lastError: (e as Error).message.slice(0, 200),
      });
    });
    return job.attempts + 1 >= 5 ? 'FAILED' : 'PENDING';
  }
}

/** Stage 4: remove live data only for verified archives. Every delete tolerates already-deleted docs. */
export async function cleanupVerifiedGame(ctx: ServiceContext, job: ArchiveJobDoc): Promise<boolean> {
  if (job.status !== 'VERIFIED') return false;
  const archive = await ctx.db.get<GameArchiveDoc>(PATHS.archive(job.gameId));
  if (!archive) return false; // never delete the only copy
  const room = await ctx.db.get<RoomDoc>(PATHS.room(job.roomId));
  await ctx.db.deleteTree(PATHS.game(job.gameId));
  for (const r of await ctx.db.query('commandReceipts', [['gameId', '==', job.gameId]])) await ctx.db.deleteTree(r.path);
  for (const inv of await ctx.db.query('roomInvites', [['roomId', '==', job.roomId]])) await ctx.db.deleteTree(inv.path);
  if (room) {
    await ctx.db.deleteTree(PATHS.inviteCode(room.inviteCodeHash));
    for (const uid of room.memberUids) await removeActiveRoom(ctx, uid, room.roomId);
  }
  await ctx.db.deleteTree(PATHS.room(job.roomId));
  await ctx.db.runTransaction(async (tx) => {
    tx.update(PATHS.archiveJob(job.gameId), { status: 'CLEANED', cleanedAt: ctx.clock.now() });
  });
  return true;
}

export async function removeActiveRoom(ctx: ServiceContext, uid: string, roomId: string): Promise<void> {
  await ctx.db.runTransaction(async (tx) => {
    const u = await tx.get<UserDoc>(PATHS.user(uid));
    if (u && u.activeRoomIds.includes(roomId)) {
      tx.update(PATHS.user(uid), { activeRoomIds: u.activeRoomIds.filter((r) => r !== roomId) });
    }
  });
}
