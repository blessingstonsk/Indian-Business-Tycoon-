import { readFileSync, existsSync } from 'node:fs';
import { AuthService } from './auth/auth';
import { MemoryDb } from './db/memory-db';
import { OracleDb } from './db/oracle-db';
import { systemClock, type Db } from './db/types';
import { createApp, log } from './http/app';
import { startJobs } from './jobs';
import type { ServiceContext } from './shared/context';
import { randomCode, randomId, secureRandomInt } from './shared/ids';

// Minimal .env loader (no dependency): KEY=value lines, existing env wins.
const envFile = process.env.ENV_FILE ?? '.env';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const production = env.NODE_ENV === 'production';

async function openDb(): Promise<Db> {
  if (env.ORACLE_CONNECT_STRING) {
    const db = await OracleDb.connect({
      user: env.ORACLE_USER ?? 'ADMIN',
      password: env.ORACLE_PASSWORD ?? '',
      connectString: env.ORACLE_CONNECT_STRING,
    });
    log('info', 'db_connected', { kind: 'oracle' });
    return db;
  }
  if (production) throw new Error('ORACLE_CONNECT_STRING is required in production');
  const file = env.DEV_DB_FILE ?? 'data/dev-db.json';
  log('warn', 'db_connected', { kind: 'memory', file, note: 'development only' });
  return new MemoryDb(file);
}

async function main() {
  const sessionSecret = env.SESSION_SECRET ?? (production ? '' : 'dev-only-insecure-session-secret-change-me-please');
  const auth = new AuthService({
    sessionSecret,
    googleClientId: env.GOOGLE_CLIENT_ID || undefined,
    devLogin: env.DEV_LOGIN === 'true' && !production,
  });
  const db = await openDb();
  const ctx: ServiceContext = { db, clock: systemClock, randomInt: secureRandomInt, newId: randomId, newCode: randomCode };
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
  const app = createApp(ctx, auth, { allowedOrigins });
  const stopJobs = startJobs(ctx);

  const port = Number(env.PORT ?? 8787);
  const host = env.HOST ?? '127.0.0.1';
  app.server.listen(port, host, () => log('info', 'listening', { url: `http://${host}:${port}`, allowedOrigins, google: auth.googleEnabled, devLogin: auth.devLoginEnabled }));

  const shutdown = async (signal: string) => {
    log('info', 'shutting_down', { signal });
    stopJobs();
    await app.close();
    await db.close?.();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  log('error', 'startup_failed', { error: (e as Error).message });
  process.exit(1);
});
