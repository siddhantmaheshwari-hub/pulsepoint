import 'server-only';
import { db, fetchAll, must } from '../db';
import { env } from '../env';
import { geminiJson } from '../gemini';
import { buildMetrics, type AnalyzedRow, type PainPointInfo } from '../metrics';
import { validateSynthesis } from '../schemas';
import { truncate } from '../text';
import type { SourceId, Synthesis, TopicMetricRow } from '../types';
import { reportWindows } from '../windows';
import { configSnapshot, loadConfig } from './config';
import { ANALYSIS_VERSION, SYNTHESIS_SCHEMA, SYNTHESIS_SYSTEM } from './prompts';

interface JoinedRow {
  discussion_id: string; is_relevant: boolean; kind: AnalyzedRow['kind']; pain_point_key: string | null; topic_slug: string | null;
  resolution_status: AnalyzedRow['resolution_status']; evidence_quote: string | null; evidence_verified: boolean; confidence: number;
  existing_workaround: string | null;
  discussions: { source_id: SourceId; title: string; url: string; created_at_source: string; score: number | null };
}

export async function generateReport(runId: string, trigger: 'cron_weekly' | 'manual', errors: { stage: string; message: string }[], now = new Date()) {
  const w = reportWindows(now, env.tzOffsetMinutes);
  const [ps, ce] = [w.previousStart.toISOString(), w.currentEnd.toISOString()];
  const [cs] = [w.currentStart.toISOString()];

  const joined = await fetchAll<JoinedRow>((from, to) => db().from('discussion_analyses')
    .select('discussion_id, is_relevant, kind, pain_point_key, topic_slug, resolution_status, evidence_quote, evidence_verified, confidence, existing_workaround, discussions!inner(source_id, title, url, created_at_source, score, duplicate_of)')
    .eq('analysis_version', ANALYSIS_VERSION).gte('discussions.created_at_source', ps).lt('discussions.created_at_source', ce).is('discussions.duplicate_of', null)
    .order('discussion_id').range(from, to) as unknown as PromiseLike<{ data: JoinedRow[] | null; error: { message: string } | null }>, 'load analyses');

  const rows: AnalyzedRow[] = joined.map((j) => ({ ...j, confidence: Number(j.confidence), ...j.discussions }));
  const keys = [...new Set(rows.map((r) => r.pain_point_key).filter(Boolean))] as string[];
  const info = new Map<string, PainPointInfo>();
  for (let i = 0; i < keys.length; i += 200) {
    const pp = must(await db().from('pain_points').select('key, label, first_seen_at, last_seen_at').in('key', keys.slice(i, i + 200)), 'load pain points') as ({ key: string } & PainPointInfo)[];
    for (const p of pp) info.set(p.key, p);
  }
  const metrics = buildMetrics(rows, w, info);

  // Deterministic totals
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string) => { const r = await q; if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.count ?? 0; };
  const collectedCur = await count(db().from('discussions').select('id', { count: 'exact', head: true }).is('duplicate_of', null).gte('created_at_source', cs).lt('created_at_source', ce), 'count collected');
  const pendingWindow = await count(db().from('discussions').select('id', { count: 'exact', head: true }).is('duplicate_of', null).in('analysis_status', ['pending', 'failed']).gte('created_at_source', ps).lt('created_at_source', ce), 'count pending');
  const dupesCur = await count(db().from('discussions').select('id', { count: 'exact', head: true }).not('duplicate_of', 'is', null).gte('created_at_source', cs).lt('created_at_source', ce), 'count duplicates');
  const mentionRows = await fetchAll<{ mention_count: number }>((from, to) => db().from('discussion_matches').select('mention_count, discussions!inner(created_at_source, duplicate_of)').gte('discussions.created_at_source', cs).lt('discussions.created_at_source', ce).is('discussions.duplicate_of', null).range(from, to) as unknown as PromiseLike<{ data: { mention_count: number }[] | null; error: { message: string } | null }>, 'load mentions');

  const curRows = rows.filter((r) => Date.parse(r.created_at_source) >= w.currentStart.getTime());
  const totals = {
    discussions_collected: collectedCur,
    discussions_analyzed: curRows.length,
    relevant_discussions: curRows.filter((r) => r.is_relevant).length,
    pain_discussions: metrics.reduce((a, m) => a + m.current_count, 0),
    pain_discussions_previous: metrics.reduce((a, m) => a + m.previous_count, 0),
    keyword_mentions: mentionRows.reduce((a, m) => a + m.mention_count, 0),
    duplicates_excluded: dupesCur,
    pain_points_tracked: metrics.filter((m) => m.current_count > 0).length,
    rising: metrics.filter((m) => m.trend === 'rising').length,
    declining: metrics.filter((m) => m.trend === 'declining').length,
    new: metrics.filter((m) => m.trend === 'new').length,
    stable: metrics.filter((m) => m.trend === 'stable').length,
  };

  // Data quality & comparability
  const cfg = await loadConfig();
  const snapshot = configSnapshot(cfg);
  const prevReport = must(await db().from('reports').select('id, config_snapshot, totals').eq('period_end', w.previousEnd.toISOString()).order('version', { ascending: false }).limit(1), 'load previous report') as { id: string; config_snapshot: { keywords?: string[] }; totals: { pain_discussions?: number } }[];
  const runs = must(await db().from('collection_runs').select('started_at, stats, errors').gte('started_at', ps).order('started_at'), 'load runs') as { started_at: string; stats: { collect?: { sources?: Record<string, { failures: number; requests: number }> } }; errors: { source?: string }[] }[];
  const sourceFailures: Record<string, { failed_requests: number; requests: number }> = {};
  for (const run of runs) for (const [s, v] of Object.entries(run.stats?.collect?.sources ?? {})) {
    const acc = (sourceFailures[s] ??= { failed_requests: 0, requests: 0 });
    acc.failed_requests += v.failures; acc.requests += v.requests;
  }
  const prevKw = prevReport[0]?.config_snapshot?.keywords;
  const added = prevKw ? snapshot.keywords.filter((k) => !prevKw.includes(k)) : [];
  const removed = prevKw ? prevKw.filter((k) => !snapshot.keywords.includes(k)) : [];
  const priorPain = prevReport[0]?.totals?.pain_discussions;
  const dataQuality = {
    analysis_coverage: totals.discussions_collected ? Math.round((totals.discussions_analyzed / totals.discussions_collected) * 100) / 100 : null,
    unanalyzed_in_window: pendingWindow,
    collection_runs_in_window: runs.length,
    source_health: sourceFailures,
    keywords_added_since_last_report: added,
    keywords_removed_since_last_report: removed,
    has_previous_report: Boolean(prevReport[0]),
    previous_week_revised: priorPain !== undefined && priorPain !== totals.pain_discussions_previous ? { was: priorPain, now: totals.pain_discussions_previous } : null,
    insufficient_points: metrics.filter((m) => m.sufficiency === 'insufficient').length,
    low_confidence_points: metrics.filter((m) => (m.avg_confidence ?? 0) < 0.5 && m.current_count > 0).length,
  };

  // AI synthesis over computed metrics (optional — the report stands without it)
  let synthesis: Synthesis | null = null;
  const top = metrics.filter((m) => m.current_count > 0 || m.trend === 'gone').slice(0, 12);
  if (top.length) {
    try {
      const evidenceIds = new Set(top.flatMap((m) => m.evidence.map((e) => e.discussion_id)));
      const raw = await geminiJson({ system: SYNTHESIS_SYSTEM, user: synthesisPrompt(top, dataQuality), schema: SYNTHESIS_SCHEMA, temperature: 0.2 });
      synthesis = validateSynthesis(raw, evidenceIds, new Set(top.map((m) => m.pain_point_key)));
    } catch (e) {
      errors.push({ stage: 'synthesis', message: (e as Error).message.slice(0, 400) });
    }
  }

  const latest = must(await db().from('reports').select('version').eq('period_end', ce).order('version', { ascending: false }).limit(1), 'load version') as { version: number }[];
  const report = must(await db().from('reports').insert({
    period_start: cs, period_end: ce, prev_period_start: ps, prev_period_end: w.previousEnd.toISOString(),
    version: (latest[0]?.version ?? 0) + 1, trigger, status: synthesis ? 'complete' : 'complete_without_synthesis', run_id: runId,
    totals, synthesis, data_quality: dataQuality, config_snapshot: snapshot, analysis_version: ANALYSIS_VERSION, model: env.geminiModel,
  }).select('id').single(), 'save report') as { id: string };

  const metricRows = metrics.map((m) => ({ report_id: report.id, ...m }));
  for (let i = 0; i < metricRows.length; i += 200) must(await db().from('topic_metrics').insert(metricRows.slice(i, i + 200)), 'save metrics');
  await notify(report.id, totals, synthesis, w.currentEnd).catch((e) => errors.push({ stage: 'notify', message: (e as Error).message }));
  return { reportId: report.id, metrics: metrics.length, synthesized: Boolean(synthesis) };
}

