import type { Request, Response } from 'express';
import { gql } from './_lib/hasura';
import { getOrgRole, canApprove } from './_lib/permissions';
import { runSteps, getSteps } from './_lib/engine';

export default async function approveStep(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const stepRunId: string = input.step_run_id;
    const approve: boolean = input.approve;
    const userId: string | undefined = session_variables?.['x-hasura-user-id'];
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const data = await gql<{
      step_runs_by_pk: {
        id: string;
        status: string;
        workflow_run: { id: string; context: any; workflow: { id: string; org_id: string } };
        step: { position: number };
      } | null;
    }>(
      `query ($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id
          status
          workflow_run { id context workflow { id org_id } }
          step { position }
        }
      }`,
      { id: stepRunId },
    );

    const stepRun = data.step_runs_by_pk;
    if (!stepRun) return res.status(404).json({ message: 'step_run not found' });
    if (stepRun.status !== 'paused') {
      return res.status(409).json({ message: `step_run is not paused (status: ${stepRun.status})` });
    }

    const orgId = stepRun.workflow_run.workflow.org_id;
    const role = await getOrgRole(userId, orgId);

    if (!canApprove(role)) {
      return res.status(403).json({ message: 'Only an owner or editor in this org can approve this step' });
    }

    const runId = stepRun.workflow_run.id;

    if (!approve) {
      await gql(
        `mutation ($stepRunId: uuid!, $runId: uuid!, $userId: uuid!) {
          update_step_runs_by_pk(pk_columns: { id: $stepRunId }, _set: { status: rejected, approved_by: $userId, approved_at: "now()" }) { id }
          update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: failed, error: "Rejected at approval gate", completed_at: "now()" }) { id }
        }`,
        { stepRunId, runId, userId },
      );
      return res.status(200).json({ step_run_id: stepRunId, workflow_run_id: runId, status: 'rejected' });
    }

    await gql(
      `mutation ($id: uuid!, $userId: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: succeeded, approved_by: $userId, approved_at: "now()", completed_at: "now()"
        }) { id }
      }`,
      { id: stepRunId, userId },
    );
    await gql(
      `mutation ($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: running }) { id } }`,
      { id: runId },
    );

    const steps = await getSteps(stepRun.workflow_run.workflow.id);
    const resumeFromIndex = stepRun.step.position; // position is 0-indexed order; gate was at this index, continue after it
    const result = await runSteps(runId, orgId, steps, resumeFromIndex, stepRun.workflow_run.context ?? { lastOutput: null });

    return res.status(200).json({ step_run_id: stepRunId, workflow_run_id: runId, status: result.status });
  } catch (err: any) {
    console.error('approveStep error', err);
    return res.status(500).json({ message: err.message ?? 'internal error' });
  }
}
