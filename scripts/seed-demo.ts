const AUTH_URL = process.env.NHOST_AUTH_URL as string; 
const GQL_URL = process.env.HASURA_GRAPHQL_ENDPOINT as string;
const ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET as string;

async function gql(query: string, variables: any = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function createUser(email: string, password: string) {
  const res = await fetch(`${AUTH_URL}/signup/email-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  const userId = json?.session?.user?.id ?? json?.user?.id;
  if (!userId) throw new Error(`Could not create ${email}: ${JSON.stringify(json)}`);
  return userId as string;
}

async function main() {
  console.log('Creating users…');
  const orgAOwner = await createUser('owner.a@demo.dev', 'Password123!');
  const orgAEditor = await createUser('editor.a@demo.dev', 'Password123!');
  const orgBOwner = await createUser('owner.b@demo.dev', 'Password123!');
  const orgBViewer = await createUser('viewer.b@demo.dev', 'Password123!');

  console.log('Creating orgs…');
  const orgs = await gql(
    `mutation {
      a: insert_organizations_one(object: { name: "Org A", quota_limit: 1000 }) { id }
      b: insert_organizations_one(object: { name: "Org B", quota_limit: 1000 }) { id }
    }`,
  );
  const orgA = orgs.a.id;
  const orgB = orgs.b.id;

  console.log('Creating memberships…');
  await gql(
    `mutation ($rows: [org_members_insert_input!]!) { insert_org_members(objects: $rows) { affected_rows } }`,
    {
      rows: [
        { org_id: orgA, user_id: orgAOwner, role: 'owner' },
        { org_id: orgA, user_id: orgAEditor, role: 'editor' },
        { org_id: orgB, user_id: orgBOwner, role: 'owner' },
        { org_id: orgB, user_id: orgBViewer, role: 'viewer' },
      ],
    },
  );

  console.log('Creating Org A demo workflow…');
  const wf = await gql(
    `mutation ($orgId: uuid!, $by: uuid!) {
      insert_workflows_one(object: { org_id: $orgId, name: "Support triage", created_by: $by }) { id }
    }`,
    { orgId: orgA, by: orgAOwner },
  );
  const workflowId = wf.insert_workflows_one.id;

  await gql(
    `mutation ($rows: [workflow_steps_insert_input!]!) { insert_workflow_steps(objects: $rows) { affected_rows } }`,
    {
      rows: [
        {
          workflow_id: workflowId,
          position: 0,
          type: 'llm_call',
          config: { prompt: 'Classify this ticket as urgent or normal: {{lastOutput.body}}' },
        },
        {
          workflow_id: workflowId,
          position: 1,
          type: 'conditional_branch',
          config: { field: 'lastOutput.text', equals: 'urgent', then: 'continue', else: 'skip_next' },
        },
        {
          workflow_id: workflowId,
          position: 2,
          type: 'http_request',
          config: { url: 'https://httpbin.org/post', method: 'POST', body: { escalate: true } },
        },
        {
          workflow_id: workflowId,
          position: 3,
          type: 'approval_gate',
          config: { required_role: 'owner' },
        },
        {
          workflow_id: workflowId,
          position: 4,
          type: 'db_write',
          config: { data: { note: 'ticket handled' } },
        },
      ],
    },
  );

  await gql(
    `mutation ($rows: [workflow_triggers_insert_input!]!) { insert_workflow_triggers(objects: $rows) { affected_rows } }`,
    {
      rows: [
        { workflow_id: workflowId, type: 'manual', config: {} },
        { workflow_id: workflowId, type: 'webhook', config: { secret: crypto.randomUUID() } },
      ],
    },
  );

  console.log('Done.');
  console.log({ orgA, orgB, workflowId, orgAOwner, orgAEditor, orgBOwner, orgBViewer });
  console.log('Log in as owner.a@demo.dev / Password123! to run the Org A walkthrough.');
  console.log('Log in as viewer.b@demo.dev / Password123! to prove Org B cross-org isolation.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
