import { PainTable } from '@/components/pain/PainTable';
import { GenerateButton } from '@/components/shell/GenerateButton';
import { SetupNotice } from '@/components/SetupNotice';
import { Empty, PageHeader } from '@/components/ui/bits';
import { loadBrief } from '@/lib/brief';
import { missingEnv } from '@/lib/env';
import { fmtPeriod } from '@/lib/format';
import { compareOn, type SP } from '@/lib/params';

export default async function PainPointsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const { report, metrics, sparks, sparkLabels, topicNames } = await loadBrief(sp);
  return (
    <div>
      <PageHeader title="Pain points" lead={report ? <>Every recurring and newly observed problem for {fmtPeriod(report.period_start, report.period_end)}, ranked by unique discussions. Select a row for evidence, history and workarounds.</> : 'Ranked developer problems appear after the first report.'} />
      {report ? (
        <>
          <PainTable metrics={metrics} sparks={sparks} sparkLabels={sparkLabels} topics={topicNames} periodStart={report.period_start} compare={compareOn(sp)} />
          <p className="meta mt-4 max-w-3xl">Rising or easing requires a change of at least 2 discussions and 25%; anything smaller is stable. A zero baseline shows “New” instead of a percentage. Isolated bug reports are counted separately and never inflate a pain point.</p>
        </>
      ) : <Empty title="No report yet" action={<GenerateButton />}>Generate the first report to rank pain points.</Empty>}
    </div>
  );
}
