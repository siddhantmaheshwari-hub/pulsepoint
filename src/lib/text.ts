import { createHash } from 'crypto';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/' };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n] ?? m);
}

/** Strip HTML from untrusted community content. Output is plain text only. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  const noBlocks = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, ' [code] ')
    .replace(/<br\s*\/?>|<\/p>|<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return collapse(decodeEntities(noBlocks));
}

export function collapse(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-phrase, case-insensitive mention count. Allows simple plural/hyphen variants. */
export function countMentions(term: string, text: string): number {
  const t = normalizeForMatch(term);
  if (!t) return 0;
  const pattern = escapeRegex(t).replace(/\\?[ -]/g, '[\\s-]+');
  const re = new RegExp(`(?<![a-z0-9])${pattern}(?:s|es)?(?![a-z0-9])`, 'gi');
  return (normalizeForMatch(text).match(re) ?? []).length;
}

/** Fingerprint for near-duplicate detection across sources (cross-posts, mirrors). */
export function fingerprint(title: string, body: string): string {
  const norm = (normalizeForMatch(title) + ' ' + normalizeForMatch(body).slice(0, 200)).replace(/[^a-z0-9 ]/g, '');
  return createHash('sha256').update(norm).digest('hex').slice(0, 32);
}

/** True when the quote appears verbatim (modulo whitespace/case) in the source text. */
export function quoteIsVerbatim(quote: string | null | undefined, source: string): boolean {
  if (!quote) return false;
  const q = normalizeForMatch(quote).replace(/[…"]/g, '').trim();
  if (q.length < 12) return false;
  return normalizeForMatch(source).replace(/"/g, '').includes(q);
}

export function slugify(s: string, max = 60): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
}

/**
 * Search engines (Algolia, Stack Exchange) match the words of an unquoted query loosely, so most hits fail
 * our exact-phrase check and waste the per-keyword item cap. Quoting multi-word terms asks for the phrase.
 */
export function phraseQuery(term: string): string {
  const t = collapse(term.replace(/"/g, ' '));
  return /\s/.test(t) ? `"${t}"` : t;
}
