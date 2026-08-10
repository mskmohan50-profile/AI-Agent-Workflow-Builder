import type { Request, Response } from 'express';
import { gql } from './_lib/hasura';
import { checkQuota } from './_lib/permissions';
import { createRun, runSteps, getSteps } from './_lib/engine';

export default async function dbEventHandler(req: Request, res: Response) {
  try {
    const payload = req.body;
    const newRow = payload?.event?.data?.new;
    if (!newRow) return res.status(200).json({ skipped: true });

    const orgId: string = newRow.org_id;

    const data = await gql<{
      workflow_triggers: { id: string; workflow: { id: string; org_id: string } }[];
    }>(
      `query ($orgId: uuid!) {
        workflow_triggers(where: {
          type: { _eq: event },
          is_enabled: { _eq: true },
          config: { _contains: { watched_table: "leads" } },
          workflow: { org_id: { _eq: $orgId } }
        }) {
          id
          workflow { id org_id }
        }
      }`,
      { orgId },
    );

    const started: any[] = [];
    for (const trigger of data.workflow_triggers) {
      const quota = await checkQuota(orgId);
      if (!quota.ok) continue;
      const steps = await getSteps(trigger.workflow.id);
      const { runId } = await createRun(trigger.workflow.id, null, 'event');
      runSteps(runId, orgId, steps, 0, { lastOutput: newRow }).catch((e) => console.error('event run failed', e));
      started.push({ trigger_id: trigger.id, workflow_run_id: runId });
    }

    return res.status(200).json({ started });
  } catch (err: any) {
    console.error('dbEventHandler error', err);
    return res.status(500).json({ message: err.message ?? 'internal error' });
  }
}
