import type { SourceId } from '../types';

export interface RawDiscussion {
  sourceId: SourceId;
  externalId: string;
  url: string;
  title: string;
  body: string; // plain text, untrusted
  author: string | null;
  createdAt: Date; // first matching activity
  lastActivityAt: Date;
  score: number | null;
  commentCount: number | null;
  tags: string[];
  meta: Record<string, unknown>; // e.g. is_answered, state, external link
}

export interface SourceAdapter {
  id: SourceId;
  isAvailable(): boolean;
  /** `deadline` (epoch ms) caps request timeouts and retries; see fetchJson. */
  search(term: string, since: Date, maxItems: number, deadline?: number): Promise<RawDiscussion[]>;
}
