import 'server-only';
import { env } from '../env';
import { fetchJson } from '../http';
import { decodeEntities, stripHtml, truncate } from '../text';
import type { RawDiscussion, SourceAdapter } from './types';

interface Q {
  question_id: number; title: string; body?: string; link: string; owner?: { display_name?: string };
  creation_date: number; last_activity_date: number; score: number; answer_count: number; is_answered: boolean;
  accepted_answer_id?: number; tags: string[]; view_count?: number;
}
interface Resp { items: Q[]; has_more: boolean; backoff?: number; quota_remaining?: number; error_message?: string }

/** Stack Overflow via the official Stack Exchange API v2.3. */
export const stackOverflow: SourceAdapter = {
  id: 'stackoverflow',
  isAvailable: () => true,
  async search(term, since, maxItems) {
    const out: RawDiscussion[] = [];
    const key = env.stackExchangeKey ? `&key=${encodeURIComponent(env.stackExchangeKey)}` : '';
    for (let page = 1; page <= 3 && out.length < maxItems; page++) {
      const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(term)}&fromdate=${Math.floor(since.getTime() / 1000)}&site=stackoverflow&pagesize=${Math.min(100, maxItems)}&page=${page}&filter=withbody${key}`;
      const res = await fetchJson<Resp>(url);
      if (res.error_message) throw new Error(`Stack Exchange: ${res.error_message}`);
      for (const q of res.items) {
        if (out.length >= maxItems) break;
        out.push({
          sourceId: 'stackoverflow', externalId: String(q.question_id), url: q.link,
          title: decodeEntities(q.title), body: truncate(stripHtml(q.body), 3000), author: q.owner?.display_name ?? null,
          createdAt: new Date(q.creation_date * 1000), lastActivityAt: new Date(q.last_activity_date * 1000),
          score: q.score, commentCount: q.answer_count, tags: q.tags ?? [],
          meta: { is_answered: q.is_answered, has_accepted_answer: Boolean(q.accepted_answer_id), view_count: q.view_count ?? null },
        });
      }
      if (res.backoff) await new Promise((r) => setTimeout(r, res.backoff! * 1000)); // API-mandated backoff
      if (!res.has_more) break;
    }
    return out;
  },
};
