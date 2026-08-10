create table public.workflow_results (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_id uuid not null references public.workflow_steps(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_results_run on public.workflow_results(workflow_run_id);
