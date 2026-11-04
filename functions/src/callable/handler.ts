import { randomUUID } from 'node:crypto';
import { logger } from 'firebase-functions';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import type { ZodType, ZodTypeDef } from 'zod';
import { DomainError, type ApiResult } from '../../../shared/index';
import type { Caller, ServiceContext } from '../shared/context';
import { uidHash } from '../shared/ids';

export const REGION = 'asia-south1';

/**
 * Wraps a service as a callable: requires Firebase Auth, validates the payload with Zod,
 * maps failures to the stable ApiResult contract and logs with a correlation id (no raw uids or tokens).
 */
export function callable<I, O>(
  name: string,
  schema: ZodType<I, ZodTypeDef, unknown>,
  getCtx: () => ServiceContext,
  fn: (ctx: ServiceContext, caller: Caller, input: I, req: CallableRequest) => Promise<O>,
) {
  return onCall(
    { region: REGION, enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', cors: true },
    async (req): Promise<ApiResult<O>> => {
      const correlationId = randomUUID();
      if (!req.auth) {
        return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in', retryable: false, correlationId } };
      }
      const parsed = schema.safeParse(req.data ?? {});
      if (!parsed.success) {
        logger.warn('invalid_request', { fn: name, correlationId, uid: uidHash(req.auth.uid) });
        return { ok: false, error: { code: 'INVALID_ACTION', message: 'Invalid request', retryable: false, correlationId } };
      }
      const caller: Caller = {
        uid: req.auth.uid,
        name: (req.auth.token.name as string | undefined) ?? null,
        picture: (req.auth.token.picture as string | undefined) ?? null,
      };
      const started = Date.now();
      try {
        const data = await fn(getCtx(), caller, parsed.data, req);
        logger.info('ok', { fn: name, correlationId, uid: uidHash(caller.uid), ms: Date.now() - started });
        return { ok: true, data };
      } catch (e) {
        if (e instanceof DomainError) {
          logger.info('rejected', { fn: name, correlationId, uid: uidHash(caller.uid), code: e.code });
          return { ok: false, error: { code: e.code, message: e.message, retryable: e.retryable, correlationId } };
        }
        logger.error('internal_error', { fn: name, correlationId, uid: uidHash(caller.uid), error: (e as Error).message });
        return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong – please retry', retryable: true, correlationId } };
      }
    },
  );
}
