import {
  applyAction,
  DomainError,
  fail,
  parseGameCommand,
  type GameAction,
  type GameEvent,
  type PrivateState,
} from '../../../shared/index';
import type { Caller, ServiceContext } from '../shared/context';
import { sha256, uidHash } from '../shared/ids';
import {
  PATHS,
  RETENTION,
  type ArchiveJobDoc,
  type CommandReceiptDoc,
  type EventDoc,
  type RoomDoc,
  type StoredGame,
} from '../shared/model';

type Data = Record<string, unknown>;

/** Turn engine events into append-only event documents with contiguous sequence numbers. */
export function eventDocs(
  gameId: string,
  startSeq: number,
  events: GameEvent[],
  commandId: string,
  actorUid: string,
  versionAfter: number,
  now: number,
): [string, Data][] {
  return events.map((e, i) => {
    const sequence = startSeq + i + 1;
    const { type, ...payload } = e;
    const doc: EventDoc = { sequence, commandId, actorUid, type, payload, createdAt: now, versionAfter };
    return [PATHS.event(gameId, sequence), doc as unknown as Data];
  });
}

export interface CommandResult {
  version: number;
  eventCount: number;
  replayed: boolean;
}

/**
 * Validate and commit one game command atomically: version check, engine transition,
 * snapshot write, event append and idempotency receipt all happen in one transaction.
 */
export async function submitGameAction(ctx: ServiceContext, caller: Caller, raw: unknown): Promise<CommandResult> {
  let parsed: ReturnType<typeof parseGameCommand>;
  try {
    parsed = parseGameCommand(raw);
  } catch {
    fail('INVALID_ACTION', 'Malformed command');
  }
  const { command, action } = parsed;
  return commit(ctx, caller.uid, command.gameId, command.roomId, command.commandId, command.expectedVersion, action);
}

async function commit(
  ctx: ServiceContext,
  uid: string,
  gameId: string,
  roomId: string | null,
  commandId: string,
  expectedVersion: number | null,
  action: GameAction,
): Promise<CommandResult> {
  const receiptPath = PATHS.receipt(sha256(`${gameId}:${uid}:${commandId}`));
  return ctx.db.runTransaction(async (tx) => {
    const receipt = await tx.get<CommandReceiptDoc>(receiptPath);
    if (receipt) return { ...receipt.result, replayed: true };
    const game = await tx.get<StoredGame>(PATHS.game(gameId));
    if (!game || (roomId !== null && game.roomId !== roomId)) fail('NOT_FOUND', 'Game not found');
    if (!game.players.some((p) => p.uid === uid)) fail('NOT_ROOM_MEMBER', 'You are not in this game');
    if (game.status === 'COMPLETED') fail('GAME_ALREADY_COMPLETED', 'This game has finished');
    if (expectedVersion !== null && expectedVersion !== game.version) {
      fail('VERSION_CONFLICT', 'The board changed – refreshed to the latest state');
    }
    const priv = await tx.get<PrivateState>(PATHS.gamePrivate(gameId));
    const room = await tx.get<RoomDoc>(PATHS.room(game.roomId));
    if (!priv) fail('INTERNAL', 'Game state is incomplete');

    const now = ctx.clock.now();
    const { eventSeq, lastActivityAt: _ignored, stale: _stale, ...state } = game;
    const result = applyAction(state, priv, uid, action, { now, randomInt: ctx.randomInt, newId: ctx.newId });
    const next: StoredGame = { ...result.game, eventSeq: eventSeq + result.events.length, lastActivityAt: now };

    tx.set(PATHS.game(gameId), next as unknown as Data);
    tx.set(PATHS.gamePrivate(gameId), result.priv as unknown as Data);
    for (const [path, doc] of eventDocs(gameId, eventSeq, result.events, commandId, uid, next.version, now)) tx.set(path, doc);
    const outcome = { version: next.version, eventCount: result.events.length };
    const receiptDoc: CommandReceiptDoc = {
      gameId,
      uidHash: uidHash(uid),
      commandId,
      result: outcome,
      createdAt: now,
      ttlAt: now + RETENTION.receiptMs,
    };
    tx.set(receiptPath, receiptDoc as unknown as Data);

    if (room) tx.update(PATHS.room(game.roomId), { lastActivityAt: now, updatedAt: now, ...(next.status === 'COMPLETED' ? { status: 'COMPLETED' } : {}) });
    if (next.status === 'COMPLETED') {
      // Outbox record: the archive trigger picks this up. Live data is deleted only after verification.
      const job: ArchiveJobDoc = {
        gameId,
        roomId: game.roomId,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        createdAt: now,
        verifiedAt: null,
        cleanupAfter: null,
        cleanedAt: null,
      };
      tx.set(PATHS.archiveJob(gameId), job as unknown as Data);
    }
    return { ...outcome, replayed: false };
  });
}

/** Scheduled sweeper: enforce expired server deadlines so offline players cannot stall a game. */
export async function sweepTimeouts(ctx: ServiceContext): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db.query<StoredGame>('games', [['turnDeadline', '<=', now]], { limit: 200 });
  const timed = await ctx.db.query<StoredGame>('games', [['endsAt', '<=', now]], { limit: 200 });
  const seen = new Set<string>();
  let applied = 0;
  for (const { data: g } of [...due, ...timed]) {
    if (seen.has(g.gameId) || g.status === 'COMPLETED') continue;
    seen.add(g.gameId);
    try {
      await commit(ctx, g.currentPlayerUid, g.gameId, null, `timeout-v${g.version}`, g.version, {
        type: 'CLAIM_TIMEOUT',
        payload: {},
      });
      applied++;
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
    }
  }
  return applied;
}
