import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z, type ZodType, type ZodTypeDef } from 'zod';
import {
  archivesPageSchema,
  chooseTokenSchema,
  createRoomSchema,
  DomainError,
  friendCodeSchema,
  friendUidSchema,
  inviteFriendSchema,
  joinRoomSchema,
  kickSchema,
  reactionSchema,
  requestIdSchema,
  respondFriendSchema,
  roomIdSchema,
  setReadySchema,
  updateProfileSchema,
  type ApiResult,
} from '../../../shared/index';
import type { AuthService } from '../auth/auth';
import * as friends from '../friend-service/friends';
import { submitGameAction } from '../game-engine/game-service';
import { Hub } from '../realtime/hub';
import { Presence } from '../realtime/presence';
import * as rooms from '../room-service/rooms';
import type { Caller, ServiceContext } from '../shared/context';
import { uidHash } from '../shared/ids';

const MAX_BODY = 64 * 1024;

type Handler = { schema: ZodType<unknown, ZodTypeDef, unknown>; run: (ctx: ServiceContext, caller: Caller, input: never) => Promise<unknown> };
const h = <I>(schema: ZodType<I, ZodTypeDef, unknown>, run: (ctx: ServiceContext, caller: Caller, input: I) => Promise<unknown>): Handler =>
  ({ schema, run }) as Handler;

const empty = z.object({}).strict();
const roomSettings = createRoomSchema.extend({ roomId: z.string().min(1).max(64) });
const inviteIdSchema = z.object({ inviteId: z.string().min(1).max(130) }).strict();

/** The API surface: one POST /api/<name> per former callable, same payloads and ApiResult contract. */
const HANDLERS: Record<string, Handler> = {
  bootstrapProfile: h(empty, (c, caller) => friends.bootstrapProfile(c, caller)),
  updateProfile: h(updateProfileSchema, (c, caller, i) => friends.updateProfile(c, caller, i)),
  sendFriendRequest: h(friendCodeSchema, (c, caller, i) => friends.sendFriendRequest(c, caller, i.friendCode)),
  respondFriendRequest: h(respondFriendSchema, (c, caller, i) => friends.respondFriendRequest(c, caller, i.requestId, i.response)),
  cancelFriendRequest: h(requestIdSchema, (c, caller, i) => friends.cancelFriendRequest(c, caller, i.requestId)),
  removeFriend: h(friendUidSchema, (c, caller, i) => friends.removeFriend(c, caller, i.friendUid)),
  getMyArchives: h(archivesPageSchema, (c, caller, i) => friends.getMyArchives(c, caller, i.cursor, i.pageSize)),
  deleteAccount: h(empty, async (c, caller) => {
    await friends.deleteAccountData(c, caller);
    return { deleted: true };
  }),
  createRoom: h(createRoomSchema, (c, caller, i) => rooms.createRoom(c, caller, i)),
  joinRoom: h(joinRoomSchema, (c, caller, i) => rooms.joinRoom(c, caller, i.inviteCode)),
  leaveRoom: h(roomIdSchema, (c, caller, i) => rooms.leaveRoom(c, caller, i.roomId)),
  kickMember: h(kickSchema, (c, caller, i) => rooms.kickMember(c, caller, i.roomId, i.uid)),
  setReady: h(setReadySchema, (c, caller, i) => rooms.setReady(c, caller, i.roomId, i.ready)),
  chooseToken: h(chooseTokenSchema, (c, caller, i) => rooms.chooseToken(c, caller, i.roomId, i.token)),
  updateRoomSettings: h(roomSettings, (c, caller, { roomId, ...s }) => rooms.updateRoomSettings(c, caller, roomId, s)),
  startGame: h(roomIdSchema, (c, caller, i) => rooms.startGame(c, caller, i.roomId)),
  inviteFriend: h(inviteFriendSchema, (c, caller, i) => rooms.inviteFriend(c, caller, i.roomId, i.friendUid)),
  dismissInvite: h(inviteIdSchema, (c, caller, i) => rooms.dismissInvite(c, caller, i.inviteId)),
  sendReaction: h(reactionSchema, (c, caller, i) => rooms.sendReaction(c, caller, i)),
  submitGameAction: h(z.unknown(), (c, caller, i) => submitGameAction(c, caller, i)),
};

