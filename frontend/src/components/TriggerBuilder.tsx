'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { ADD_TRIGGER, GET_WORKFLOW } from '@/graphql/operations';

export function TriggerBuilder({ workflowId }: { workflowId: string }) {
  const [type, setType] = useState<'webhook' | 'scheduled' | 'event'>('scheduled');
  const [err, setErr] = useState<string | null>(null);
  const [addTrigger, { loading }] = useMutation(ADD_TRIGGER, {
    refetchQueries: [{ query: GET_WORKFLOW, variables: { id: workflowId } }],
  });

  async function submit() {
    setErr(null);
    let config: any = {};
    if (type === 'webhook') config = { secret: crypto.randomUUID() };
    if (type === 'scheduled') config = { interval_minutes: 15, next_run_at: new Date().toISOString() };
    if (type === 'event') config = { watched_table: 'leads' };
    try {
      await addTrigger({ variables: { workflowId, type, config } });
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-2">
      <div className="flex gap-2 items-center">
        <select className="rounded bg-slate-800 px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="webhook">webhook (owner only)</option>
          <option value="scheduled">scheduled</option>
          <option value="event">database event (watches "leads")</option>
        </select>
        <button disabled={loading} onClick={submit} className="text-xs rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5">
          Add trigger
        </button>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
    </div>
  );
}
