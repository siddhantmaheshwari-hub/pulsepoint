export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="max-w-2xl rounded-lg border border-line bg-panel p-6">
      <h1 className="text-xl font-semibold">Finish setup to start collecting</h1>
      <p className="mt-2 text-sm text-muted">The app is deployed, but these environment variables are not set in Vercel yet:</p>
      <ul className="mt-3 list-disc pl-5 text-sm">{missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
      <p className="mt-4 text-sm text-muted">Add them under Project → Settings → Environment Variables, run the two SQL migrations in Supabase, then redeploy. See README → Setup.</p>
    </div>
  );
}
