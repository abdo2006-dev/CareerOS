# Deployment Strategy

Status: **proposal**, consistent with [ARCHITECTURE.md](ARCHITECTURE.md) and
[ADR-009](adr/ADR-009-zero-cost-mvp-deployment.md).

## 1. Environments

At MVP scale (one user, one maintainer), two environments are enough:

- **Local development** (implemented as of Phase 0): frontend via Vite dev server against a fully
  local Supabase CLI stack — Postgres, Auth, PostgREST, Studio — running in Docker containers.
  **No hosted Supabase project exists for development.** There is no second "dev" hosted project
  either, and no Supabase Branching (an unnecessary cost/complexity for a $0, single-maintainer
  workflow) — this resolves the open question the original planning pass deferred. Exactly one
  hosted Supabase project is reserved for later, for production only, and is not created yet.
- **Production**: the live single-user system, on a hosted Supabase project created later.

A third "staging" environment is not justified yet — reconsider if a second real user is ever
onboarded before a broader public launch.

### Local environment — implementation details (Phase 0)

**Personal Mode runtime (Phase 2A corrective release)**: ordinary local use is `npm run personal`,
not the multi-step developer path below. The launcher confirms Docker/Colima, starts Supabase if
needed, applies pending migrations with `supabase migration up --local`, creates or reuses the
local owner through the trusted Admin API, writes gitignored runtime env files, starts a
loopback-only refresh companion, runs the existing local ingestion CLI, and starts Vite. It never
uses `supabase db reset`, so it is safe to repeat without deleting personal data. The browser sees
only the publishable key plus a local Personal Mode session credential; the service-role key stays
in the companion/ingestion process. Public password authentication remains in the codebase but is
not rendered while `VITE_PERSONAL_MODE=true`.

- **Container runtime**: Colima (Docker CLI + Colima via Homebrew), not Docker Desktop — the
  lightweight open-source combination, chosen per explicit instruction. Started with
  `colima start --cpu 4 --memory 4 --disk 60` — an example allocation only; adjust the
  `--cpu`/`--memory`/`--disk` values to whatever your own machine can spare.
- **A real networking issue was found and fixed, not assumed away, on the machine used for Phase 0
  development**: Colima's default port forwarder mirrors a container's bind address to the host —
  since Supabase's local containers publish on `0.0.0.0` (confirmed via `docker ps`), Colima's
  default forwarding also bound `0.0.0.0` on that Mac's real network interfaces, making the local
  stack reachable from any other device on the same LAN (confirmed with a real cross-device
  connectivity test, not assumed). Setting Docker's own `daemon.json` `"ip": "127.0.0.1"` default
  did **not** fix this, because Supabase's containers specify their host bind explicitly. The
  actual fix: `portForwarder: none` in Colima's config (disabling its automatic forwarder
  entirely) plus explicit, loopback-only SSH local-forwards opened by
  `supabase/scripts/dev-tunnel.sh` (and closed by `supabase/scripts/dev-tunnel-stop.sh`) for
  exactly the four ports CareerOS needs. Verified on that machine: the local stack is unreachable
  from the LAN and reachable from `127.0.0.1`. This finding is reported as observed and
  reproducible on that specific setup, not as a claim that every Colima installation or version
  behaves identically — if you don't reproduce it on yours, the tunnel script is still the safe
  default and costs nothing to keep using.
- **Supabase CLI**: installed via `brew install supabase/tap/supabase`. **Exact version pinned
  everywhere it matters**: `2.109.1`, matching what CI installs via `supabase/setup-cli@v3`'s
  `version:` input — never `latest`, so a CLI update can't silently change local or CI behavior.
- **Public signup is disabled** even locally (`enable_signup = false` in `supabase/config.toml`,
  at the top `[auth]` level). Local development/fixture accounts are created exclusively via the
  Admin API (`supabase/scripts/setup-local-users.mjs`), using the local secret key, never through
  the signup endpoint. One real, non-obvious finding worth recording: `[auth.email].enable_signup`
  turned out to also gate the email/password *provider* as a whole — including password-grant
  **sign-in** for already-confirmed users, not just the signup endpoint. Disabling it broke login
  entirely ("Email logins are disabled"), confirmed against the running stack; it is left `true`,
  while the top-level `[auth].enable_signup = false` is what actually blocks public self-service
  signup.
