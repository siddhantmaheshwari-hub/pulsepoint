// Throwaway in-memory Postgres (PGlite) for integration tests when no Postgres/Docker is installed.
// Usage: npm run test:db   then, in another shell:
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55433/postgres npm run test:integration
// Everything lives in memory and disappears when the process stops. Never point tests at Neon production.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.TEST_DB_PORT ?? 55433);
const db = await PGlite.create({ extensions: { pgcrypto } });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`PGlite test database ready: postgres://postgres@127.0.0.1:${port}/postgres`);

const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
