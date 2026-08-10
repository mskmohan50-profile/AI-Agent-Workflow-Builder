'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@apollo/client';
import { useUserId } from '@/lib/auth';
import {
  GET_WORKFLOW,
  GET_MY_ROLE_IN_ORG,
  TRIGGER_WORKFLOW_RUN,
} from '@/graphql/operations';
import { StepBuilder } from '@/components/StepBuilder';
import { TriggerBuilder } from '@/components/TriggerBuilder';
import { RunPanel } from '@/components/RunPanel';

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const { data, loading, refetch } = useQuery(GET_WORKFLOW, { variables: { id } });
  const workflow = data?.workflows_by_pk;

  const { data: roleData } = useQuery(GET_MY_ROLE_IN_ORG, {
    variables: { orgId: workflow?.org_id, userId },
    skip: !workflow || !userId,
  });
  const myRole: string | null = roleData?.org_members?.[0]?.role ?? null;
  const canTrigger = myRole === 'owner' || myRole === 'editor';
  const canApprove = canTrigger;

  const [triggerRun, { loading: running }] = useMutation(TRIGGER_WORKFLOW_RUN);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  async function runNow() {
    const res = await triggerRun({ variables: { workflowId: id } });
    const runId = res.data?.triggerWorkflowRun?.workflow_run_id;
    if (runId) setActiveRunId(runId);
    refetch();
  }

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!workflow) return <div className="p-6 text-slate-500">Not found (or you don't have access).</div>;

  const displayedRunId = activeRunId ?? workflow.runs?.[0]?.id ?? null;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{workflow.name}</h1>
          <p className="text-xs text-slate-500">{workflow.description}</p>
        </div>
        {canTrigger ? (
          <button
            onClick={runNow}
            disabled={running}
            className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium"
          >
            {running ? 'Starting…' : 'Run'}
          </button>
        ) : (
          <span className="text-xs text-slate-500">viewers cannot trigger runs</span>
        )}
      </div>

      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-2">Steps</h2>
        <ol className="space-y-2 mb-3">
          {workflow.steps.map((s: any) => (
            <li key={s.id} className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm">
              <span className="text-xs text-slate-500 mr-2">#{s.position}</span>
              {s.type}
            </li>
          ))}
        </ol>
        {canTrigger && <StepBuilder workflowId={id} nextPosition={workflow.steps.length} myRole={myRole} />}
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-2">Triggers</h2>
        <ul className="space-y-2 mb-3">
          {workflow.triggers.map((t: any) => (
            <li key={t.id} className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm flex justify-between">
              <span>{t.type}</span>
              <span className="text-xs text-slate-500">{t.is_enabled ? 'enabled' : 'disabled'}</span>
            </li>
          ))}
        </ul>
        {canTrigger && <TriggerBuilder workflowId={id} />}
      </section>

      {displayedRunId && (
        <section>
          <h2 className="text-sm font-medium text-slate-400 mb-2">Live run</h2>
          <RunPanel runId={displayedRunId} canApprove={canApprove} />
        </section>
      )}
    </div>
  );
}
