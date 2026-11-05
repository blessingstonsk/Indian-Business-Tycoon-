import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import type { AuthService } from '../auth/auth';
import { collectionOf, type Db } from '../db/types';
import { canReadDoc, canRunQuery, type QuerySpec } from './access';
import type { Presence } from './presence';

// Live sync over WebSocket. Clients subscribe to a document path or an allowlisted query; after every
// committed write the hub re-reads affected subscriptions, re-checks permissions and pushes changes.

const MAX_SUBS = 60;
const MAX_MESSAGE_BYTES = 16 * 1024;

const filterSchema = z.tuple([z.string().max(64), z.enum(['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in']), z.unknown()]);
const querySchema = z
  .object({
    collection: z.string().min(1).max(256).regex(/^[A-Za-z0-9_/-]+$/),
    where: z.array(filterSchema).max(4).optional(),
    orderBy: z.object({ field: z.string().max(64), direction: z.enum(['asc', 'desc']) }).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();
const clientMessage = z.discriminatedUnion('op', [
  z.object({ op: z.literal('auth'), token: z.string().max(4096) }),
  z.object({ op: z.literal('sub'), id: z.string().min(1).max(64), doc: z.string().min(1).max(256).regex(/^[A-Za-z0-9_/-]+$/) }),
  z.object({ op: z.literal('subq'), id: z.string().min(1).max(64), query: querySchema }),
  z.object({ op: z.literal('unsub'), id: z.string().min(1).max(64) }),
]);

interface Sub {
  doc?: string;
  query?: QuerySpec;
  last: string | null;
  denied: boolean;
}

interface Conn {
  ws: WebSocket;
  uid: string | null;
  subs: Map<string, Sub>;
  alive: boolean;
}

export class Hub {
  private wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private conns = new Set<Conn>();
  private unsubscribers: (() => void)[] = [];
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: Db,
    private readonly auth: AuthService,
    private readonly presence: Presence,
    private readonly isAllowedOrigin: (origin: string | undefined) => boolean,
  ) {
    this.unsubscribers.push(db.onChange((paths) => void this.onPaths(paths)));
    this.unsubscribers.push(presence.onChange((uid) => void this.onPaths([`status/${uid}`])));
    this.heartbeat = setInterval(() => {
      for (const c of this.conns) {
        if (!c.alive) c.ws.terminate();
        else {
          c.alive = false;
          c.ws.ping();
        }
      }
    }, 30_000);
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    if (!this.isAllowedOrigin(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws));
  }

  get connectionCount() {
    return this.conns.size;
  }

  close() {
    clearInterval(this.heartbeat);
    this.unsubscribers.forEach((u) => u());
    for (const c of this.conns) c.ws.terminate();
    this.wss.close();
  }

  private accept(ws: WebSocket) {
    const conn: Conn = { ws, uid: null, subs: new Map(), alive: true };
    this.conns.add(conn);
    const authTimer = setTimeout(() => !conn.uid && ws.close(4001, 'auth timeout'), 10_000);
    ws.on('pong', () => (conn.alive = true));
    // Handle each connection's messages strictly in order (auth must finish before subscriptions).
    let queue: Promise<void> = Promise.resolve();
    ws.on('message', (raw) => {
      queue = queue.then(() => this.onMessage(conn, raw.toString())).catch(() => undefined);
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      this.conns.delete(conn);
      if (conn.uid) this.presence.disconnected(conn.uid);
    });
  }

  private send(conn: Conn, msg: unknown) {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  private async onMessage(conn: Conn, raw: string) {
    let msg: z.infer<typeof clientMessage>;
    try {
      msg = clientMessage.parse(JSON.parse(raw));
    } catch {
      return this.send(conn, { op: 'error', code: 'INVALID_ACTION', message: 'Malformed message' });
    }
    if (msg.op === 'auth') {
      const caller = await this.auth.verifySession(msg.token);
      if (!caller) return conn.ws.close(4003, 'invalid session');
      if (conn.uid && conn.uid !== caller.uid) return conn.ws.close(4003, 'session changed');
      if (!conn.uid) {
        conn.uid = caller.uid;
        this.presence.connected(caller.uid);
      }
      return this.send(conn, { op: 'ready', uid: caller.uid });
    }
    if (!conn.uid) return this.send(conn, { op: 'error', code: 'UNAUTHENTICATED', message: 'Authenticate first' });
    if (msg.op === 'unsub') {
      conn.subs.delete(msg.id);
      return;
    }
    if (!conn.subs.has(msg.id) && conn.subs.size >= MAX_SUBS) {
      return this.send(conn, { op: 'error', id: msg.id, code: 'RATE_LIMITED', message: 'Too many subscriptions' });
    }
    const sub: Sub = msg.op === 'sub' ? { doc: msg.doc, last: null, denied: false } : { query: msg.query as QuerySpec, last: null, denied: false };
    conn.subs.set(msg.id, sub);
    await this.refresh(conn, msg.id, sub);
  }

  private async refresh(conn: Conn, id: string, sub: Sub) {
    const uid = conn.uid!;
    try {
      let payload: unknown;
      if (sub.doc) {
        const data = sub.doc.startsWith('status/')
          ? this.presence.get(sub.doc.slice('status/'.length))
          : await this.db.get<Record<string, unknown>>(sub.doc);
        if (!(await canReadDoc(this.db, uid, sub.doc, data as Record<string, unknown> | null))) return this.deny(conn, id, sub);
        payload = data;
      } else {
        const q = sub.query!;
        if (!(await canRunQuery(this.db, uid, q))) return this.deny(conn, id, sub);
        const rows = await this.db.query<Record<string, unknown>>(q.collection, q.where ?? [], { orderBy: q.orderBy, limit: q.limit });
        const topLevel = !q.collection.includes('/');
        const visible = topLevel ? (await Promise.all(rows.map(async (r) => ((await canReadDoc(this.db, uid, r.path, r.data)) ? r.data : null)))).filter(Boolean) : rows.map((r) => r.data);
        payload = visible;
      }
      const json = JSON.stringify(payload);
      if (json === sub.last && !sub.denied) return;
      sub.last = json;
      sub.denied = false;
      if (conn.subs.get(id) === sub) this.send(conn, { op: 'data', id, data: payload });
    } catch (e) {
      this.send(conn, { op: 'error', id, code: 'INTERNAL', message: 'Could not load data' });
      console.error('subscription refresh failed', (e as Error).message);
    }
  }

  private deny(conn: Conn, id: string, sub: Sub) {
    if (sub.denied) return;
    sub.denied = true;
    sub.last = null;
    this.send(conn, { op: 'error', id, code: 'PERMISSION_DENIED', message: 'You do not have access to this data' });
  }

  private async onPaths(paths: string[]) {
    const docs = new Set(paths);
    const colls = new Set(paths.map(collectionOf));
    // Membership changes can grant or revoke access to a whole room/game, so recheck those too.
    const rooms = new Set(paths.map((p) => p.match(/^rooms\/([^/]+)/)?.[1]).filter(Boolean));
    const work: Promise<void>[] = [];
    for (const conn of this.conns) {
      if (!conn.uid) continue;
      for (const [id, sub] of conn.subs) {
        const affected = sub.doc
          ? docs.has(sub.doc) || (sub.denied && [...rooms].some((r) => sub.doc!.startsWith(`rooms/${r}`)))
          : colls.has(sub.query!.collection) || [...rooms].some((r) => sub.query!.collection.startsWith(`rooms/${r}/`));
        if (affected) work.push(this.refresh(conn, id, sub));
      }
    }
    await Promise.all(work);
  }
}
