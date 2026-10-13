// Team votes (👍 / 👎) on AI items in a brief. Pure helpers (no database) so they can be unit-tested.
// One vote per person per item; changing a vote updates it; pressing your current vote again removes it.

export const VOTER_COOKIE = 'pp_voter';
export const DEFAULT_TEAM = ['Sumit', 'Neha', 'Kabir'];

export type Tally = { up: string[]; down: string[] };
export type VoteRow = { item_type: string; item_index: number; voter: string; useful: boolean };

/** TEAM_MEMBERS="Sumit,Neha,Kabir" → clean, de-duplicated names. Falls back to the default team. */
export function parseTeam(raw: string | null | undefined): string[] {
  const names = [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\p{L}][\p{L} .'-]{0,29}$/u.test(s)))];
  return names.length ? names : DEFAULT_TEAM;
}

/** Votes grouped per item, keyed "type:index". Names sorted so the display is stable. */
export function tallyRows(rows: VoteRow[]): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const r of rows) {
    const t = (out[`${r.item_type}:${r.item_index}`] ??= { up: [], down: [] });
    (r.useful ? t.up : t.down).push(r.voter);
  }
  for (const t of Object.values(out)) { t.up.sort(); t.down.sort(); }
  return out;
}

/** The tally after `voter` votes useful (true), not useful (false) or clears their vote (null). */
export function applyVote(t: Tally, voter: string, useful: boolean | null): Tally {
  const up = t.up.filter((v) => v !== voter), down = t.down.filter((v) => v !== voter);
  if (useful === true) up.push(voter);
  if (useful === false) down.push(voter);
  return { up: up.sort(), down: down.sort() };
}

export function voteOf(t: Tally, voter: string | null): boolean | null {
  if (!voter) return null;
  return t.up.includes(voter) ? true : t.down.includes(voter) ? false : null;
}

// Params: $1 report_id, $2 item_type, $3 item_index, $4 item_text, $5 useful, $6 voter.
export const UPSERT_VOTE_SQL = `
  insert into finding_feedback (report_id, item_type, item_index, item_text, useful, voter)
  values ($1, $2, $3, $4, $5, $6)
  on conflict (report_id, item_type, item_index, voter) do update set useful = excluded.useful, updated_at = now()`;
// Params: $1 report_id, $2 item_type, $3 item_index, $4 voter.
export const DELETE_VOTE_SQL = `delete from finding_feedback where report_id = $1 and item_type = $2 and item_index = $3 and voter = $4`;
