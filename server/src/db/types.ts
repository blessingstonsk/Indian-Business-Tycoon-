// Minimal document-store port: Oracle in production, in-memory for tests and local development.
// Transactions are serializable and all reads must precede writes, in every adapter.

export type DocData = Record<string, unknown>;

export type FilterOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';
export type Filter = [field: string, op: FilterOp, value: unknown];

export interface QueryOptions {
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  /** value of the orderBy field to start after (cursor pagination) */
  startAfter?: unknown;
}

export interface QueryDoc<T> {
  path: string;
  id: string;
  data: T;
}

export interface Tx {
  get<T = DocData>(path: string): Promise<T | null>;
  set(path: string, data: DocData): void;
  /** shallow merge of top-level fields */
  update(path: string, data: DocData): void;
  delete(path: string): void;
}

export interface Db {
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  get<T = DocData>(path: string): Promise<T | null>;
  query<T = DocData>(collectionPath: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]>;
  /** query every collection with this id at any depth */
  queryGroup<T = DocData>(collectionId: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]>;
  /** delete a document and all of its subcollections; succeeds if absent */
  deleteTree(path: string): Promise<void>;
  /** called after every committed write with the document paths that changed (drives live sync) */
  onChange(listener: (paths: string[]) => void): () => void;
  close?(): Promise<void>;
}

/** Parent collection path of a document path: "rooms/r1/members/u1" → "rooms/r1/members". */
export function collectionOf(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
