import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyVote, DEFAULT_TEAM, DELETE_VOTE_SQL, parseTeam, tallyRows, UPSERT_VOTE_SQL, voteOf, type VoteRow } from '@/lib/votes';

describe('team list', () => {
  it('parses TEAM_MEMBERS and falls back to the default team', () => {
    expect(parseTeam(' Sumit, Neha ,Kabir,Neha')).toEqual(['Sumit', 'Neha', 'Kabir']);
    expect(parseTeam('')).toEqual(DEFAULT_TEAM);
    expect(parseTeam('<script>, ,')).toEqual(DEFAULT_TEAM);
  });
});

describe('tally', () => {
  it('counts votes per item with names', () => {
    const t = tallyRows([
      { item_type: 'finding', item_index: 0, voter: 'Sumit', useful: true },
      { item_type: 'finding', item_index: 0, voter: 'Neha', useful: true },
      { item_type: 'finding', item_index: 0, voter: 'Kabir', useful: false },
      { item_type: 'recommendation', item_index: 1, voter: 'Neha', useful: false },
    ]);
    expect(t['finding:0']).toEqual({ up: ['Neha', 'Sumit'], down: ['Kabir'] });
    expect(t['recommendation:1']).toEqual({ up: [], down: ['Neha'] });
    expect(voteOf(t['finding:0'], 'Kabir')).toBe(false);
    expect(voteOf(t['finding:0'], null)).toBeNull();
  });
  it('one vote per person: changing moves the name, clearing removes it', () => {
    let t = { up: ['Sumit'], down: [] as string[] };
    t = applyVote(t, 'Neha', true);
    expect(t).toEqual({ up: ['Neha', 'Sumit'], down: [] });
    t = applyVote(t, 'Neha', false);
    expect(t).toEqual({ up: ['Sumit'], down: ['Neha'] });
    t = applyVote(t, 'Neha', false); // same vote again would be sent as null by the button; applying twice never duplicates
    expect(t.down).toEqual(['Neha']);
    t = applyVote(t, 'Sumit', null);
    expect(t).toEqual({ up: [], down: ['Neha'] });
  });
});

describe('votes in the database (migrations 0004 + 0006)', () => {
  const pg = new PGlite();
  const report = 'bbbbbbbb-0000-0000-0000-000000000001';
  const vote = (voter: string, useful: boolean, index = 0) => pg.query(UPSERT_VOTE_SQL, [report, 'finding', index, 'AI PR volume', useful, voter]);
  const rows = async () => (await pg.query<VoteRow>(`select item_type, item_index, voter, useful from finding_feedback order by voter`)).rows;
  const sqlFile = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');

  beforeAll(async () => {
    await pg.exec(`create table public.reports (id uuid primary key); insert into public.reports values ('${report}');`);
    await pg.exec(sqlFile('0004_feedback.sql'));
    // A rating made before team votes existed:
    await pg.exec(`insert into finding_feedback (report_id, item_type, item_index, item_text, useful) values ('${report}', 'finding', 1, 'old', true)`);
    await pg.exec(sqlFile('0006_votes_voter.sql'));
  });
  afterAll(() => pg.close());

  it('keeps existing ratings as Sumit’s', async () => {
    expect((await rows()).find((r) => r.item_index === 1)?.voter).toBe('Sumit');
  });
  it('Sumit then Neha on the same item gives 👍 2', async () => {
    await vote('Sumit', true);
    await vote('Neha', true);
    expect(tallyRows((await rows()).filter((r) => r.item_index === 0))['finding:0']).toEqual({ up: ['Neha', 'Sumit'], down: [] });
  });
  it('a second vote by the same person updates it instead of adding one', async () => {
    await vote('Neha', false);
    const item0 = (await rows()).filter((r) => r.item_index === 0);
    expect(item0).toHaveLength(2);
    expect(tallyRows(item0)['finding:0']).toEqual({ up: ['Sumit'], down: ['Neha'] });
  });
  it('clearing removes only that person’s vote', async () => {
    await pg.query(DELETE_VOTE_SQL, [report, 'finding', 0, 'Neha']);
    expect(tallyRows((await rows()).filter((r) => r.item_index === 0))['finding:0']).toEqual({ up: ['Sumit'], down: [] });
  });
  it('the migration is safe to run again', async () => {
    await pg.exec(sqlFile('0006_votes_voter.sql'));
    expect((await rows()).length).toBe(2);
  });
});
