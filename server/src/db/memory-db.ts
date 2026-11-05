import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyQuery, inCollectionGroup } from './query';
import type { Db, DocData, Filter, QueryDoc, QueryOptions, Tx } from './types';

/**
 * In-memory Db used by tests and local development. Transactions run one at a time (serializable),
 * and reading after writing inside a transaction throws, matching the Oracle adapter's contract.
 * With `file`, the data is persisted as JSON so a dev server restart keeps rooms and games.
 */
export class MemoryDb implements Db {
  docs = new Map<string, DocData>();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(paths: string[]) => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, DocData>;
      this.docs = new Map(Object.entries(raw));
    }
  }

  onChange(listener: (paths: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(paths: string[]) {
    if (!paths.length) return;
    for (const l of this.listeners) l(paths);
    if (this.file && !this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flush();
      }, 250);
    }
  }

  /** Write the dev database to disk atomically. */
  flush() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.docs)));
    renameSync(tmp, this.file);
  }

  async close() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.flush();
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const writes: Array<() => void> = [];
      const touched = new Set<string>();
      let wrote = false;
      const tx: Tx = {
        get: async <R>(path: string) => {
          if (wrote) throw new Error('Transactions require all reads before writes');
          return this.read<R>(path);
        },
        set: (path, data) => {
          wrote = true;
          touched.add(path);
          writes.push(() => this.docs.set(path, structuredClone(data)));
        },
        update: (path, data) => {
          wrote = true;
          touched.add(path);
          writes.push(() => {
            const cur = this.docs.get(path);
            if (!cur) throw new Error(`No document to update: ${path}`);
            this.docs.set(path, { ...cur, ...structuredClone(data) });
          });
        },
        delete: (path) => {
          wrote = true;
          touched.add(path);
          writes.push(() => this.docs.delete(path));
        },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      this.emit([...touched]);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async get<T>(path: string): Promise<T | null> {
    return this.read<T>(path);
  }

  private read<T>(path: string): T | null {
    const d = this.docs.get(path);
    return d ? (structuredClone(d) as T) : null;
  }

  async query<T>(collectionPath: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    const depth = collectionPath.split('/').length + 1;
    const matches = [...this.docs.entries()].filter(([path]) => path.split('/').length === depth && path.startsWith(`${collectionPath}/`));
    return applyQuery<T>(matches, filters, options);
  }

  async queryGroup<T>(collectionId: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    const matches = [...this.docs.entries()].filter(([path]) => inCollectionGroup(path, collectionId));
    return applyQuery<T>(matches, filters, options);
  }

  async deleteTree(path: string): Promise<void> {
    const removed: string[] = [];
    for (const key of [...this.docs.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) {
        this.docs.delete(key);
        removed.push(key);
      }
    }
    this.emit(removed);
  }
}
