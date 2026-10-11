'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, isUniqueViolation } from '@/lib/db';
import { slugify } from '@/lib/text';

// Server actions run behind the Basic-auth middleware (POST requests require the dashboard password).
export type ActionState = { ok: boolean; message: string } | null;

const uuid = z.string().uuid();
const term = z.string().trim().min(2, 'Keyword must be at least 2 characters').max(80);
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);

function done(message: string): ActionState { revalidatePath('/topics'); return { ok: true, message }; }
function fail(message: string): ActionState { return { ok: false, message }; }

export async function addTopic(_: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ name, description: z.string().trim().max(300).optional() }).safeParse({ name: form.get('name'), description: form.get('description') || undefined });
  if (!p.success) return fail(p.error.issues[0].message);
  const slug = slugify(p.data.name);
  if (slug.length < 2) return fail('Use letters or numbers in the topic name');
  try {
    await db()`insert into topics (slug, name, description) values (${slug}, ${p.data.name}, ${p.data.description ?? null})`;
  } catch (e) {
    return fail(isUniqueViolation(e) ? 'A topic with this name already exists' : 'Could not save the topic. Try again.');
  }
  return done(`Added topic “${p.data.name}”`);
}

export async function addKeyword(_: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ topicId: uuid, term }).safeParse({ topicId: form.get('topicId'), term: form.get('term') });
  if (!p.success) return fail(p.error.issues[0].message);
  try {
    await db()`insert into keywords (topic_id, term) values (${p.data.topicId}, ${p.data.term})`;
  } catch (e) {
    return fail(isUniqueViolation(e) ? 'This keyword already exists in the topic' : 'Could not save the keyword. Try again.');
  }
  return done(`Added “${p.data.term}”. It will be backfilled 15 days on the next collection.`);
}

export async function toggleKeyword(form: FormData) {
  const p = z.object({ id: uuid, active: z.enum(['true', 'false']) }).safeParse({ id: form.get('id'), active: form.get('active') });
  if (!p.success) return;
  await db()`update keywords set is_active = ${p.data.active === 'true'}, updated_at = now() where id = ${p.data.id}`;
  revalidatePath('/topics');
}

export async function toggleTopic(form: FormData) {
  const p = z.object({ id: uuid, active: z.enum(['true', 'false']) }).safeParse({ id: form.get('id'), active: form.get('active') });
  if (!p.success) return;
  await db()`update topics set is_active = ${p.data.active === 'true'}, updated_at = now() where id = ${p.data.id}`;
  revalidatePath('/topics');
}

export async function toggleSource(form: FormData) {
  const p = z.object({ id: z.enum(['hackernews', 'stackoverflow', 'github']), enabled: z.enum(['true', 'false']) }).safeParse({ id: form.get('id'), enabled: form.get('enabled') });
  if (!p.success) return;
  await db()`update sources set is_enabled = ${p.data.enabled === 'true'} where id = ${p.data.id}`;
  revalidatePath('/topics');
}