- **Migrations are the sole source of truth for schema.** `supabase/migrations/*.sql` are applied
  with `supabase db reset` (drops and recreates the local database from empty, replaying every
  migration) — this is also exactly what CI does, so "works locally" and "works in CI" mean the
  same thing. No manual schema edits in local Studio, ever, and the same discipline carries over
  to the future hosted dashboard.

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

## 4. Ingestion/scoring compute deployment

**Status (Phase 2A.0)**: this section previously assumed GitHub Actions cron would run scheduled
Python ingestion/parsing/scoring jobs. [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md)
(TypeScript) and [ADR-017](adr/ADR-017-local-first-ingestion-execution.md) (local-first execution)
supersede that assumption for ingestion and scoring. **No GitHub Actions workflow runs ingestion or
scoring**, today or in the currently planned near-term design.

**Current design (Phase 2A)**: ingestion and scoring run as an explicit local CLI, invoked by the
repository owner on demand against the local (or, once one exists, a real hosted) Supabase stack:

```
cd ingestion && node --env-file=.env.local dist/cli.js ingest --source greenhouse:<token> [--dry-run]
cd ingestion && node --env-file=.env.local dist/cli.js score --all
```

- The service-role key lives in a gitignored `ingestion/.env.local`, never a GitHub Actions
  repository secret, never committed, and never held by any hosted compute at this stage.
- Every run must still be idempotent and safely re-runnable, since the owner may re-run after a
  failure or simply run more or less often than any target cadence — nothing here assumes any
  particular run frequency.
- `.github/workflows/ci.yml` remains the only GitHub Actions workflow in this repository, and it
  never performs ingestion or holds the service-role key — it runs `frontend`/`database` jobs (and,
  from Phase 2A.1, a third `ingestion` job: install, lint, typecheck, test, no live network call).

**Later, explicitly-triggered migration path** (not provisioned now — see
[ADR-017](adr/ADR-017-local-first-ingestion-execution.md) for the full trigger conditions): a hosted
Supabase Edge Function on a schedule, then a Cloudflare Worker + Cron Trigger if Edge Function
limits are hit, with GitHub Actions considered only as a last resort and only with a dedicated
least-privilege database role — never the full service-role key. If and when a scheduled stage is
adopted, the historical cron-hygiene guidance below becomes relevant again:

- **GitHub Actions cron is a best-effort scheduler, not a reliable interactive execution system** —
  see [ARCHITECTURE.md](ARCHITECTURE.md#7-github-actions-reliability-characteristics-read-before-relying-on-cadence)
  for the full set of consequences this has for job design.
- **Cron expressions must avoid the top of the hour** (e.g., `7,22,37,52 * * * *`, not `0,15,30,45
  * * * *`), since GitHub documents that `:00`-aligned schedules see the most congestion-related
  delay.
- A manual `workflow_dispatch` trigger should exist alongside any future cron schedule, so a run can
  be re-triggered on demand while debugging. **This is a developer control, invoked with repository
  write access via the GitHub UI or `gh` CLI — it is not, and must never become, a button exposed in
  the frontend that the browser triggers using a stored GitHub token.** Embedding any token with
  workflow-trigger permission in browser-reachable code is a secret-exposure risk this project does
  not accept. A genuine user-facing "process this now" action belongs to the synchronous Edge
  Function/worker layer reserved in [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md),
  introduced only once actually needed — not to GitHub Actions.
- **The repository is public**, so standard GitHub-hosted runner minutes for public repositories
  are free (no monthly minute quota to track, unlike a private repository on the free plan) — see
  [COST_MODEL.md](COST_MODEL.md). This currently applies only to CI (`ci.yml`), since ingestion runs
  locally, not on any GitHub-hosted runner.

**Resume parsing** (Phase 1B, deferred) is unaffected by ADR-016/ADR-017: its language and execution
model remain a separate, undecided question for that phase's own design pass (see
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)).

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
