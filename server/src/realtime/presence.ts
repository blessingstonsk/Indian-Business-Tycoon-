// Online/offline status derived from open WebSocket connections. Display only: it never affects seats or rules.

export interface PresenceDoc {
  state: 'online' | 'offline';
  lastChanged: number;
}

export class Presence {
  private counts = new Map<string, number>();
  private last = new Map<string, number>();
  private listeners = new Set<(uid: string) => void>();

  constructor(private readonly now: () => number = Date.now) {}

  connected(uid: string) {
    const n = (this.counts.get(uid) ?? 0) + 1;
    this.counts.set(uid, n);
    if (n === 1) this.changed(uid);
  }

  disconnected(uid: string) {
    const n = (this.counts.get(uid) ?? 1) - 1;
    if (n <= 0) {
      this.counts.delete(uid);
      this.changed(uid);
    } else this.counts.set(uid, n);
  }

  get(uid: string): PresenceDoc {
    return { state: this.counts.has(uid) ? 'online' : 'offline', lastChanged: this.last.get(uid) ?? 0 };
  }

  onChange(l: (uid: string) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private changed(uid: string) {
    this.last.set(uid, this.now());
    for (const l of this.listeners) l(uid);
  }
}
