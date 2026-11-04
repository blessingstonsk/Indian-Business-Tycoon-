import type { Clock, Db } from '../db/types';
import { DomainError } from '../../../shared/index';
import { PATHS } from './model';

/** Everything a service needs, injected so tests can swap the database, clock and RNG. */
export interface ServiceContext {
  db: Db;
  clock: Clock;
  randomInt: (maxExclusive: number) => number;
  newId: () => string;
  newCode: (length: number) => string;
}

export interface Caller {
  uid: string;
  name: string | null;
  picture: string | null;
}

interface RateLimitDoc {
  hits: number[];
  ttlAt: number;
}

/** Sliding-window limiter stored in Firestore so it holds across function instances. */
export async function rateLimit(ctx: ServiceContext, key: string, max: number, windowMs: number): Promise<void> {
  const now = ctx.clock.now();
  await ctx.db.runTransaction(async (tx) => {
    const path = PATHS.rateLimit(key);
    const doc = await tx.get<RateLimitDoc>(path);
    const hits = (doc?.hits ?? []).filter((t) => t > now - windowMs);
    if (hits.length >= max) throw new DomainError('RATE_LIMITED', 'Slow down a little and try again');
    hits.push(now);
    tx.set(path, { hits, ttlAt: now + windowMs });
  });
}
