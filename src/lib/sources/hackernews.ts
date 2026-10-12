import 'server-only';
import { fetchJson } from '../http';
import { phraseQuery, stripHtml, truncate } from '../text';
import type { RawDiscussion, SourceAdapter } from './types';

interface Hit {
  objectID: string; title?: string | null; url?: string | null; story_text?: string | null; comment_text?: string | null;
  author?: string; created_at_i: number; points?: number | null; num_comments?: number | null;
  story_id?: number | null; story_title?: string | null; story_url?: string | null; _tags?: string[];
}

/** Hacker News via the official Algolia search API (no key). Comments are folded into their thread. */
export const hackerNews: SourceAdapter = {
  id: 'hackernews',
  isAvailable: () => true,
  async search(term, since, maxItems, deadline) {
    const threads = new Map<string, RawDiscussion>();
    const sinceS = Math.floor(since.getTime() / 1000);
    for (let page = 0; page < 5 && threads.size < maxItems; page++) {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(phraseQuery(term))}&tags=(story,comment)&numericFilters=created_at_i>${sinceS}&hitsPerPage=100&page=${page}`;
      const res = await fetchJson<{ hits: Hit[]; nbPages: number }>(url, { deadline });
      for (const h of res.hits) {
        const isComment = h._tags?.includes('comment');
        const threadId = String(isComment ? h.story_id ?? h.objectID : h.objectID);
        const title = stripHtml(isComment ? h.story_title : h.title) || '(untitled thread)';
        const text = stripHtml(isComment ? h.comment_text : h.story_text);
        const at = new Date(h.created_at_i * 1000);
        const existing = threads.get(threadId);
        if (existing) {
          if (text && existing.body.length < 3000) existing.body = truncate(`${existing.body}\n---\n${text}`, 3000);
          if (at < existing.createdAt) existing.createdAt = at;
          if (at > existing.lastActivityAt) existing.lastActivityAt = at;
          continue;
        }
        if (threads.size >= maxItems) continue;
        threads.set(threadId, {
          sourceId: 'hackernews', externalId: threadId,
          url: `https://news.ycombinator.com/item?id=${threadId}`,
          title, body: truncate(text, 3000), author: h.author ?? null,
          createdAt: at, lastActivityAt: at,
          score: isComment ? null : h.points ?? null, commentCount: isComment ? null : h.num_comments ?? null,
          tags: [], meta: { external_url: (isComment ? h.story_url : h.url) ?? null, matched_via: isComment ? 'comment' : 'story' },
        });
      }
      if (page + 1 >= res.nbPages) break;
    }
    return [...threads.values()];
  },
};