function synthesisPrompt(top: TopicMetricRow[], dq: object): string {
  const fence = (s: string) => s.replace(/<\/?\s*evidence/gi, '[tag]');
  return [
    'Pain points (counts computed by code; do not restate numbers):',
    ...top.map((m) => [
      `- key=${m.pain_point_key} label="${m.label}" topic=${m.topic_slug ?? 'none'} trend=${m.trend} data=${m.sufficiency} sources=${m.distinct_sources} unresolved_share=${m.current_count ? (m.unresolved_count / m.current_count).toFixed(2) : 'n/a'} underserved_flag=${m.underserved}`,
      ...m.evidence.map((e) => `  <evidence id="${e.discussion_id}" source="${e.source_id}" status="${e.resolution_status}">${fence(truncate(e.title, 160))}${e.quote ? ` — "${fence(e.quote)}"` : ''}${e.workaround ? ` [workaround: ${fence(truncate(e.workaround, 120))}]` : ''}</evidence>`),
    ].join('\n')),
    `Data quality: ${JSON.stringify(dq)}`,
  ].join('\n');
}

async function notify(reportId: string, totals: { pain_discussions: number; rising: number; new: number }, s: Synthesis | null, end: Date) {
  if (!env.slackWebhook) return;
  const link = env.appUrl ? `${env.appUrl}/?report=${reportId}` : '';
  const text = `*Developer Community Pulse — week ending ${end.toISOString().slice(0, 10)}*\n${s?.headline ?? 'Brief generated (AI summary unavailable).'}\n${totals.pain_discussions} pain discussions · ${totals.rising} rising · ${totals.new} new${link ? `\n<${link}|Open the brief>` : ''}`;
  const res = await fetch(env.slackWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack webhook HTTP ${res.status}`);
}
