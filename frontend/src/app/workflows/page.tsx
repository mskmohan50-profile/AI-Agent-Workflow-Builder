'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { useUserId, useSignOut } from '@/lib/auth';
import Link from 'next/link';
import { GET_ORG_WORKFLOWS, CREATE_WORKFLOW } from '@/graphql/operations';
import { OrgSwitcher } from '@/components/OrgSwitcher';
import { QuotaBadge } from '@/components/QuotaBadge';

export default function WorkflowsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const userId = useUserId();
  const { signOut } = useSignOut();
  const { data, loading, refetch } = useQuery(GET_ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId });
  const [createWorkflow] = useMutation(CREATE_WORKFLOW);
  const [name, setName] = useState('');

  const myRole = data?.organizations_by_pk?.members?.find((m: any) => m.user_id === userId)?.role ?? null;

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !name.trim()) return;
    await createWorkflow({ variables: { orgId, name, description: '' } });
    setName('');
    refetch();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Workflows</h1>
        <button className="text-xs text-slate-400 underline" onClick={() => signOut()}>
          Sign out
        </button>
      </div>

      <div className="flex items-center justify-between">
        <OrgSwitcher orgId={orgId} onChange={setOrgId} />
        {data?.organizations_by_pk && (
          <QuotaBadge used={data.organizations_by_pk.quota_used} limit={data.organizations_by_pk.quota_limit} />
        )}
      </div>

      {orgId && myRole && myRole !== 'viewer' && (
        <form onSubmit={submitCreate} className="flex gap-2">
          <input
            className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm"
            placeholder="New workflow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="rounded bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm">Create</button>
        </form>
      )}

      {loading && <p className="text-slate-500 text-sm">Loading…</p>}

      <ul className="space-y-2">
        {data?.workflows?.map((w: any) => (
          <li key={w.id}>
            <Link
              href={`/workflows/${w.id}`}
              className="block rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800/60 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{w.name}</span>
                {w.runs[0] && <span className="text-xs text-slate-400">last run: {w.runs[0].status}</span>}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {w.steps.length} step(s) · {w.triggers.length} trigger(s)
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
