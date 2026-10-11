import { SetupNotice } from '@/components/SetupNotice';
import { missingEnv } from '@/lib/env';
import { listTopics } from '@/lib/queries';
import { toggleKeyword, toggleSource, toggleTopic } from './actions';
import { AddKeywordForm, AddTopicForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function TopicsPage() {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const { topics, sources } = await listTopics();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Topics & keywords</h1>
      <p className="mt-1 text-sm text-muted">Stored in the Neon database and read at the start of every run — changes apply to the next collection without a redeploy. Pausing keeps history; the brief flags keyword changes so trends are not misread.</p>

      <section className="mt-6" aria-labelledby="src-h">
        <h2 id="src-h" className="h-section">Sources</h2>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-panel">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <span><span className="font-medium">{s.name}</span><span className="text-muted"> · up to {s.config?.maxItemsPerKeyword ?? 25} per keyword per run{s.id === 'github' ? ' · needs GITHUB_TOKEN' : ''}</span></span>
              <form action={toggleSource}>
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="enabled" value={String(!s.is_enabled)} />
                <button className="btn">{s.is_enabled ? 'Pause' : 'Enable'}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 space-y-5" aria-label="Topics">
        {topics.map((t) => (
          <article key={t.id} className={`rounded-lg border border-line bg-panel p-4 ${t.is_active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{t.name} {!t.is_active && <span className="text-xs font-normal text-muted">(paused)</span>}</h3>
                {t.description && <p className="text-sm text-muted">{t.description}</p>}
              </div>
              <form action={toggleTopic}>
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="active" value={String(!t.is_active)} />
                <button className="btn">{t.is_active ? 'Pause topic' : 'Resume topic'}</button>
              </form>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {t.keywords.map((k) => (
                <li key={k.id}>
                  <form action={toggleKeyword} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${k.is_active ? 'border-line' : 'border-dashed border-line text-muted line-through'}`}>
                    <span>{k.term}</span>
                    {!k.backfilled_at && k.is_active && <span className="text-[11px] text-fresh no-underline">backfill pending</span>}
                    <input type="hidden" name="id" value={k.id} /><input type="hidden" name="active" value={String(!k.is_active)} />
                    <button className="text-xs text-steel hover:underline" aria-label={`${k.is_active ? 'Pause' : 'Resume'} keyword ${k.term}`}>{k.is_active ? 'Pause' : 'Resume'}</button>
                  </form>
                </li>
              ))}
            </ul>
            <AddKeywordForm topicId={t.id} />
          </article>
        ))}
        <AddTopicForm />
      </section>
    </div>
  );
}
