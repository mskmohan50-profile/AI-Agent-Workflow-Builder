'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { ADD_STEP, GET_WORKFLOW } from '@/graphql/operations';

const STEP_TYPES = ['llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate'];
const OWNER_ONLY_TYPES = new Set(['db_write', 'notify']);

export function StepBuilder({ workflowId, nextPosition, myRole }: { workflowId: string; nextPosition: number; myRole: string | null }) {
  const [type, setType] = useState('llm_call');
  const [configText, setConfigText] = useState('{\n  "prompt": "Summarize: {{lastOutput.body}}"\n}');
  const [err, setErr] = useState<string | null>(null);
  const [addStep, { loading }] = useMutation(ADD_STEP, {
    refetchQueries: [{ query: GET_WORKFLOW, variables: { id: workflowId } }],
  });

  async function submit() {
    setErr(null);
    let config: any;
    try {
      config = JSON.parse(configText);
    } catch {
      setErr('Config must be valid JSON');
      return;
    }
    try {
      await addStep({ variables: { workflowId, position: nextPosition, type, config } });
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-2">
      <div className="flex gap-2 items-center">
        <select className="rounded bg-slate-800 px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          {STEP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
              {OWNER_ONLY_TYPES.has(t) ? ' (owner only)' : ''}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">position {nextPosition}</span>
      </div>
      <textarea
        className="w-full rounded bg-slate-800 px-2 py-1 text-xs font-mono h-20"
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
      />
      {err && <p className="text-red-400 text-xs">{err}</p>}
      <button disabled={loading} onClick={submit} className="text-xs rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5">
        Add step
      </button>
    </div>
  );
}
