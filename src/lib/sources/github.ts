import 'server-only';
import { env } from '../env';
import { fetchJson } from '../http';
import { truncate } from '../text';
import type { SourceAdapter } from './types';

interface Issue {
  id: number; html_url: string; title: string; body?: string | null; user?: { login?: string }; created_at: string; updated_at: string;
  comments: number; state: string; labels?: { name?: string }[]; repository_url: string; reactions?: { total_count?: number };
}

/** GitHub Issues search (requires GITHUB_TOKEN; disabled by default in the sources table). */
export const gitHub: SourceAdapter = {
  id: 'github',
  isAvailable: () => Boolean(env.githubToken),
  async search(term, since, maxItems, deadline) {
    const q = `"${term}" in:title,body is:issue created:>=${since.toISOString().slice(0, 10)}`;
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${Math.min(50, maxItems)}`;
    const res = await fetchJson<{ items: Issue[] }>(url, {
      headers: { Authorization: `Bearer ${env.githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'developer-community-pulse' },
      deadline,
    });
    return res.items.slice(0, maxItems).map((i) => ({
      sourceId: 'github' as const, externalId: String(i.id), url: i.html_url, title: i.title,
      body: truncate((i.body ?? '').replace(/```[\s\S]*?```/g, ' [code] '), 3000), author: i.user?.login ?? null,
      createdAt: new Date(i.created_at), lastActivityAt: new Date(i.updated_at), score: i.reactions?.total_count ?? null,
      commentCount: i.comments, tags: (i.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
      meta: { state: i.state, repo: i.repository_url.replace('https://api.github.com/repos/', '') },
    }));
  },
};
