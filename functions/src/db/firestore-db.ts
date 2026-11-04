import { FieldValue, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';
import type { Db, DocData, Filter, QueryDoc, QueryOptions, Tx } from './types';

// Fields with this name are stored as Firestore Timestamps so TTL policies can act on them.
const TTL_FIELD = 'ttlAt';

function toStore(data: DocData): DocData {
  if (typeof data[TTL_FIELD] === 'number') return { ...data, [TTL_FIELD]: Timestamp.fromMillis(data[TTL_FIELD] as number) };
  return data;
}

function fromStore<T>(data: DocData | undefined): T | null {
  if (!data) return null;
  const ttl = data[TTL_FIELD];
  if (ttl instanceof Timestamp) return { ...data, [TTL_FIELD]: ttl.toMillis() } as T;
  return data as T;
}

function stripUndefined(data: DocData): DocData {
  return JSON.parse(JSON.stringify(data)) as DocData;
}

export class FirestoreDb implements Db {
  constructor(private readonly fs: Firestore) {}

  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.fs.runTransaction(async (t) => {
      const tx: Tx = {
        get: async <R>(path: string) => fromStore<R>((await t.get(this.fs.doc(path))).data()),
        set: (path, data) => void t.set(this.fs.doc(path), toStore(stripUndefined(data))),
        update: (path, data) => void t.update(this.fs.doc(path), toStore(stripUndefined(data)) as Record<string, FieldValue | Partial<unknown>>),
        delete: (path) => void t.delete(this.fs.doc(path)),
      };
      return fn(tx);
    });
  }

  async get<T>(path: string): Promise<T | null> {
    return fromStore<T>((await this.fs.doc(path).get()).data());
  }

  private async run<T>(q: Query, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    for (const [field, op, value] of filters) {
      const v = field === TTL_FIELD && typeof value === 'number' ? Timestamp.fromMillis(value) : value;
      q = q.where(field, op, v);
    }
    if (options?.orderBy) q = q.orderBy(options.orderBy.field, options.orderBy.direction);
    if (options?.startAfter !== undefined && options.startAfter !== null) q = q.startAfter(options.startAfter);
    if (options?.limit) q = q.limit(options.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ path: d.ref.path, id: d.id, data: fromStore<T>(d.data())! }));
  }

  query<T>(collectionPath: string, filters: Filter[], options?: QueryOptions) {
    return this.run<T>(this.fs.collection(collectionPath), filters, options);
  }

  queryGroup<T>(collectionId: string, filters: Filter[], options?: QueryOptions) {
    return this.run<T>(this.fs.collectionGroup(collectionId), filters, options);
  }

  async deleteTree(path: string): Promise<void> {
    await this.fs.recursiveDelete(this.fs.doc(path));
  }
}

export { FieldValue };
