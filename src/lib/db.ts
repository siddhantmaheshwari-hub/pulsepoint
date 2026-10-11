import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** Service-role client. Server-only: this module can never be bundled for the browser. */
export function db(): SupabaseClient {
  if (!client) client = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Throw on Supabase errors so failures are never silently treated as empty data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Page through a query 1000 rows at a time (PostgREST caps responses). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await build(from, from + 999), what);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}
