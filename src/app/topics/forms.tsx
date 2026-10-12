'use client';
import { useActionState } from 'react';
import { addKeyword, addTopic, type ActionState } from './actions';

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return <p role="status" className={`mt-2 text-xs ${s.ok ? 'text-fall' : 'text-rise'}`}>{s.message}</p>;
}

export function AddKeywordForm({ topicId }: { topicId: string }) {
  const [state, action, pending] = useActionState(addKeyword, null);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="topicId" value={topicId} />
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`kw-${topicId}`}>New keyword</label>
        <input id={`kw-${topicId}`} name="term" required minLength={2} maxLength={80} placeholder="Add a keyword or phrase" className="field flex-1" />
        <button className="pill" disabled={pending}>{pending ? 'Adding…' : 'Add keyword'}</button>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function AddTopicForm() {
  const [state, action, pending] = useActionState(addTopic, null);
  return (
    <form action={action} className="rounded-panel border border-dashed border-line-strong p-6">
      <p className="text-[15px] font-semibold">New topic</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="t-name">Topic name</label>
        <input id="t-name" name="name" required minLength={2} maxLength={80} placeholder="Name, e.g. Monorepo tooling" className="field sm:w-64" />
        <label className="sr-only" htmlFor="t-desc">Description</label>
        <input id="t-desc" name="description" maxLength={300} placeholder="What it covers (optional)" className="field flex-1" />
        <button className="pill-dark" disabled={pending}>{pending ? 'Adding…' : 'Add topic'}</button>
      </div>
      <Msg s={state} />
    </form>
  );
}
