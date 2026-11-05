import oracledb from 'oracledb';
import { DomainError } from '../../../shared/index';
import { applyQuery } from './query';
import { collectionOf, type Db, type DocData, type Filter, type QueryDoc, type QueryOptions, type Tx } from './types';

// Oracle Autonomous Database adapter. Documents live as JSON in one table keyed by their path,
// e.g. "rooms/abc/members/uid". node-oracledb runs in Thin mode (pure JS, no Instant Client).

export const SCHEMA_SQL = [
  `CREATE TABLE ibt_docs (
     path       VARCHAR2(512) PRIMARY KEY,
     coll       VARCHAR2(512) NOT NULL,
     data       CLOB NOT NULL CHECK (data IS JSON),
     updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
   )`,
  `CREATE INDEX ibt_docs_coll ON ibt_docs (coll)`,
];

const RETRYABLE_ORA = new Set([1, 60, 8177]); // unique-key race on insert, deadlock, serialization
const MAX_ATTEMPTS = 6;

oracledb.fetchAsString = [oracledb.CLOB];

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface OracleConfig {
  user: string;
  password: string;
  connectString: string;
  poolMax?: number;
}

export class OracleDb implements Db {
  private listeners = new Set<(paths: string[]) => void>();

  private constructor(private readonly pool: oracledb.Pool) {}

  static async connect(cfg: OracleConfig): Promise<OracleDb> {
    const pool = await oracledb.createPool({
      user: cfg.user,
      password: cfg.password,
      connectString: cfg.connectString,
      poolMin: 1,
      poolMax: cfg.poolMax ?? 8,
      poolIncrement: 1,
    });
    const db = new OracleDb(pool);
    await db.ensureSchema();
    return db;
  }

  async ensureSchema(): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      const r = await conn.execute<[number]>(`SELECT COUNT(*) FROM user_tables WHERE table_name = 'IBT_DOCS'`);
      if (r.rows?.[0]?.[0]) return;
      for (const sql of SCHEMA_SQL) await conn.execute(sql);
    } finally {
      await conn.close();
    }
  }

  onChange(listener: (paths: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(paths: string[]) {
    if (paths.length) for (const l of this.listeners) l(paths);
  }

  async close() {
    await this.pool.close(5);
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const conn = await this.pool.getConnection();
      try {
        const cache = new Map<string, DocData | null>();
        const ops: { kind: 'set' | 'update' | 'delete'; path: string; data?: DocData }[] = [];
        const tx: Tx = {
          get: async <R>(path: string) => {
            if (ops.length) throw new Error('Transactions require all reads before writes');
            // Row lock serializes concurrent commands on the same document (e.g. a game snapshot).
            const r = await conn.execute<{ DATA: string }>(`SELECT data FROM ibt_docs WHERE path = :path FOR UPDATE`, { path }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const row = r.rows?.[0];
            const data = row ? (JSON.parse(row.DATA) as DocData) : null;
            cache.set(path, data);
            return (data ? structuredClone(data) : null) as R | null;
          },
          set: (path, data) => void ops.push({ kind: 'set', path, data: structuredClone(data) }),
          update: (path, data) => void ops.push({ kind: 'update', path, data: structuredClone(data) }),
          delete: (path) => void ops.push({ kind: 'delete', path }),
        };
        const result = await fn(tx);
        for (const op of ops) {
          if (op.kind === 'delete') {
            await conn.execute(`DELETE FROM ibt_docs WHERE path = :path`, { path: op.path });
            cache.set(op.path, null);
            continue;
          }
          let data = op.data!;
          if (op.kind === 'update') {
            let cur = cache.get(op.path);
            if (cur === undefined) {
              const r = await conn.execute<{ DATA: string }>(`SELECT data FROM ibt_docs WHERE path = :path FOR UPDATE`, { path: op.path }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
              cur = r.rows?.[0] ? (JSON.parse(r.rows[0].DATA) as DocData) : null;
            }
            if (!cur) throw new Error(`No document to update: ${op.path}`);
            data = { ...cur, ...data };
          }
          await conn.execute(
            `MERGE INTO ibt_docs d USING (SELECT :path AS path FROM dual) s ON (d.path = s.path)
             WHEN MATCHED THEN UPDATE SET d.data = :data, d.updated_at = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (path, coll, data) VALUES (:path, :coll, :data)`,
            { path: op.path, coll: collectionOf(op.path), data: { val: JSON.stringify(data), type: oracledb.CLOB } },
          );
          cache.set(op.path, data);
        }
        await conn.commit();
        this.emit([...new Set(ops.map((o) => o.path))]);
        return result;
      } catch (e) {
        await conn.rollback().catch(() => undefined);
        const errorNum = (e as { errorNum?: number }).errorNum;
        if (!(e instanceof DomainError) && errorNum && RETRYABLE_ORA.has(errorNum) && attempt < MAX_ATTEMPTS) continue;
        throw e;
      } finally {
        await conn.close().catch(() => undefined);
      }
    }
  }

  async get<T>(path: string): Promise<T | null> {
    const conn = await this.pool.getConnection();
    try {
      const r = await conn.execute<{ DATA: string }>(`SELECT data FROM ibt_docs WHERE path = :path`, { path }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return r.rows?.[0] ? (JSON.parse(r.rows[0].DATA) as T) : null;
    } finally {
      await conn.close();
    }
  }

  private async select(where: string, binds: Record<string, string>): Promise<[string, DocData][]> {
    const conn = await this.pool.getConnection();
    try {
      const r = await conn.execute<{ PATH: string; DATA: string }>(`SELECT path, data FROM ibt_docs WHERE ${where}`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (r.rows ?? []).map((row) => [row.PATH, JSON.parse(row.DATA) as DocData]);
    } finally {
      await conn.close();
    }
  }

  async query<T>(collectionPath: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    return applyQuery<T>(await this.select(`coll = :coll`, { coll: collectionPath }), filters, options);
  }

  async queryGroup<T>(collectionId: string, filters: Filter[], options?: QueryOptions): Promise<QueryDoc<T>[]> {
    const rows = await this.select(`coll = :id OR coll LIKE :pat ESCAPE '\\'`, { id: collectionId, pat: `%/${likeEscape(collectionId)}` });
    return applyQuery<T>(rows, filters, options);
  }

  async deleteTree(path: string): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      const binds = { path, pat: `${likeEscape(path)}/%` };
      const where = `path = :path OR path LIKE :pat ESCAPE '\\'`;
      const r = await conn.execute<{ PATH: string }>(`SELECT path FROM ibt_docs WHERE ${where}`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      await conn.execute(`DELETE FROM ibt_docs WHERE ${where}`, binds);
      await conn.commit();
      this.emit((r.rows ?? []).map((row) => row.PATH));
    } finally {
      await conn.close();
    }
  }
}
