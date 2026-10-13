import { SetupNotice } from '@/components/SetupNotice';
import { PageHeader } from '@/components/ui/bits';
import { missingEnv } from '@/lib/env';
import { one, type SP } from '@/lib/params';
import { getKeywordCounts, getReport, listTopics, windowFor } from '@/lib/queries';
import { toggleKeyword, toggleTopic } from './actions';
import { AddKeywordForm, AddTopicForm } from './forms';
export const metadata = { title: 'Topics & keywords' };

export default async function TopicsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const w = windowFor(await getReport(one(sp.report)));
  const [{ topics }, counts] = await Promise.all([listTopics(), getKeywordCounts(w.start, w.end)]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Topics & keywords" lead="What PulsePoint listens for. Stored in the database and read at the start of every run, so changes apply to the next collection without a redeploy. New keywords look back 15 days so they can be compared fairly." />
      <div className="space-y-5">
        {topics.map((t) => (
          <article key={t.id} className={`panel p-6 ${t.is_active ? '' : 'border-dashed bg-paper'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-[17px] font-semibold tracking-[-0.01em]">{t.name}{!t.is_active && <span className="ml-2 text-xs font-normal text-ink-muted">paused</span>}</h2>{t.description && <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>}</div>
              <form action={toggleTopic}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="active" value={String(!t.is_active)} /><button className="pill h-8">{t.is_active ? 'Pause topic' : 'Resume topic'}</button></form>
            </div>
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {t.keywords.map((k) => {
                const c = counts.get(k.id);
                return (
                  <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                    <span className={`min-w-[10rem] flex-1 font-medium ${k.is_active ? '' : 'text-ink-faint line-through'}`}>{k.term}</span>
                    {k.is_active && !k.backfilled_at && <span className="tag h-5 bg-fresh-soft px-2 text-[11px] text-fresh">Backfill on next run</span>}
                    <span className="w-44 text-right text-xs tabular-nums text-ink-muted">{c ? `${c.discussions} discussions · ${c.mentions} mentions` : 'no matches this week'}</span>
                    <form action={toggleKeyword}><input type="hidden" name="id" value={k.id} /><input type="hidden" name="active" value={String(!k.is_active)} />
                      <button className="pill-quiet h-7" aria-label={`${k.is_active ? 'Pause' : 'Resume'} keyword ${k.term}`}>{k.is_active ? 'Pause' : 'Resume'}</button></form>
                  </li>
                );
              })}
              {!t.keywords.length && <li className="py-3 text-sm text-ink-muted">No keywords yet.</li>}
            </ul>
            <AddKeywordForm topicId={t.id} />
          </article>
        ))}
        <AddTopicForm />
      </div>
    </div>
  );
}
