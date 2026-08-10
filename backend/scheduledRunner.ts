import type { Request, Response } from 'express';
import { gql } from './_lib/hasura';
import { checkQuota } from './_lib/permissions';
import { createRun, runSteps, getSteps } from './_lib/engine';

export default async function scheduledRunner(_req: Request, res: Response) {
  try {
    const now = new Date();
    const data = await gql<{
      workflow_triggers: {
        id: string;
        config: any;
        workflow: { id: string; org_id: string };
      }[];
    }>(
      `query ($now: timestamptz!) {
        workflow_triggers(where: {
          type: { _eq: scheduled },
          is_enabled: { _eq: true },
          config: { _contains: {} }
        }) {
          id config
          workflow { id org_id }
        }
      }`,
      { now: now.toISOString() },
    );

    const due = data.workflow_triggers.filter((t) => {
      const nextRunAt = t.config?.next_run_at ? new Date(t.config.next_run_at) : new Date(0);
      return nextRunAt.getTime() <= now.getTime();
    });

    const results: any[] = [];
    for (const trigger of due) {
      const orgId = trigger.workflow.org_id;
      const quota = await checkQuota(orgId);
      if (!quota.ok) continue;

      const steps = await getSteps(trigger.workflow.id);
      const { runId } = await createRun(trigger.workflow.id, null, 'scheduled');
      runSteps(runId, orgId, steps).catch((e) => console.error('scheduled run failed', e));

      const intervalMinutes = trigger.config?.interval_minutes ?? 60;
      const nextRunAt = new Date(now.getTime() + intervalMinutes * 60_000).toISOString();
      await gql(
        `mutation ($id: uuid!, $config: jsonb!) {
          update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { config: $config }) { id }
        }`,
        { id: trigger.id, config: { ...trigger.config, next_run_at: nextRunAt } },
      );

      results.push({ trigger_id: trigger.id, workflow_run_id: runId });
    }

    return res.status(200).json({ started: results });
  } catch (err: any) {
    console.error('scheduledRunner error', err);
    return res.status(500).json({ message: err.message ?? 'internal error' });
  }
}
