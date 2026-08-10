# Write-up

## Schema reasoning

The relationship chain the assignment specifies — org → members →
workflows → steps/triggers, workflow → runs → step_runs — is exactly
the foreign-key graph in `nhost/migrations/.../up.sql`. A few choices:

- **`org_members` as the single source of truth for role**, rather than
  putting role on the JWT/user record, because role is per-org, not
  per-user — the same person can be an owner in Org A and a viewer in
  Org B. Every permission expression (Hasura and Postgres trigger alike)
  joins through this table rather than trusting a claim.
- **`workflow_steps.position` + `workflow_triggers.type`** are plain
  columns rather than separate tables per step/trigger type, with
  type-specific shape living in `config jsonb`. This keeps the ordered
  step list a single query and keeps adding a new step type a config
  shape change, not a migration.
- **`step_runs` is one row per step per run**, carrying `attempt_count`,
  `approved_by`/`approved_at`, `input`/`output`/`error` — enough to
  reconstruct the entire execution history of a run from this table
  alone, which is also exactly what the live subscription streams.
- **`org_usage_stats`** is a Postgres view (not a materialized one, so
  it's always current) joining orgs → workflows → runs, tracked as a
  Hasura table with a manual object relationship back to `organizations`
  — satisfies "one aggregation…as a computed field or view."
- **`workflow_results`** exists so `db_write` steps have somewhere of
  the app's own to write to, distinct from `step_runs.output` (which is
  execution metadata, not business data).

## The two permission layers, enforced differently

**Layer 1 (org + role scoping)** is pure Hasura declarative permissions.
Every table's filter/check expression bottoms out in
`organization.members.user_id = X-Hasura-User-Id`, scoped by role where
relevant (`role: {_in: [owner, editor]}` for writes). Because this is a
relationship-based boolean expression evaluated per-row by Postgres
itself, there is no code path — not even a bug in application code — that
can leak a row across orgs: the row simply isn't in the result set.

**Layer 2 (step-level gating)** splits into two different mechanisms,
because it's actually two different kinds of check:

1. *Which step/trigger types can be inserted* (`db_write`, `notify`,
   webhook triggers) is still a plain row write, so it's still expressed
   as a Hasura insert `check` — just a more specific one, combining the
   Layer 1 org/role condition with an `_or` over the row's own `type`
   column. It's backstopped by a Postgres `BEFORE INSERT` trigger
   (`enforce_sensitive_step_gate`) so the rule survives even an
   admin-secret write that bypasses Hasura permissions entirely.
2. *Clearing an approval gate* is not a row write at all from the
   caller's point of view — it's "resume execution if I qualify." That
   can't be a declarative permission because there's no row being
   inserted/updated by the caller to attach a check to; the actual writes
   (marking the step approved, restarting the engine) happen inside the
   `approveStep` Action handler, in application code, after an explicit
   `getOrgRole` lookup. This is the one place authorization logic lives
   outside Hasura's permission system, and it's there because the
   assignment is right that this specific check is fundamentally different
   from a row permission.

## Approval-gate pause/resume

`runSteps()` in `functions/_lib/engine.ts` is a plain loop over a
workflow's steps. Hitting an `approval_gate` step sets that `step_run` to
`paused`, sets the `workflow_run` to `paused`, and **returns** — the
function call ends, nothing is polling. Because `step_runs`/`workflow_runs`
are just Postgres rows, the `STEP_RUNS_SUBSCRIPTION` the frontend holds
open sees the `paused` state the instant it's written, with no extra
signaling needed.

Resuming is `approveStep`: after the role check, it flips the gate's
`step_run` to `succeeded` and calls `runSteps()` again, passing the
*index right after the gate* and the run's saved `context` (last step's
output) so execution continues exactly where it left off — same function,
same retry/branch logic, just a different starting index. A rejection
takes the same code path but marks the run `failed` instead of resuming.
