import 'server-only';
import { db, must } from '../db';
import type { SourceId } from '../types';

export interface ActiveKeyword { id: string; term: string; topic_id: string; topic_slug: string; backfilled_at: string | null }
export interface SourceRow { id: SourceId; name: string; is_enabled: boolean; config: { maxItemsPerKeyword?: number } }

export async function loadConfig() {
  const topics = must(await db().from('topics').select('id, slug, name, is_active'), 'load topics') as { id: string; slug: string; name: string; is_active: boolean }[];
  const keywords = must(await db().from('keywords').select('id, term, topic_id, is_active, backfilled_at'), 'load keywords') as { id: string; term: string; topic_id: string; is_active: boolean; backfilled_at: string | null }[];
  const sources = must(await db().from('sources').select('id, name, is_enabled, config'), 'load sources') as SourceRow[];
  const activeTopics = topics.filter((t) => t.is_active);
  const slugById = new Map(activeTopics.map((t) => [t.id, t.slug]));
  const active: ActiveKeyword[] = keywords
    .filter((k) => k.is_active && slugById.has(k.topic_id))
    .map((k) => ({ id: k.id, term: k.term, topic_id: k.topic_id, topic_slug: slugById.get(k.topic_id)!, backfilled_at: k.backfilled_at }));
  return { topics: activeTopics, keywords: active, sources };
}

/** Stable description of what was monitored, stored with every run and report. */
export function configSnapshot(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    topics: cfg.topics.map((t) => t.slug).sort(),
    keywords: cfg.keywords.map((k) => `${k.topic_slug}:${k.term.toLowerCase()}`).sort(),
    sources: cfg.sources.filter((s) => s.is_enabled).map((s) => s.id).sort(),
  };
}
