import { gql } from './hasura';

export type OrgRole = 'owner' | 'editor' | 'viewer';
export async function getOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const data = await gql<{ org_members: { role: OrgRole }[] }>(
    `query ($userId: uuid!, $orgId: uuid!) {
      org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }, limit: 1) {
        role
      }
    }`,
    { userId, orgId },
  );
  return data.org_members[0]?.role ?? null;
}

export function canTriggerRuns(role: OrgRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

export function canApprove(role: OrgRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

export async function getOrgIdForWorkflow(workflowId: string): Promise<string | null> {
  const data = await gql<{ workflows_by_pk: { org_id: string } | null }>(
    `query ($id: uuid!) { workflows_by_pk(id: $id) { org_id } }`,
    { id: workflowId },
  );
  return data.workflows_by_pk?.org_id ?? null;
}

export async function checkQuota(orgId: string): Promise<{ ok: boolean; used: number; limit: number }> {
  const data = await gql<{ organizations_by_pk: { quota_used: number; quota_limit: number } }>(
    `query ($id: uuid!) { organizations_by_pk(id: $id) { quota_used quota_limit } }`,
    { id: orgId },
  );
  const org = data.organizations_by_pk;
  return { ok: org.quota_used < org.quota_limit, used: org.quota_used, limit: org.quota_limit };
}

export async function incrementQuota(orgId: string): Promise<void> {
  await gql(
    `mutation ($id: uuid!) {
      update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id }
    }`,
    { id: orgId },
  );
}
