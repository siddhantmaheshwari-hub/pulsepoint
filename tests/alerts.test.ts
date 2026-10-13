import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { alertDay, buildAlertEmail, CLAIM_ALERT_SQL, failingSources, MARK_ALERT_FAILED_SQL, MARK_ALERT_SENT_SQL, redactSecrets, sourceFailedInRun, type RunStats } from '@/lib/alerts';

const run = (sources: RunStats['sources']): RunStats => ({ status: 'partial', started_at: '2026-10-13T01:00:00Z', sources });
const ok = { requests: 13, failures: 0, items: 40 };
const down = { requests: 3, failures: 3, items: 0, skipped: 'stopped after 3 consecutive failures' };

describe('which sources are failing', () => {
  it('a run fails for a source when every request failed or the breaker tripped', () => {
    expect(sourceFailedInRun(down)).toBe(true);
    expect(sourceFailedInRun({ requests: 13, failures: 13 })).toBe(true);
    expect(sourceFailedInRun({ requests: 13, failures: 2, items: 30 })).toBe(false); // partial trouble is not an outage
    expect(sourceFailedInRun({ skipped: 'missing credentials' })).toBeNull(); // not attempted
    expect(sourceFailedInRun(undefined)).toBeNull();
  });
  it('alerts only after 3 failed runs in a row (newest first)', () => {
    expect(failingSources([run({ github: down }), run({ github: down }), run({ github: down })])).toEqual(['github']);
    expect(failingSources([run({ github: down }), run({ github: down }), run({ github: ok })])).toEqual([]);
    expect(failingSources([run({ github: down }), run({ github: down })])).toEqual([]); // only 2 runs so far
    // runs where the source wasn't attempted don't break the streak
    expect(failingSources([run({ github: down }), run({ hackernews: ok }), run({ github: down }), run({ github: down })])).toEqual(['github']);
    expect(failingSources([run({ github: down, hackernews: ok }), run({ github: down, hackernews: ok }), run({ github: down, hackernews: ok })])).toEqual(['github']);
  });
});

describe('alert email', () => {
  it('never contains secrets', () => {
    const msg = 'connect failed postgres://example_user:npg_AbC123xyz@ep-x.neon.tech/db?sslmode=require; key AIzaSyD-1234567890abcdef; Bearer abc.def; token ghp_ABCDEF123456 re_FAKEKEY_000000; ?key=supersecret';
    const r = redactSecrets(msg);
    for (const s of ['npg_AbC123xyz', 'example_user', 'AIzaSyD', 'abc.def', 'ghp_ABCDEF', 're_FAKEKEY', 'supersecret']) expect(r).not.toContain(s);
    expect(r).toContain('connect failed');
  });
  it('says what failed, when, the error and links to System health; escapes HTML', () => {
    const e = buildAlertEmail({ key: 'source_failing:github', what: 'GitHub Issues failed 3 runs in a row', detail: '[collect / github] code review: HTTP 401 <b>Bad credentials</b>' }, '14 Oct, 06:31 am IST', 'https://pulse.example/health');
    expect(e.subject).toBe('PulsePoint alert: GitHub Issues failed 3 runs in a row');
    expect(e.text).toContain('When: 14 Oct, 06:31 am IST');
    expect(e.text).toContain('HTTP 401');
    expect(e.html).toContain('href="https://pulse.example/health"');
    expect(e.html).not.toContain('<b>Bad');
    expect(e.html).not.toContain('undefined');
  });
  it('uses the IST calendar day', () => {
    expect(alertDay(new Date('2026-10-13T19:00:00Z'))).toBe('2026-10-14'); // 00:30 IST on the 14th
    expect(alertDay(new Date('2026-10-13T18:00:00Z'))).toBe('2026-10-13');
  });
});

describe('at most one alert per problem per day', () => {
  const pg = new PGlite();
  const claim = async (key: string, day: string) => (await pg.query<{ key: string }>(CLAIM_ALERT_SQL, [key, day, 'PulsePoint alert: test'])).rows.length === 1;

  beforeAll(async () => { await pg.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0007_alerts.sql'), 'utf8')); });
  afterAll(() => pg.close());

  it('the first claim of the day wins; repeats the same day are refused', async () => {
    expect(await claim('run_failed:cron_daily', '2026-10-14')).toBe(true);
    await pg.query(MARK_ALERT_SENT_SQL, ['run_failed:cron_daily', '2026-10-14']);
    expect(await claim('run_failed:cron_daily', '2026-10-14')).toBe(false);
    expect(await claim('run_failed:cron_daily', '2026-10-14')).toBe(false);
  });
  it('a different problem, or the next day, alerts again', async () => {
    expect(await claim('source_failing:github', '2026-10-14')).toBe(true);
    expect(await claim('run_failed:cron_daily', '2026-10-15')).toBe(true);
  });
  it('a failed send can be retried the same day, once it succeeds no more', async () => {
    expect(await claim('source_failing:hackernews', '2026-10-14')).toBe(true);
    await pg.query(MARK_ALERT_FAILED_SQL, ['source_failing:hackernews', '2026-10-14', 'Resend: timeout']);
    expect(await claim('source_failing:hackernews', '2026-10-14')).toBe(true);
    await pg.query(MARK_ALERT_SENT_SQL, ['source_failing:hackernews', '2026-10-14']);
    expect(await claim('source_failing:hackernews', '2026-10-14')).toBe(false);
  });
});
