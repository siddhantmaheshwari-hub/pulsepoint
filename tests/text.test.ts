import { describe, expect, it } from 'vitest';
import { countMentions, fingerprint, quoteIsVerbatim, slugify, stripHtml } from '@/lib/text';

describe('stripHtml', () => {
  it('removes markup, scripts and code blocks from untrusted content', () => {
    const out = stripHtml('<p>Hi &amp; <b>bye</b></p><script>alert(1)</script><pre><code>rm -rf /</code></pre>&#x27;ok&#x27;');
    expect(out).not.toMatch(/<|alert|rm -rf/);
    expect(out).toContain('Hi & bye');
    expect(out).toContain("'ok'");
  });
});

describe('countMentions', () => {
  it('matches whole phrases case-insensitively, including plurals and hyphens', () => {
    expect(countMentions('code review', 'Code reviews are slow. Our code-review bot is noisy.')).toBe(2);
    expect(countMentions('false positives', 'So many false positives; one false positive per PR')).toBe(1);
    expect(countMentions('PR review', 'APR reviewed')).toBe(0);
  });
  it('does not treat regex characters as patterns', () => {
    expect(countMentions('CI/CD', 'our ci/cd pipeline')).toBe(1);
    expect(countMentions('c++', 'c++ build times')).toBe(1);
  });
});

describe('fingerprint', () => {
  it('is identical for cross-posts that differ only in formatting', () => {
    expect(fingerprint('Flaky tests block merges!', 'Every PR waits')).toBe(fingerprint('flaky tests block merges', 'every  PR waits'));
    expect(fingerprint('a', 'b')).not.toBe(fingerprint('a', 'c'));
  });
});

describe('quoteIsVerbatim', () => {
  const src = 'Our review bot flags 40 issues per PR and maybe two are real, so the team just ignores it now.';
  it('accepts quotes present in the source (whitespace/case-insensitive)', () => {
    expect(quoteIsVerbatim('flags 40 issues per PR and maybe two are real', src)).toBe(true);
    expect(quoteIsVerbatim('FLAGS 40 issues   per PR', src)).toBe(true);
  });
  it('rejects paraphrases, invented text and trivially short quotes', () => {
    expect(quoteIsVerbatim('the bot produces too many false alarms', src)).toBe(false);
    expect(quoteIsVerbatim('per PR', src)).toBe(false);
    expect(quoteIsVerbatim(null, src)).toBe(false);
  });
});

describe('slugify', () => {
  it('produces safe kebab-case keys', () => {
    expect(slugify('Review Bot: False Positives!!')).toBe('review-bot-false-positives');
  });
});
