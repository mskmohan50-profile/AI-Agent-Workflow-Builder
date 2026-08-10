import { gql } from './hasura';
import { incrementQuota } from './permissions';

type StepType = 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';

interface Step {
  id: string;
  position: number;
  type: StepType;
  config: any;
}

const MAX_ATTEMPTS = 2; // "at least one retry on failure"

export async function createRun(workflowId: string, startedBy: string | null, triggerType: string) {
  const stepsData = await gql<{ workflow_steps: Step[] }>(
    `query ($wid: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $wid } }, order_by: { position: asc }) {
        id position type config
      }
    }`,
    { wid: workflowId },
  );
  const steps = stepsData.workflow_steps;

  const runData = await gql<{ insert_workflow_runs_one: { id: string } }>(
    `mutation ($wid: uuid!, $by: uuid, $trigger: trigger_type!, $stepRuns: [step_runs_insert_input!]!) {
      insert_workflow_runs_one(object: {
        workflow_id: $wid,
        started_by: $by,
        trigger_type: $trigger,
        status: running,
        step_runs: { data: $stepRuns }
      }) { id }
    }`,
    {
      wid: workflowId,
      by: startedBy,
      trigger: triggerType,
      stepRuns: steps.map((s) => ({ step_id: s.id, status: 'pending' })),
    },
  );

  return { runId: runData.insert_workflow_runs_one.id, steps };
}

async function setStepRun(stepRunId: string, patch: Record<string, any>) {
  await gql(
    `mutation ($id: uuid!, $patch: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: $patch) { id }
    }`,
    { id: stepRunId, patch },
  );
}

async function setRun(runId: string, patch: Record<string, any>) {
  await gql(
    `mutation ($id: uuid!, $patch: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $patch) { id }
    }`,
    { id: runId, patch },
  );
}

async function getStepRunIdFor(runId: string, stepId: string): Promise<string> {
  const data = await gql<{ step_runs: { id: string }[] }>(
    `query ($run: uuid!, $step: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $run }, step_id: { _eq: $step } }, limit: 1) { id }
    }`,
    { run: runId, step: stepId },
  );
  return data.step_runs[0].id;
}

async function runLlmCall(config: any, context: any): Promise<any> {
  const prompt: string = interpolate(config.prompt ?? '', context);
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    
    await sleep(600);
    return {
      stubbed: true,
      model: 'stub-llm',
      prompt,
      text: /urgent|angry|refund/i.test(prompt) ? 'urgent' : 'normal',
    };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: config.model ?? 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`llm_call failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { model: string; choices?: { message?: { content?: string } }[] };
  return { model: json.model, text: json.choices?.[0]?.message?.content ?? '' };
}

async function runHttpRequest(config: any, context: any): Promise<any> {
  const url = interpolate(config.url, context);
  const res = await fetch(url, {
    method: config.method ?? 'GET',
    headers: config.headers ?? {},
    body: config.body ? interpolate(JSON.stringify(config.body), context) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`http_request failed: ${res.status} ${text}`);
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function runDbWrite(config: any, runId: string, stepId: string, context: any): Promise<any> {
  const data = { ...(config.data ?? {}), from_context: context.lastOutput ?? null };
  await gql(
    `mutation ($runId: uuid!, $stepId: uuid!, $data: jsonb!) {
      insert_workflow_results_one(object: { workflow_run_id: $runId, step_id: $stepId, data: $data }) { id }
    }`,
    { runId, stepId, data },
  );
  return { saved: true, data };
}

async function runNotify(config: any, context: any): Promise<any> {
 
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const message = interpolate(config.message ?? 'Workflow notification', context);
  if (!webhookUrl) {
    return { stubbed: true, channel: config.channel ?? 'slack', message };
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
  return { delivered: res.ok, message };
}

function evaluateBranch(config: any, context: any): 'continue' | 'skip_next' {
  const value = getPath(context, config.field ?? 'lastOutput.text');
  const matches = String(value) === String(config.equals);
  return matches ? (config.then ?? 'continue') : (config.else ?? 'skip_next');
}

function getPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function interpolate(template: string, context: any): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => String(getPath(context, path) ?? ''));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSteps(
  runId: string,
  orgId: string,
  steps: Step[],
  fromIndex = 0,
  context: any = { lastOutput: null },
) {
  let skipNext = false;

  for (let i = fromIndex; i < steps.length; i++) {
    const step = steps[i];
    const stepRunId = await getStepRunIdFor(runId, step.id);

    if (skipNext) {
      await setStepRun(stepRunId, { status: 'skipped', started_at: new Date().toISOString(), completed_at: new Date().toISOString() });
      skipNext = false;
      continue;
    }

    if (step.type === 'approval_gate') {
      await setStepRun(stepRunId, { status: 'paused', started_at: new Date().toISOString(), input: context });
      await setRun(runId, { status: 'paused', context });
      return { status: 'paused', runId };
    }

    await setStepRun(stepRunId, { status: 'running', started_at: new Date().toISOString(), input: context });

    let attempt = 0;
    let output: any = null;
    let lastError: string | null = null;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        switch (step.type) {
          case 'llm_call':
            output = await runLlmCall(step.config, context);
            break;
          case 'http_request':
            output = await runHttpRequest(step.config, context);
            break;
          case 'db_write':
            output = await runDbWrite(step.config, runId, step.id, context);
            break;
          case 'notify':
            output = await runNotify(step.config, context);
            break;
          case 'conditional_branch': {
            const branch = evaluateBranch(step.config, context);
            output = { branch };
            if (branch === 'skip_next') skipNext = true;
            break;
          }
        }
        lastError = null;
        break; // success
      } catch (err: any) {
        lastError = err.message ?? String(err);
        if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt); // backoff, then retry
      }
    }

    if (lastError) {
      await setStepRun(stepRunId, {
        status: 'failed',
        error: lastError,
        attempt_count: attempt,
        completed_at: new Date().toISOString(),
      });
      await setRun(runId, { status: 'failed', error: `Step ${step.position} (${step.type}) failed: ${lastError}` });
      return { status: 'failed', runId };
    }

    await setStepRun(stepRunId, {
      status: 'succeeded',
      output,
      attempt_count: attempt,
      completed_at: new Date().toISOString(),
    });
    context = { ...context, lastOutput: output };
    await setRun(runId, { context });
  }

  await setRun(runId, { status: 'completed', completed_at: new Date().toISOString() });
  await incrementQuota(orgId);
  return { status: 'completed', runId };
}

export async function getSteps(workflowId: string): Promise<Step[]> {
  const data = await gql<{ workflow_steps: Step[] }>(
    `query ($wid: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $wid } }, order_by: { position: asc }) {
        id position type config
      }
    }`,
    { wid: workflowId },
  );
  return data.workflow_steps;
}
