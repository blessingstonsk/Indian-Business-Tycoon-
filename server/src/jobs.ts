import { archiveGame } from './archive-service/archive';
import { runCleanup } from './cleanup/cleanup';
import { sweepTimeouts } from './game-engine/game-service';
import { log } from './http/app';
import type { ServiceContext } from './shared/context';

// Background work that Cloud Functions triggers/schedules used to do, now in-process timers.

export function startJobs(ctx: ServiceContext, opts: { timeoutEveryMs?: number; cleanupEveryMs?: number } = {}) {
  const running = new Set<string>();

  // Archive outbox: archive a completed game as soon as its job document appears.
  const unsubscribe = ctx.db.onChange((paths) => {
    for (const p of paths) {
      const m = p.match(/^archiveJobs\/([^/]+)$/);
      if (!m || running.has(m[1])) continue;
      running.add(m[1]);
      archiveGame(ctx, m[1])
        .then((status) => log('info', 'archive_job', { gameId: m[1], status }))
        .catch((e) => log('error', 'archive_job_failed', { gameId: m[1], error: (e as Error).message }))
        .finally(() => running.delete(m[1]));
    }
  });

  const timeouts = setInterval(() => {
    sweepTimeouts(ctx)
      .then((n) => n && log('info', 'timeouts_applied', { applied: n }))
      .catch((e) => log('error', 'timeout_sweep_failed', { error: (e as Error).message }));
  }, opts.timeoutEveryMs ?? 15_000);

  const cleanup = setInterval(() => {
    runCleanup(ctx)
      .then((r) => log(r.errors.length ? 'error' : 'info', 'cleanup_report', { ...r, errors: r.errors }))
      .catch((e) => log('error', 'cleanup_failed', { error: (e as Error).message }));
  }, opts.cleanupEveryMs ?? 15 * 60_000);

  return () => {
    unsubscribe();
    clearInterval(timeouts);
    clearInterval(cleanup);
  };
}
