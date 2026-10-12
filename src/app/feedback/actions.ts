'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Synthesis } from '@/lib/types';

// Runs behind the Basic-auth middleware (POST requests require the dashboard password).
const input = z.object({
  reportId: z.string().uuid(),
  itemType: z.enum(['finding', 'underserved', 'recommendation']),
  itemIndex: z.number().int().min(0).max(20),
  useful: z.boolean().nullable(), // null clears the rating
});

/** Record Sumit's rating of one AI item in a stored brief. The item must exist in that report's synthesis. */
export async function recordFeedback(raw: z.input<typeof input>): Promise<{ ok: boolean; message?: string }> {
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, message: 'Invalid feedback' };
  const { reportId, itemType, itemIndex, useful } = p.data;
  const sql = db();
  const [rep] = await sql<{ synthesis: Synthesis | null }[]>`select synthesis from reports where id = ${reportId}`;
  const list = itemType === 'finding' ? rep?.synthesis?.findings : itemType === 'underserved' ? rep?.synthesis?.underserved : rep?.synthesis?.investigate;
  const item = list?.[itemIndex];
  if (!item) return { ok: false, message: 'That item is not part of this brief' };
  if (useful === null) {
    await sql`delete from finding_feedback where report_id = ${reportId} and item_type = ${itemType} and item_index = ${itemIndex}`;
  } else {
    const text = 'title' in item ? item.title : 'recommendation' in item ? item.recommendation : item.pain_point_key;
    await sql`insert into finding_feedback (report_id, item_type, item_index, item_text, useful)
      values (${reportId}, ${itemType}, ${itemIndex}, ${text}, ${useful})
      on conflict (report_id, item_type, item_index) do update set useful = excluded.useful, updated_at = now()`;
  }
  revalidatePath('/reports');
  return { ok: true };
}
