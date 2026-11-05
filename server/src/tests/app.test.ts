import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AuthService } from '../auth/auth';
import { MemoryDb } from '../db/memory-db';
import { createApp, type App } from '../http/app';
import { startJobs } from '../jobs';
import { canReadDoc, canRunQuery } from '../realtime/access';
import type { ServiceContext } from '../shared/context';
import { randomCode } from '../shared/ids';

// End-to-end: real HTTP server + WebSocket clients against the in-memory database.

const ORIGIN = 'http://localhost:5173';
let app: App;
let base: string;
let db: MemoryDb;
let stopJobs: () => void;
let n = 0;
let faces: number[] = [];

beforeEach(async () => {
  db = new MemoryDb();
  faces = [];
  const ctx: ServiceContext = {
    db,
    clock: { now: () => Date.now() },
    randomInt: (max) => (max === 6 && faces.length ? faces.shift()! - 1 : 0),
    newId: () => `id${++n}`,
    newCode: randomCode,
  };
  const auth = new AuthService({ sessionSecret: 'x'.repeat(40), devLogin: true });
  app = createApp(ctx, auth, { allowedOrigins: [ORIGIN] });
  stopJobs = startJobs(ctx, { timeoutEveryMs: 60_000, cleanupEveryMs: 60_000 });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  stopJobs();
  await app.close();
});

async function post<T = unknown>(path: string, body: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as { ok: boolean; data: T; error: { code: string } } };
}

async function login(name: string) {
  const r = await post<{ token: string; uid: string }>('/auth/dev', { name });
  expect(r.body.ok).toBe(true);
  return r.body.data;
}

const call = async <T = unknown>(token: string, fn: string, data: unknown = {}) => {
  const r = await post<T>(`/api/${fn}`, data, token);
  if (!r.body.ok) throw new Error(r.body.error.code);
  return r.body.data;
};

/** Minimal live client: collects pushed data per subscription id. */
async function live(token: string) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, { headers: { origin: ORIGIN } });
  const latest = new Map<string, unknown>();
  const errors = new Map<string, string>();
  const waiters: (() => void)[] = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.op === 'data') latest.set(m.id, m.data);
    if (m.op === 'error' && m.id) errors.set(m.id, m.code);
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ op: 'auth', token }));
  const until = async (check: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error('timed out waiting for live update');
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
  };
  return {
    sub: (id: string, doc: string) => ws.send(JSON.stringify({ op: 'sub', id, doc })),
    subq: (id: string, query: unknown) => ws.send(JSON.stringify({ op: 'subq', id, query })),
    latest,
    errors,
    until,
    close: () => ws.close(),
  };
}

