'use client';

import { useQuery } from '@apollo/client';
import { GET_MY_ORGS } from '@/graphql/operations';

export function OrgSwitcher({ orgId, onChange }: { orgId: string | null; onChange: (id: string) => void }) {
  const { data, loading } = useQuery(GET_MY_ORGS);

  if (loading) return <div className="text-slate-500 text-sm">Loading orgs…</div>;

  const memberships = data?.org_members ?? [];

  return (
    <select
      className="rounded bg-slate-800 px-3 py-2 text-sm"
      value={orgId ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Select organization…
      </option>
      {memberships.map((m: any) => (
        <option key={m.organization.id} value={m.organization.id}>
          {m.organization.name} ({m.role})
        </option>
      ))}
    </select>
  );
}
