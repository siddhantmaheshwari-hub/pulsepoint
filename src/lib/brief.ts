import 'server-only';
import { fmtWeekEnd } from './format';
import { one, type SP } from './params';
import { getMetrics, getReport, getSparklines, listTopics } from './queries';

/** Everything a report-driven page needs for the selected week. */
export async function loadBrief(sp: SP) {
  const report = await getReport(one(sp.report));
  const { topics, sources } = await listTopics();
  const topicNames = Object.fromEntries(topics.map((t) => [t.slug, t.name]));
  if (!report) return { report: null, metrics: [], sparks: {}, sparkLabels: [], topicNames, topics, sources } as const;
  const metrics = await getMetrics(report.id);
  const { periods, series } = await getSparklines(metrics.map((m) => m.pain_point_key), report.period_end);
  return { report, metrics, sparks: series, sparkLabels: periods.map(fmtWeekEnd), topicNames, topics, sources } as const;
}
