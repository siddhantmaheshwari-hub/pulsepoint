export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="mx-auto max-w-xl pt-8">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Finish setup to start collecting</h1>
      <p className="mt-3 text-ink-muted">PulsePoint is running, but these settings are missing:</p>
      <ul className="mt-4 space-y-1.5">{missing.map((m) => <li key={m} className="rounded-ctl border border-line bg-panel px-3 py-2 font-medium">{m}</li>)}</ul>
      <p className="mt-5 text-sm leading-relaxed text-ink-muted">Add them to <code>.env.local</code> (local) or Vercel → Settings → Environment Variables, run <code>npm run db:migrate</code> once, then restart or redeploy.</p>
    </div>
  );
}
