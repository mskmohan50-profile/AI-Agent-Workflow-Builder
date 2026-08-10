'use client';

import { useSubscription, useMutation } from '@apollo/client';
import { STEP_RUNS_SUBSCRIPTION, APPROVE_STEP } from '@/graphql/operations';

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-slate-500',
  running: 'text-indigo-400',
  succeeded: 'text-emerald-400',
  failed: 'text-red-400',
  paused: 'text-amber-400',
  approved: 'text-emerald-400',
  rejected: 'text-red-400',
  skipped: 'text-slate-600',
};

export function RunPanel({ runId, canApprove }: { runId: string; canApprove: boolean }) {
  const { data, loading } = useSubscription(STEP_RUNS_SUBSCRIPTION, { variables: { runId } });
  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  if (loading && !data) return <div className="text-slate-500 text-sm">Connecting to live status…</div>;

  const run = data?.workflow_runs_by_pk;
  const stepRuns = data?.step_runs ?? [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">Run status</span>
        <span className={`font-semibold ${STATUS_COLOR[run?.status] ?? ''}`}>{run?.status}</span>
      </div>
      {run?.error && <p className="text-red-400 text-sm">{run.error}</p>}
      <ol className="space-y-2">
        {stepRuns.map((sr: any) => (
          <li key={sr.id} className="flex items-center justify-between rounded bg-slate-800/60 px-3 py-2">
            <div>
              <span className="text-xs text-slate-500 mr-2">#{sr.step.position}</span>
              <span className="text-sm">{sr.step.type}</span>
              {sr.attempt_count > 1 && <span className="text-xs text-slate-500 ml-2">retry x{sr.attempt_count - 1}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${STATUS_COLOR[sr.status] ?? ''}`}>{sr.status}</span>
              {sr.status === 'paused' && canApprove && (
                <div className="flex gap-1">
                  <button
                    disabled={approving}
                    onClick={() => approveStep({ variables: { stepRunId: sr.id, approve: true } })}
                    className="text-xs rounded bg-emerald-600 hover:bg-emerald-500 px-2 py-1"
                  >
                    Approve
                  </button>
                  <button
                    disabled={approving}
                    onClick={() => approveStep({ variables: { stepRunId: sr.id, approve: false } })}
                    className="text-xs rounded bg-red-600 hover:bg-red-500 px-2 py-1"
                  >
                    Reject
                  </button>
                </div>
              )}
              {sr.status === 'paused' && !canApprove && (
                <span className="text-xs text-slate-500">awaiting owner/editor approval</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