export interface AppConfig {
  allowedOrigins: string[];
}

/** Tiny fixed-window limiter for unauthenticated endpoints (per IP). */
function ipLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (ip: string) => {
    const now = Date.now();
    const cur = hits.get(ip);
    if (!cur || cur.reset < now) {
      hits.set(ip, { n: 1, reset: now + windowMs });
      if (hits.size > 10_000) hits.clear();
      return true;
    }
    cur.n += 1;
    return cur.n <= max;
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new DomainError('INVALID_ACTION', 'Request too large');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DomainError('INVALID_ACTION', 'Invalid JSON');
  }
}

export interface App {
  server: Server;
  hub: Hub;
  presence: Presence;
  close(): Promise<void>;
}

export function createApp(ctx: ServiceContext, auth: AuthService, cfg: AppConfig): App {
  const presence = new Presence(() => ctx.clock.now());
  const allowed = (origin: string | undefined) => !origin || cfg.allowedOrigins.includes(origin) || cfg.allowedOrigins.includes('*');
  const hub = new Hub(ctx.db, auth, presence, allowed);
  const authLimit = ipLimiter(30, 60_000);

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, code: DomainError['code'], message: string, correlationId?: string) =>
    send(res, status, { ok: false, error: { code, message, retryable: code === 'INTERNAL' || code === 'RATE_LIMITED', correlationId } } satisfies ApiResult<never>);

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowed(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'content-type, authorization');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.writeHead(origin && allowed(origin) ? 204 : 403);
      return res.end();
    }
    if (origin && !allowed(origin)) return fail(res, 403, 'PERMISSION_DENIED', 'Origin not allowed');

    const url = new URL(req.url ?? '/', 'http://localhost');
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const correlationId = randomUUID();

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, { ok: true, connections: hub.connectionCount, google: auth.googleEnabled, devLogin: auth.devLoginEnabled });
      }

      if (req.method === 'POST' && (url.pathname === '/auth/google' || url.pathname === '/auth/dev')) {
        if (!authLimit(ip)) return fail(res, 429, 'RATE_LIMITED', 'Too many sign-in attempts', correlationId);
        const body = (await readJson(req)) as { credential?: unknown; name?: unknown };
        const caller =
          url.pathname === '/auth/google'
            ? await auth.verifyGoogle(String(body.credential ?? ''))
            : auth.devCaller(String(body.name ?? ''));
        const profile = await friends.bootstrapProfile(ctx, caller);
        const token = await auth.issue(caller);
        return send(res, 200, { ok: true, data: { token, uid: caller.uid, profile } });
      }

      const m = url.pathname.match(/^\/api\/([A-Za-z]+)$/);
      if (req.method === 'POST' && m) {
        const handler = HANDLERS[m[1]];
        if (!handler) return fail(res, 404, 'NOT_FOUND', 'Unknown endpoint', correlationId);
        const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const caller = await auth.verifySession(bearer);
        if (!caller) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in', correlationId);
        const parsed = handler.schema.safeParse(await readJson(req));
        if (!parsed.success) return fail(res, 400, 'INVALID_ACTION', 'Invalid request', correlationId);
        const started = Date.now();
        const data = await handler.run(ctx, caller, parsed.data as never);
        log('info', 'ok', { fn: m[1], correlationId, uid: uidHash(caller.uid), ms: Date.now() - started });
        return send(res, 200, { ok: true, data });
      }

      return fail(res, 404, 'NOT_FOUND', 'Not found', correlationId);
    } catch (e) {
      if (e instanceof DomainError) {
        // Domain rejections are normal game flow: 200 with ok:false keeps the ApiResult contract simple.
        return send(res, 200, { ok: false, error: { code: e.code, message: e.message, retryable: e.retryable, correlationId } });
      }
      log('error', 'internal_error', { path: url.pathname, correlationId, error: (e as Error).message });
      return fail(res, 500, 'INTERNAL', 'Something went wrong – please retry', correlationId);
    }
  });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return socket.destroy();
    hub.handleUpgrade(req, socket, head);
  });

  return {
    server,
    hub,
    presence,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

/** Structured JSON logs (one line each) – never raw uids or tokens. */
export function log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, message, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}
