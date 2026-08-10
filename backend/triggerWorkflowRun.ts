import type { Request, Response } from 'express';
import { getOrgIdForWorkflow, getOrgRole, canTriggerRuns, checkQuota } from './_lib/permissions';
import { createRun, runSteps, getSteps } from './_lib/engine';

export default async function triggerWorkflowRun(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const workflowId: string = input.workflow_id;
    const userId: string | undefined = session_variables?.['x-hasura-user-id'];

    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const orgId = await getOrgIdForWorkflow(workflowId);
    if (!orgId) return res.status(404).json({ message: 'Workflow not found' });

    const role = await getOrgRole(userId, orgId);
    if (!canTriggerRuns(role)) {
      return res.status(403).json({ message: 'Only an owner or editor can trigger this workflow' });
    }

    const quota = await checkQuota(orgId);
    if (!quota.ok) {
      return res.status(403).json({ message: `Org quota exhausted (${quota.used}/${quota.limit})` });
    }

    const steps = await getSteps(workflowId);
    const { runId } = await createRun(workflowId, userId, 'manual');
    const result = await runSteps(runId, orgId, steps);

    return res.status(200).json({ workflow_run_id: runId, status: result.status });
  } catch (err: any) {
    console.error('triggerWorkflowRun error', err);
    return res.status(500).json({ message: err.message ?? 'internal error' });
  }
}
