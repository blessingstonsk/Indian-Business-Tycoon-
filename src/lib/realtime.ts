import { API_URL, getSession, onSessionChange, setSession } from './backend';

// One WebSocket to the game server. Hooks subscribe to a document path or an allowlisted query;
// the server pushes the current value and every later change. Reconnects with backoff and resubscribes.

export type Filter = [field: string, op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in', value: unknown];

export interface QuerySpec {
  collection: string;
  where?: Filter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
}

type SubMessage = { op: 'sub'; doc: string } | { op: 'subq'; query: QuerySpec };
interface Entry {
  msg: SubMessage;
  listeners: Set<(value: unknown, error: string | null) => void>;
  value: unknown;
  error: string | null;
  received: boolean;
}

class LiveClient {
  private ws: WebSocket | null = null;
  private entries = new Map<string, Entry>();
  /** Subscription keys can be long (query JSON); the wire uses short ids. */
  private ids = new Map<string, string>();
  private nextId = 1;
  private ready = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private statusListeners = new Set<(connected: boolean) => void>();

  constructor() {
    onSessionChange(() => this.restart());
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.restart());
    }
  }

  get connected() {
    return this.ready;
  }

  onStatus(l: (connected: boolean) => void): () => void {
    this.statusListeners.add(l);
    return () => void this.statusListeners.delete(l);
  }

  private setReady(v: boolean) {
    this.ready = v;
    this.statusListeners.forEach((l) => l(v));
  }

  private restart() {
    this.ws?.close();
    this.ws = null;
    this.setReady(false);
    if (this.timer) clearTimeout(this.timer);
    this.retry = 0;
    this.connect();
  }

  private connect() {
    const session = getSession();
    if (!session || !API_URL || this.ws) return;
    const ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ op: 'auth', token: session.token }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as { op: string; id?: string; data?: unknown; code?: string };
      if (m.op === 'ready') {
        this.retry = 0;
        this.setReady(true);
        for (const [id, e] of this.entries) ws.send(JSON.stringify({ ...e.msg, id }));
        return;
      }
      if (m.op === 'error' && !m.id) console.warn('Live connection error:', m.code);
      const entry = m.id ? this.entries.get(m.id) : undefined;
      if (!entry) return;
      if (m.op === 'data') {
        entry.value = m.data;
        entry.error = null;
      } else if (m.op === 'error') {
        entry.value = null;
        entry.error = m.code ?? 'INTERNAL';
      }
      entry.received = true;
      entry.listeners.forEach((l) => l(entry.value, entry.error));
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) this.ws = null;
      this.setReady(false);
      if (ev.code === 4003) return setSession(null); // session rejected: sign in again
      const delay = Math.min(15_000, 500 * 2 ** this.retry++) + Math.random() * 300;
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  subscribe(key: string, msg: SubMessage, listener: (value: unknown, error: string | null) => void): () => void {
    let id = this.ids.get(key);
    if (!id) {
      id = `s${this.nextId++}`;
      this.ids.set(key, id);
    }
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { msg, listeners: new Set(), value: null, error: null, received: false };
      this.entries.set(id, entry);
      if (this.ready) this.ws?.send(JSON.stringify({ ...msg, id }));
      else this.connect();
    } else if (entry.received) {
      listener(entry.value, entry.error);
    }
    entry.listeners.add(listener);
    return () => {
      entry!.listeners.delete(listener);
      if (!entry!.listeners.size) {
        this.entries.delete(id!);
        this.ids.delete(key);
        if (this.ready) this.ws?.send(JSON.stringify({ op: 'unsub', id }));
      }
    };
  }
}

export const live = new LiveClient();
