import { gql } from '@apollo/client';

export const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      name
      quota_used
      quota_limit
      usage_stats {
        runs_this_month
        avg_run_duration_seconds
      }
      members {
        user_id
        role
      }
    }
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      is_active
      created_at
      steps(order_by: { position: asc }) {
        id
        position
        type
        config
      }
      triggers {
        id
        type
        is_enabled
      }
      runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

export const GET_WORKFLOW = gql`
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      steps(order_by: { position: asc }) {
        id
        position
        type
        config
      }
      triggers {
        id
        type
        is_enabled
        config
      }
      runs(order_by: { started_at: desc }, limit: 5) {
        id
        status
        trigger_type
        started_at
        completed_at
      }
    }
  }
`;

export const GET_MY_ORGS = gql`
  query GetMyOrgs {
    org_members {
      role
      organization {
        id
        name
      }
    }
  }
`;

export const GET_MY_ROLE_IN_ORG = gql`
  query GetMyRoleInOrg($orgId: uuid!, $userId: uuid!) {
    org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }, limit: 1) {
      role
    }
  }
`;

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String) {
    insert_workflows_one(object: { org_id: $orgId, name: $name, description: $description }) {
      id
    }
  }
`;

export const ADD_STEP = gql`
  mutation AddStep($workflowId: uuid!, $position: Int!, $type: step_type!, $config: jsonb!) {
    insert_workflow_steps_one(object: { workflow_id: $workflowId, position: $position, type: $type, config: $config }) {
      id
    }
  }
`;

export const ADD_TRIGGER = gql`
  mutation AddTrigger($workflowId: uuid!, $type: trigger_type!, $config: jsonb!) {
    insert_workflow_triggers_one(object: { workflow_id: $workflowId, type: $type, config: $config }) {
      id
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      workflow_run_id
      status
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!, $approve: Boolean!) {
    approveStep(step_run_id: $stepRunId, approve: $approve) {
      step_run_id
      workflow_run_id
      status
    }
  }
`;

export const STEP_RUNS_SUBSCRIPTION = gql`
  subscription WatchStepRuns($runId: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: asc }) {
      id
      status
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      completed_at
      step {
        position
        type
      }
    }
    workflow_runs_by_pk(id: $runId) {
      id
      status
      error
      completed_at
    }
  }
`;
