create extension if not exists pgcrypto;

-- ---------- enums ----------
create type org_role as enum ('owner', 'editor', 'viewer');

create type step_type as enum (
  'llm_call', 'http_request', 'db_write', 'notify',
  'conditional_branch', 'approval_gate'
);

create type trigger_type as enum ('manual', 'webhook', 'scheduled', 'event');

create type run_status as enum (
  'pending', 'running', 'paused', 'completed', 'failed', 'cancelled'
);

create type step_run_status as enum (
  'pending', 'running', 'succeeded', 'failed',
  'paused', 'approved', 'rejected', 'skipped'
);


create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_limit integer not null default 1000,          -- calls allowed per period
  quota_used integer not null default 0,               -- calls used this period
  quota_period_start date not null default date_trunc('month', now()),
  created_at timestamptz not null default now()
);

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index idx_org_members_user on public.org_members(user_id);
create index idx_org_members_org on public.org_members(org_id);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_workflows_org on public.workflows(org_id);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  position integer not null,
  type step_type not null,
  config jsonb not null default '{}'::jsonb,
  -- e.g. llm_call: {"prompt": "...", "model": "..."}
  --      http_request: {"url": "...", "method": "GET"}
  --      db_write: {"table": "results"}
  --      notify: {"channel": "slack", "target": "#alerts", "message": "..."}
  --      conditional_branch: {"field": "output.label", "equals": "urgent", "then": "continue", "else": "skip_next"}
  --      approval_gate: {"required_role": "owner"}
  created_at timestamptz not null default now(),
  unique (workflow_id, position)
);

create index idx_steps_workflow on public.workflow_steps(workflow_id);


create table public.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  type trigger_type not null,
  config jsonb not null default '{}'::jsonb,
  -- webhook: {"secret": "..."}   (secret is generated, never returned after creation)
  -- scheduled: {"cron": "*/15 * * * *", "next_run_at": "..."}
  -- event: {"watched_table": "leads", "watched_schema": "public"}
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_triggers_workflow on public.workflow_triggers(workflow_id);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  status run_status not null default 'pending',
  trigger_type trigger_type not null,
  started_by uuid references auth.users(id),
  context jsonb not null default '{}'::jsonb,          
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_runs_workflow on public.workflow_runs(workflow_id);
create index idx_runs_status on public.workflow_runs(status);

create table public.step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_id uuid not null references public.workflow_steps(id) on delete cascade,
  status step_run_status not null default 'pending',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  attempt_count integer not null default 0,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_step_runs_run on public.step_runs(workflow_run_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

create index idx_leads_org on public.leads(org_id);
create view public.org_usage_stats as
select
  o.id as org_id,
  o.quota_limit,
  o.quota_used,
  o.quota_period_start,
  count(r.id) filter (where r.started_at >= date_trunc('month', now())) as runs_this_month,
  avg(extract(epoch from (r.completed_at - r.started_at)))
    filter (where r.completed_at is not null) as avg_run_duration_seconds
from public.organizations o
left join public.workflows w on w.org_id = o.id
left join public.workflow_runs r on r.workflow_id = w.id
group by o.id, o.quota_limit, o.quota_used, o.quota_period_start;

create or replace function public.current_org_role(p_org_id uuid, p_user_id uuid)
returns org_role
language sql stable as $$
  select role from public.org_members
  where org_id = p_org_id and user_id = p_user_id
  limit 1;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_workflows_touch
before update on public.workflows
for each row execute function public.touch_updated_at();


create or replace function public.enforce_sensitive_step_gate()
returns trigger language plpgsql as $$
declare
  v_org_id uuid;
  v_creator_role org_role;
begin
  select org_id into v_org_id from public.workflows where id = new.workflow_id;

  if current_setting('hasura.user', true) is null
     or current_setting('hasura.user', true) = '' then
    return new;
  end if;

  v_creator_role := public.current_org_role(
    v_org_id,
    (current_setting('hasura.user', true)::jsonb ->> 'x-hasura-user-id')::uuid
  );

  if new.type in ('db_write', 'notify') and v_creator_role <> 'owner' then
    raise exception 'only an org owner may add a % step', new.type;
  end if;

  return new;
end;
$$;

create trigger trg_steps_sensitive_gate
before insert on public.workflow_steps
for each row execute function public.enforce_sensitive_step_gate();

create or replace function public.enforce_webhook_trigger_gate()
returns trigger language plpgsql as $$
declare
  v_org_id uuid;
  v_creator_role org_role;
begin
  select org_id into v_org_id from public.workflows where id = new.workflow_id;

  if current_setting('hasura.user', true) is null
     or current_setting('hasura.user', true) = '' then
    return new;
  end if;

  v_creator_role := public.current_org_role(
    v_org_id,
    (current_setting('hasura.user', true)::jsonb ->> 'x-hasura-user-id')::uuid
  );

  if new.type = 'webhook' and v_creator_role <> 'owner' then
    raise exception 'only an org owner may add a webhook trigger';
  end if;

  return new;
end;
$$;

create trigger trg_triggers_webhook_gate
before insert on public.workflow_triggers
for each row execute function public.enforce_webhook_trigger_gate();
