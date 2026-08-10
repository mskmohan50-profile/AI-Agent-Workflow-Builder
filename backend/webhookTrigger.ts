import type { Request, Response } from 'express';
import { gql } from './_lib/hasura';
import { checkQuota } from './_lib/permissions';
import { createRun, runSteps, getSteps } from './_lib/engine';

export default async function webhookTrigger(req: Request, res: Response) {
  try {
    const triggerId = req.params.triggerId;
    const secret = (req.query.secret as string) ?? req.body?.secret;

    const data = await gql<{
      workflow_triggers_by_pk: {
        id: string;
        type: string;
        is_enabled: boolean;
        config: any;
        workflow: { id: string; org_id: string };
      } | null;
    }>(
      `query ($id: uuid!) {
        workflow_triggers_by_pk(id: $id) {
          id type is_enabled config
          workflow { id org_id }
        }
      }`,
      { id: triggerId },
    );

    const trigger = data.workflow_triggers_by_pk;
    if (!trigger || trigger.type !== 'webhook' || !trigger.is_enabled) {
      return res.status(404).json({ message: 'No active webhook trigger found' });
    }
    if (!secret || secret !== trigger.config?.secret) {
      return res.status(401).json({ message: 'Invalid webhook secret' });
    }

    const orgId = trigger.workflow.org_id;
    const quota = await checkQuota(orgId);
    if (!quota.ok) return res.status(403).json({ message: 'Org quota exhausted' });

    const steps = await getSteps(trigger.workflow.id);
    const { runId } = await createRun(trigger.workflow.id, null, 'webhook');
    const result = await runSteps(runId, orgId, steps);

    return res.status(200).json({ workflow_run_id: runId, status: result.status });
  } catch (err: any) {
    console.error('webhookTrigger error', err);
    return res.status(500).json({ message: err.message ?? 'internal error' });
  }
}
