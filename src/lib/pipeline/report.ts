import 'server-only';
import type postgres from 'postgres';
import { db } from '../db';
import { env } from '../env';
import { geminiJson } from '../gemini';
import { loadWindowMetrics } from '../period-data';
import { validateSynthesis } from '../schemas';
import { truncate } from '../text';
import type { Synthesis, TopicMetricRow } from '../types';
import { reportWindows } from '../windows';
import { configSnapshot, loadConfig } from './config';
import { ANALYSIS_VERSION, SYNTHESIS_SCHEMA, SYNTHESIS_SYSTEM } from './prompts';

const J = (v: unknown) => db().json(v as postgres.JSONValue);

type SourceStats = Record<string, { failures: number; requests: number }>;

export async function generateReport(runId: string, trigger: 'cron_weekly' | 'manual', errors: { stage: string; message: string }[], liveSources: SourceStats = {}, now = new Date(), deadline?: number) {
  const sql = db();
  const w = reportWindows(now, env.tzOffsetMinutes);
  const ps = w.previousStart.toISOString(), cs = w.currentStart.toISOString(), ce = w.currentEnd.toISOString();

  const { rows, metrics } = await loadWindowMetrics(w);

  // Deterministic totals
  const [c] = await sql<{ collected: number; pending: number; dupes: number; mentions: number }[]>`
    select
      (select count(*)::int from discussions where duplicate_of is null and created_at_source >= ${cs} and created_at_source < ${ce}) as collected,
      (select count(*)::int from discussions where duplicate_of is null and analysis_status in ('pending','failed') and created_at_source >= ${ps} and created_at_source < ${ce}) as pending,
      (select count(*)::int from discussions where duplicate_of is not null and created_at_source >= ${cs} and created_at_source < ${ce}) as dupes,
      (select coalesce(sum(m.mention_count), 0)::int from discussion_matches m join discussions d on d.id = m.discussion_id
         where d.duplicate_of is null and d.created_at_source >= ${cs} and d.created_at_source < ${ce}) as mentions`;

  const curRows = rows.filter((r) => Date.parse(r.created_at_source) >= w.currentStart.getTime());
  const totals = {
    discussions_collected: c.collected,
    discussions_analyzed: curRows.length,
    relevant_discussions: curRows.filter((r) => r.is_relevant).length,
    pain_discussions: metrics.reduce((a, m) => a + m.current_count, 0),
    pain_discussions_previous: metrics.reduce((a, m) => a + m.previous_count, 0),
    keyword_mentions: c.mentions,
    duplicates_excluded: c.dupes,
    pain_points_tracked: metrics.filter((m) => m.current_count > 0).length,
    rising: metrics.filter((m) => m.trend === 'rising').length,
    declining: metrics.filter((m) => m.trend === 'declining').length,
    new: metrics.filter((m) => m.trend === 'new').length,
    stable: metrics.filter((m) => m.trend === 'stable').length,
  };

  // Data quality & comparability
  const snapshot = configSnapshot(await loadConfig());
  const [prevReport] = await sql<{ config_snapshot: { keywords?: string[] }; totals: { pain_discussions?: number } }[]>`
    select config_snapshot, totals from reports where period_end = ${w.previousEnd.toISOString()} order by version desc limit 1`;
  // Finished runs in the window, plus the run in progress (its stats are not stored until it ends).
  const runs = await sql<{ stats: { collect?: { sources?: SourceStats } } }[]>`
    select stats from collection_runs where started_at >= ${ps} and id <> ${runId}`;
  const sourceHealth: Record<string, { failed_requests: number; requests: number }> = {};
  for (const src of [...runs.map((r) => r.stats?.collect?.sources ?? {}), liveSources]) for (const [s, v] of Object.entries(src)) {
    const acc = (sourceHealth[s] ??= { failed_requests: 0, requests: 0 });
    acc.failed_requests += v.failures; acc.requests += v.requests;
  }
  const prevKw = prevReport?.config_snapshot?.keywords;
  const priorPain = prevReport?.totals?.pain_discussions;
  const dataQuality = {
    analysis_coverage: totals.discussions_collected ? Math.round((totals.discussions_analyzed / totals.discussions_collected) * 100) / 100 : null,
    unanalyzed_in_window: c.pending,
    collection_runs_in_window: runs.length + 1,
    source_health: sourceHealth,
    keywords_added_since_last_report: prevKw ? snapshot.keywords.filter((k) => !prevKw.includes(k)) : [],
    keywords_removed_since_last_report: prevKw ? prevKw.filter((k) => !snapshot.keywords.includes(k)) : [],
    has_previous_report: Boolean(prevReport),
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
      const raw = await geminiJson({ system: SYNTHESIS_SYSTEM, user: synthesisPrompt(top, dataQuality), schema: SYNTHESIS_SCHEMA, temperature: 0.2, deadline });
      synthesis = validateSynthesis(raw, evidenceIds, new Set(top.map((m) => m.pain_point_key)));
    } catch (e) {
      errors.push({ stage: 'synthesis', message: (e as Error).message.slice(0, 400) });
    }
  }

  // Store snapshot + metrics atomically; version increments per period.
  const reportId = await sql.begin(async (tx) => {
    const [{ v }] = await tx<{ v: number }[]>`select coalesce(max(version), 0)::int + 1 as v from reports where period_end = ${ce}`;
    const [rep] = await tx<{ id: string }[]>`insert into reports ${tx({
      period_start: cs, period_end: ce, prev_period_start: ps, prev_period_end: w.previousEnd.toISOString(),
      version: v, trigger, status: synthesis ? 'complete' : 'complete_without_synthesis', run_id: runId,
      totals: J(totals), synthesis: synthesis ? J(synthesis) : null, data_quality: J(dataQuality), config_snapshot: J(snapshot),
      analysis_version: ANALYSIS_VERSION, model: env.geminiModel,
    })} returning id`;
    const metricRows = metrics.map((m) => ({ report_id: rep.id, ...m, by_source: J(m.by_source), evidence: J(m.evidence) }));
    for (let i = 0; i < metricRows.length; i += 200) await tx`insert into topic_metrics ${tx(metricRows.slice(i, i + 200))}`;
    return rep.id;
  });

  await notify(reportId, totals, synthesis, w.currentEnd).catch((e) => errors.push({ stage: 'notify', message: (e as Error).message }));
  return { reportId, metrics: metrics.length, synthesized: Boolean(synthesis) };
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
  const text = `*PulsePoint — week ending ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}*\n${s?.headline ?? 'Brief generated (AI summary unavailable).'}\n${totals.pain_discussions} pain discussions · ${totals.rising} rising · ${totals.new} new${link ? `\n<${link}|Open the brief>` : ''}`;
  const res = await fetch(env.slackWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack webhook HTTP ${res.status}`);
}
