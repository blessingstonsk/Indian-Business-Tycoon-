import { completeByNetWorth, type PrivateState } from '../../../shared/index';
import { archiveGame, cleanupVerifiedGame, removeActiveRoom } from '../archive-service/archive';
import type { ServiceContext } from '../shared/context';
import { eventDocs } from '../game-engine/game-service';
import { PATHS, RETENTION, type ArchiveJobDoc, type RoomDoc, type StoredGame } from '../shared/model';

export interface CleanupReport {
  archivesRetried: number;
  gamesCleaned: number;
  lobbiesExpired: number;
  gamesMarkedStale: number;
  gamesAbandoned: number;
  reactionsDeleted: number;
  invitesDeleted: number;
  friendRequestsDeleted: number;
  archivesExpired: number;
  errors: string[];
}

/** Periodic lifecycle job. Each step is idempotent so a failed run can simply be repeated. */
export async function runCleanup(ctx: ServiceContext): Promise<CleanupReport> {
  const now = ctx.clock.now();
  const report: CleanupReport = {
    archivesRetried: 0,
    gamesCleaned: 0,
    lobbiesExpired: 0,
    gamesMarkedStale: 0,
    gamesAbandoned: 0,
    reactionsDeleted: 0,
    invitesDeleted: 0,
    friendRequestsDeleted: 0,
    archivesExpired: 0,
    errors: [],
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      report.errors.push(`${name}: ${(e as Error).message}`);
    }
  };

  await step('retry-archives', async () => {
    for (const j of await ctx.db.query<ArchiveJobDoc>('archiveJobs', [['status', '==', 'PENDING']], { limit: 50 })) {
      await archiveGame(ctx, j.data.gameId);
      report.archivesRetried++;
    }
  });

  await step('cleanup-verified', async () => {
    const jobs = await ctx.db.query<ArchiveJobDoc>('archiveJobs', [['status', '==', 'VERIFIED']], { limit: 50 });
    for (const j of jobs) {
      if ((j.data.cleanupAfter ?? Infinity) > now) continue;
      if (await cleanupVerifiedGame(ctx, j.data)) report.gamesCleaned++;
    }
  });

  await step('expire-lobbies', async () => {
    const rooms = await ctx.db.query<RoomDoc>('rooms', [['status', '==', 'LOBBY'], ['lastActivityAt', '<', now - RETENTION.lobbyInactivityMs]], { limit: 100 });
    for (const { data: room } of rooms) {
      await ctx.db.deleteTree(PATHS.inviteCode(room.inviteCodeHash));
      for (const inv of await ctx.db.query('roomInvites', [['roomId', '==', room.roomId]])) await ctx.db.deleteTree(inv.path);
      for (const uid of room.memberUids) await removeActiveRoom(ctx, uid, room.roomId);
      await ctx.db.deleteTree(PATHS.room(room.roomId));
      report.lobbiesExpired++;
    }
  });

  await step('abandoned-games', async () => {
    // Policy: inactive 48h → marked stale (UI banner); inactive 14 days → ended by net worth and archived.
    const games = await ctx.db.query<StoredGame>('games', [['lastActivityAt', '<', now - RETENTION.staleGameMs]], { limit: 100 });
    for (const { data: g } of games) {
      if (g.status === 'COMPLETED') continue;
      if (g.lastActivityAt < now - RETENTION.abandonedGameMs) {
        await ctx.db.runTransaction(async (tx) => {
          const game = await tx.get<StoredGame>(PATHS.game(g.gameId));
          const priv = await tx.get<PrivateState>(PATHS.gamePrivate(g.gameId));
          if (!game || !priv || game.status === 'COMPLETED') return;
          const { eventSeq, lastActivityAt: _l, stale: _s, ...state } = game;
          const r = completeByNetWorth(state, priv, { now, randomInt: ctx.randomInt, newId: ctx.newId });
          tx.set(PATHS.game(g.gameId), { ...r.game, eventSeq: eventSeq + r.events.length, lastActivityAt: now } as unknown as Record<string, unknown>);
          for (const [path, doc] of eventDocs(g.gameId, eventSeq, r.events, 'abandoned', 'system', r.game.version, now)) tx.set(path, doc);
          tx.set(PATHS.archiveJob(g.gameId), {
            gameId: g.gameId,
            roomId: g.roomId,
            status: 'PENDING',
            attempts: 0,
            lastError: null,
            createdAt: now,
            verifiedAt: null,
            cleanupAfter: null,
            cleanedAt: null,
          } satisfies ArchiveJobDoc);
        });
        await archiveGame(ctx, g.gameId);
        report.gamesAbandoned++;
      } else if (!g.stale) {
        await ctx.db.runTransaction(async (tx) => tx.update(PATHS.game(g.gameId), { stale: true }));
        report.gamesMarkedStale++;
      }
    }
  });

  await step('expired-reactions', async () => {
    for (const r of await ctx.db.queryGroup('reactions', [['ttlAt', '<', now]], { limit: 500 })) {
      await ctx.db.deleteTree(r.path);
      report.reactionsDeleted++;
    }
  });

  await step('expired-invites', async () => {
    for (const r of await ctx.db.query('roomInvites', [['expiresAt', '<', now]], { limit: 500 })) {
      await ctx.db.deleteTree(r.path);
      report.invitesDeleted++;
    }
  });

  await step('closed-friend-requests', async () => {
    const cutoff = now - RETENTION.closedFriendRequestMs;
    for (const status of ['REJECTED', 'CANCELLED', 'ACCEPTED']) {
      for (const r of await ctx.db.query('friendRequests', [['status', '==', status], ['updatedAt', '<', cutoff]], { limit: 200 })) {
        await ctx.db.deleteTree(r.path);
        report.friendRequestsDeleted++;
      }
    }
  });

  await step('archive-retention', async () => {
    for (const r of await ctx.db.query('gameArchives', [['retentionUntil', '<', now]], { limit: 100 })) {
      await ctx.db.deleteTree(r.path);
      await ctx.db.deleteTree(PATHS.archiveJob(r.id));
      report.archivesExpired++;
    }
  });

  return report;
}
