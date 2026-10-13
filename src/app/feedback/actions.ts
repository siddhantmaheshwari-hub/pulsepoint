'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { Synthesis } from '@/lib/types';
import { getVoting } from '@/lib/voter';
import { DELETE_VOTE_SQL, parseTeam, UPSERT_VOTE_SQL, VOTER_COOKIE } from '@/lib/votes';

// No sign-in in this testing build: anyone with the link can vote, as one of the TEAM_MEMBERS names.
const input = z.object({
  reportId: z.string().uuid(),
  itemType: z.enum(['finding', 'underserved', 'recommendation']),
  itemIndex: z.number().int().min(0).max(20),
  useful: z.boolean().nullable(), // null clears the vote
});

/** "Who are you?" — remember the choice in this browser for a year. */
export async function chooseVoter(name: string): Promise<{ ok: boolean }> {
  if (!parseTeam(env.teamMembers).includes(name)) return { ok: false };
  (await cookies()).set(VOTER_COOKIE, name, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 365 * 86_400, path: '/' });
  revalidatePath('/');
  return { ok: true };
}

/** One teammate's 👍 / 👎 on one AI item in a stored brief. The item must exist in that report's synthesis. */
export async function recordFeedback(raw: z.input<typeof input>): Promise<{ ok: boolean; needVoter?: boolean; message?: string }> {
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, message: 'Invalid vote' };
  const { voter } = await getVoting();
  if (!voter) return { ok: false, needVoter: true };
  const { reportId, itemType, itemIndex, useful } = p.data;
  const sql = db();
  const [rep] = await sql<{ synthesis: Synthesis | null }[]>`select synthesis from reports where id = ${reportId}`;
  const list = itemType === 'finding' ? rep?.synthesis?.findings : itemType === 'underserved' ? rep?.synthesis?.underserved : rep?.synthesis?.investigate;
  const item = list?.[itemIndex];
  if (!item) return { ok: false, message: 'That item is not part of this brief' };
  if (useful === null) {
    await sql.unsafe(DELETE_VOTE_SQL, [reportId, itemType, itemIndex, voter]);
  } else {
    const text = 'title' in item ? item.title : 'recommendation' in item ? item.recommendation : item.pain_point_key;
    await sql.unsafe(UPSERT_VOTE_SQL, [reportId, itemType, itemIndex, text, useful, voter]);
  }
  revalidatePath('/reports');
  return { ok: true };
}
