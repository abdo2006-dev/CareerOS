# Deployment Strategy

Status: **proposal**, consistent with [ARCHITECTURE.md](ARCHITECTURE.md) and
[ADR-009](adr/ADR-009-zero-cost-mvp-deployment.md).

## 1. Environments

At MVP scale (one user, one maintainer), two environments are enough:

- **Local development**: frontend via Vite dev server against a Supabase project (either a free
  second "dev" Supabase project or the same project with clear discipline about test data —
  decision deferred to implementation start, see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)); Python
  ingestion/scoring run locally against the same dev database for adapter development.
- **Production**: the live single-user system.

A third "staging" environment is not justified yet — reconsider if a second real user is ever
onboarded before a broader public launch.

## 2. Frontend deployment

- Build: `vite build` produces static assets.
- Host: Cloudflare Pages, connected to the repository's default branch; a push to `main` triggers
  a build and deploy automatically. Preview deployments on pull requests are a natural fit if/when
  PR-based workflow is adopted.
- Configuration: Supabase project URL and anon (public, RLS-restricted) key are the only
  frontend-side configuration values, set as Cloudflare Pages environment variables — the anon key
  is safe to expose client-side by design (Supabase's model), unlike the service-role key.

## 3. Database and backend-as-a-service deployment

- Supabase project (managed) hosts Postgres, Auth, and Storage. Schema changes are applied via
  versioned SQL migrations checked into `supabase/migrations/`, applied through the Supabase CLI —
  never hand-edited directly in the Supabase dashboard for anything beyond throwaway
  experimentation, so the schema history stays reproducible.
- RLS policies are part of the migration files, not a separately-managed dashboard setting, for
  the same reproducibility reason.

## 4. Scheduled compute deployment

- GitHub Actions workflows in `.github/workflows/` define the ingestion, resume-parsing, and
  scoring jobs on cron schedules (see cadences in
  [DATA_FLOW.md](DATA_FLOW.md#5-data-freshness-expectations-proposal)). **GitHub Actions cron is a
  best-effort scheduler, not a reliable interactive execution system** — see
  [ARCHITECTURE.md](ARCHITECTURE.md#7-github-actions-reliability-characteristics-read-before-relying-on-cadence)
  for the full set of consequences this has for job design.
- **Cron expressions must avoid the top of the hour** (e.g., `7,22,37,52 * * * *`, not `0,15,30,45
  * * * *`), since GitHub documents that `:00`-aligned schedules see the most congestion-related
  delay.
- Each workflow installs Python dependencies (pinned via a lockfile), runs the relevant module,
  and exits — no persistent process. Every workflow must be idempotent and safely re-runnable,
  since a late or dropped scheduled run may need to be caught up by the next run or a manual one
  without duplicating data.
- Secrets (Supabase service-role key, any source API keys) are GitHub Actions repository secrets,
  injected as environment variables only inside the job run.
- A manual `workflow_dispatch` trigger should exist alongside the cron schedule for every job, so
  ingestion or scoring can be re-run on demand while debugging. **This is a developer control,
  invoked with repository write access via the GitHub UI or `gh` CLI — it is not, and must never
  become, a button exposed in the frontend that the browser triggers using a stored GitHub token.**
  Embedding any token with workflow-trigger permission in browser-reachable code is a secret-
  exposure risk this project does not accept. A genuine user-facing "process this now" action
  belongs to the synchronous Edge Function/worker layer reserved in
  [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md), introduced only once actually needed
  — not to GitHub Actions.
- **GitHub Actions minute usage for private repositories must be checked against the account's
  actual current plan and allowance** (in GitHub's billing/usage settings) before the ingestion
  cadence is finalized — see [COST_MODEL.md](COST_MODEL.md) and
  [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md); this document does not assume a specific number.

## 5. Release process (proposal)

Given a single maintainer, a lightweight flow is appropriate: feature branches merged to `main` via
pull request (even solo, for the review discipline and to keep CI/status checks meaningful),
`main` is always deployable, Cloudflare Pages deploys `main` automatically, and database migrations
are applied manually (or via a GitHub Actions step gated on migration files changing) before or
alongside the corresponding frontend deploy when a change spans both.

## 6. Rollback

- Frontend: Cloudflare Pages retains prior deployments; rolling back is re-pointing to a previous
  build, no data implications.
- Database: migrations should be written to be forward-only where practical (additive columns,
  backfills) during this early phase; a genuine rollback migration is written by hand when a
  change needs to be reverted, since automatic down-migrations are easy to get wrong and risk data
  loss on a system that stores irreplaceable snapshots.
- Scheduled jobs: reverting a bad ingestion/scoring code change just means the next scheduled (or
  manually triggered) run uses the reverted code; because writes are additive/versioned (see
  [ADR-006](adr/ADR-006-posting-version-history.md)), a bad run does not require a data rollback,
  only a code rollback plus, if needed, a corrective run.

## 7. Domain and TLS

Cloudflare Pages provides a `*.pages.dev` subdomain with TLS by default at no cost; a custom domain
is optional and, if purchased, is the one plausible small recurring cost in this project (see
[COST_MODEL.md](COST_MODEL.md)) — not required for functionality.

## 8. What is explicitly not part of MVP deployment

No containers, no Kubernetes, no infrastructure-as-code tool beyond Supabase SQL migrations and
GitHub Actions YAML, no blue/green or canary deployment (meaningless at one-user scale), no CDN
beyond what Cloudflare Pages provides by default.