describe('http api', () => {
  it('requires a session and rejects disallowed origins', async () => {
    expect((await post('/api/createRoom', {})).status).toBe(401);
    const res = await fetch(`${base}/api/bootstrapProfile`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' });
    expect(res.status).toBe(403);
    const bad = await post('/api/createRoom', {}, 'not-a-token');
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('same test name maps to the same seat (reconnect)', async () => {
    const a1 = await login('Asha');
    const a2 = await login('asha');
    expect(a1.uid).toBe(a2.uid);
  });

  it('validates payloads with the shared schemas', async () => {
    const { token } = await login('Asha');
    const r = await post('/api/createRoom', { maxPlayers: 9, mode: 'STANDARD', turnTimerSeconds: 0 }, token);
    expect(r.body.error.code).toBe('INVALID_ACTION');
  });
});

describe('live multiplayer over WebSocket', () => {
  it('two players see the same authoritative game; outsiders are locked out', async () => {
    const asha = await login('Asha');
    const ravi = await login('Ravi');
    const mallory = await login('Mallory');

    const { roomId, inviteCode } = await call<{ roomId: string; inviteCode: string }>(asha.token, 'createRoom', { maxPlayers: 4, mode: 'STANDARD', turnTimerSeconds: 0 });
    const aLive = await live(asha.token);
    aLive.subq('members', { collection: `rooms/${roomId}/members`, orderBy: { field: 'joinedAt', direction: 'asc' } });
    await aLive.until(() => (aLive.latest.get('members') as unknown[] | undefined)?.length === 1);

    await call(ravi.token, 'joinRoom', { inviteCode });
    await aLive.until(() => (aLive.latest.get('members') as unknown[]).length === 2);

    const mLive = await live(mallory.token);
    mLive.sub('room', `rooms/${roomId}`);
    mLive.subq('members', { collection: `rooms/${roomId}/members` });
    await mLive.until(() => mLive.errors.get('room') === 'PERMISSION_DENIED' && mLive.errors.get('members') === 'PERMISSION_DENIED');

    await call(ravi.token, 'setReady', { roomId, ready: true });
    const { gameId } = await call<{ gameId: string }>(asha.token, 'startGame', { roomId });

    const rLive = await live(ravi.token);
    aLive.sub('game', `games/${gameId}`);
    rLive.sub('game', `games/${gameId}`);
    rLive.subq('events', { collection: `games/${gameId}/events`, orderBy: { field: 'sequence', direction: 'desc' }, limit: 80 });
    mLive.sub('game', `games/${gameId}`);
    mLive.sub('private', `games/${gameId}/private/state`);
    await rLive.until(() => Boolean(rLive.latest.get('game')));
    await mLive.until(() => mLive.errors.get('game') === 'PERMISSION_DENIED' && mLive.errors.get('private') === 'PERMISSION_DENIED');

    const v = (rLive.latest.get('game') as { version: number }).version;
    faces.push(1, 2);
    const cmd = (type: string, version: number) => ({ commandId: randomUUID(), roomId, gameId, expectedVersion: version, type, payload: {} });
    // Out-of-turn roll is rejected.
    await expect(call(ravi.token, 'submitGameAction', cmd('ROLL_DICE', v))).rejects.toThrow('NOT_YOUR_TURN');
    await call(asha.token, 'submitGameAction', cmd('ROLL_DICE', v));

    await aLive.until(() => (aLive.latest.get('game') as { version: number }).version === v + 1);
    await rLive.until(() => (rLive.latest.get('game') as { version: number }).version === v + 1);
    const ga = aLive.latest.get('game') as { dice: { first: number; second: number }; players: { position: number }[] };
    const gr = rLive.latest.get('game') as typeof ga;
    expect(gr.dice).toEqual(ga.dice);
    expect(gr.players[0].position).toBe(3);
    await rLive.until(() => (rLive.latest.get('events') as { type: string }[]).some((e) => e.type === 'DICE_ROLLED'));

    // Presence comes from open connections.
    aLive.sub('ravi-status', `status/${ravi.uid}`);
    await aLive.until(() => (aLive.latest.get('ravi-status') as { state: string } | undefined)?.state === 'online');
    rLive.close();
    await aLive.until(() => (aLive.latest.get('ravi-status') as { state: string }).state === 'offline');

    aLive.close();
    mLive.close();
  });

  it('completion is archived automatically by the outbox job', async () => {
    const asha = await login('Asha');
    const ravi = await login('Ravi');
    const { roomId, inviteCode } = await call<{ roomId: string; inviteCode: string }>(asha.token, 'createRoom', { maxPlayers: 2, mode: 'STANDARD', turnTimerSeconds: 0 });
    await call(ravi.token, 'joinRoom', { inviteCode });
    await call(ravi.token, 'setReady', { roomId, ready: true });
    const { gameId } = await call<{ gameId: string }>(asha.token, 'startGame', { roomId });
    const game = (await db.get<{ version: number }>(`games/${gameId}`))!;
    await call(ravi.token, 'submitGameAction', { commandId: randomUUID(), roomId, gameId, expectedVersion: game.version, type: 'RESIGN', payload: {} });
    const end = Date.now() + 3000;
    while (!(await db.get(`gameArchives/${gameId}`)) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    const archives = await call<{ items: { winnerUid: string }[] }>(asha.token, 'getMyArchives', { cursor: null, pageSize: 5 });
    expect(archives.items[0].winnerUid).toBe(asha.uid);
  });
});

describe('read permissions', () => {
  it('mirror the old security rules', async () => {
    await db.runTransaction(async (tx) => {
      tx.set('rooms/r1', { roomId: 'r1' });
      tx.set('rooms/r1/members/alice', { uid: 'alice' });
      tx.set('games/g1', { roomId: 'r1' });
    });
    expect(await canReadDoc(db, 'alice', 'users/alice', {})).toBe(true);
    expect(await canReadDoc(db, 'bob', 'users/alice', {})).toBe(false);
    expect(await canReadDoc(db, 'alice', 'games/g1', { roomId: 'r1' })).toBe(true);
    expect(await canReadDoc(db, 'bob', 'games/g1', { roomId: 'r1' })).toBe(false);
    expect(await canReadDoc(db, 'alice', 'games/g1/private/state', {})).toBe(false);
    expect(await canReadDoc(db, 'alice', 'commandReceipts/x', {})).toBe(false);
    expect(await canReadDoc(db, 'alice', 'gameArchives/a', { participantUids: ['alice'] })).toBe(true);
    expect(await canReadDoc(db, 'bob', 'gameArchives/a', { participantUids: ['alice'] })).toBe(false);
    expect(await canRunQuery(db, 'alice', { collection: 'friendships', where: [['uids', 'array-contains', 'alice']] })).toBe(true);
    expect(await canRunQuery(db, 'alice', { collection: 'friendships', where: [['uids', 'array-contains', 'bob']] })).toBe(false);
    expect(await canRunQuery(db, 'alice', { collection: 'games' })).toBe(false);
    expect(await canRunQuery(db, 'bob', { collection: 'games/g1/events' })).toBe(false);
  });
});
