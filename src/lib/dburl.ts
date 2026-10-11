// libpq-only URL options that postgres.js would otherwise forward to the server as settings
// (Neon's default string includes channel_binding=require, which the server rejects).
// postgres.js still authenticates with SCRAM-SHA-256 over TLS.
const LIBPQ_ONLY = ['channel_binding', 'gssencmode', 'sslcert', 'sslkey', 'sslcrl', 'sslpassword', 'krbsrvname', 'requiressl'];

export function normalizeDatabaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  for (const k of LIBPQ_ONLY) url.searchParams.delete(k);
  return url.toString();
}

export function isLocalDatabase(raw: string): boolean {
  const host = new URL(raw.trim()).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}
