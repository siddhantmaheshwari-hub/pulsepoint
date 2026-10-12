import 'server-only';
import postgres from 'postgres';
import { isLocalDatabase, normalizeDatabaseUrl } from './dburl';
import { env } from './env';

export type Sql = postgres.Sql;
let client: Sql | null = null;

/**
 * Neon Postgres over TCP (postgres.js). Use the *pooled* Neon connection string in production.
 * Server-only: this module can never be bundled for the browser.
 * Timestamps come back as ISO strings and numerics as numbers, so rows serialize cleanly to React.
 */
export function db(): Sql {
  if (client) return client;
  const url = normalizeDatabaseUrl(env.databaseUrl);
  const local = isLocalDatabase(url);
  client = postgres(url, {
    ssl: local ? false : 'require',
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    keep_alive: 30, // seconds; detect connections the Neon pooler dropped (seen live: CONNECTION_CLOSED, ECONNRESET)
    max_lifetime: 300, // recycle connections well before the pooler retires them
    prepare: false, // compatible with Neon's PgBouncer pooler
    onnotice: () => {},
    types: {
      isoTimestamp: { to: 1184, from: [1114, 1184], serialize: (x: Date | string) => (x instanceof Date ? x.toISOString() : x), parse: (x: string) => new Date(x).toISOString() },
      numericAsNumber: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  return client;
}

/** For tests: close the pool so the process can exit. */
export async function closeDb() {
  if (client) { await client.end({ timeout: 5 }); client = null; }
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}
