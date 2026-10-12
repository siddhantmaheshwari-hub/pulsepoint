import 'server-only';
import { db } from '../db';
import type { SourceId } from '../types';

/** New keywords look back this far so the first report already has a week-over-week comparison. */
export const BACKFILL_DAYS = 15;

export interface ActiveKeyword { id: string; term: string; topic_id: string; topic_slug: string; backfilled_at: string | null }
export interface SourceRow { id: SourceId; name: string; is_enabled: boolean; config: { maxItemsPerKeyword?: number } }

export async function loadConfig() {
  const sql = db();
  const topics = await sql<{ id: string; slug: string; name: string }[]>`select id, slug, name from topics where is_active order by created_at`;
  const keywords = await sql<ActiveKeyword[]>`
    select k.id, k.term, k.topic_id, t.slug as topic_slug, k.backfilled_at
    from keywords k join topics t on t.id = k.topic_id
    where k.is_active and t.is_active order by k.created_at`;
  const sources = await sql<SourceRow[]>`select id, name, is_enabled, config from sources order by id`;
  return { topics: [...topics], keywords: [...keywords], sources: [...sources] };
}

/** Stable description of what was monitored, stored with every run and report. */
export function configSnapshot(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    topics: cfg.topics.map((t) => t.slug).sort(),
    keywords: cfg.keywords.map((k) => `${k.topic_slug}:${k.term.toLowerCase()}`).sort(),
    sources: cfg.sources.filter((s) => s.is_enabled).map((s) => s.id).sort(),
  };
}
