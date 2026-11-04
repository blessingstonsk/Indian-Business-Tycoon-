import type { Db, DocData, Filter, QueryDoc, QueryOptions, Tx } from './types';

/**
 * In-memory Db used by integration tests. Transactions run one at a time (serializable),
 * and reading after writing inside a transaction throws, exactly as Firestore does.
 */
export class MemoryDb implements Db {
  docs = new Map<string, DocData>();
  private queue: Promise<unknown> = Promise.resolve();

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const writes: Array<() => void> = [];
      let wrote = false;
      const tx: Tx = {
        get: async <R>(path: string) => {
          if (wrote) throw new Error('Firestore transactions require all reads before writes');
          return this.read<R>(path);
        },
        set: (path, data) => {
          wrote = true;
          writes.push(() => this.docs.set(path, clone(data)));
        },
        update: (path, data) => {
          wrote = true;
          writes.push(() => {
            const cur = this.docs.get(path);
            if (!cur) throw new Error(`No document to update: ${path}`);
            this.docs.set(path, { ...cur, ...clone(data) });
          });
        },
        delete: (path) => {
          wrote = true;
          writes.push(() => this.docs.delete(path));
        },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
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
    return d ? (clone(d) as T) : null;
  }

  async query<T>(collectionPath: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    const depth = collectionPath.split('/').length + 1;
    const matches = [...this.docs.entries()].filter(([path]) => {
      const parts = path.split('/');
      return parts.length === depth && path.startsWith(`${collectionPath}/`);
    });
    return this.finish<T>(matches, filters, options);
  }

  async queryGroup<T>(collectionId: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    const matches = [...this.docs.entries()].filter(([path]) => {
      const parts = path.split('/');
      return parts.length % 2 === 0 && parts[parts.length - 2] === collectionId;
    });
    return this.finish<T>(matches, filters, options);
  }

  async deleteTree(path: string): Promise<void> {
    for (const key of [...this.docs.keys()]) if (key === path || key.startsWith(`${path}/`)) this.docs.delete(key);
  }

  private finish<T>(entries: [string, DocData][], filters: Filter[], options?: QueryOptions): QueryDoc<T>[] {
    let rows = entries.filter(([, data]) => filters.every((f) => matchFilter(data, f)));
    const ob = options?.orderBy;
    if (ob) {
      const sign = ob.direction === 'asc' ? 1 : -1;
      rows = rows.sort(([, a], [, b]) => sign * compare(a[ob.field], b[ob.field]));
      if (options?.startAfter !== undefined && options.startAfter !== null) {
        rows = rows.filter(([, d]) => sign * compare(d[ob.field], options.startAfter) > 0);
      }
    }
    if (options?.limit) rows = rows.slice(0, options.limit);
    return rows.map(([path, data]) => ({ path, id: path.split('/').pop()!, data: clone(data) as T }));
  }
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  return (a as number) < (b as number) ? -1 : 1;
}

function matchFilter(data: DocData, [field, op, value]: Filter): boolean {
  const v = field.split('.').reduce<unknown>((o, k) => (o as DocData | undefined)?.[k], data);
  switch (op) {
    case '==':
      return v === value;
    case '!=':
      return v !== value && v !== undefined;
    case '<':
      return v !== undefined && v !== null && (v as number) < (value as number);
    case '<=':
      return v !== undefined && v !== null && (v as number) <= (value as number);
    case '>':
      return v !== undefined && v !== null && (v as number) > (value as number);
    case '>=':
      return v !== undefined && v !== null && (v as number) >= (value as number);
    case 'array-contains':
      return Array.isArray(v) && v.includes(value);
    case 'in':
      return Array.isArray(value) && value.includes(v);
  }
}

function clone<T>(v: T): T {
  return structuredClone(v);
}
