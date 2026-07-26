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

- **Container runtime**: Colima (Docker CLI + Colima via Homebrew), not Docker Desktop — the
  lightweight open-source combination, chosen per explicit instruction. Started with
  `colima start --cpu 4 --memory 4 --disk 60` (out of this machine's 10 CPUs / 16 GiB / 461 GiB
  free — a conservative fraction, not "nearly all system resources").
- **A real networking issue was found and fixed, not assumed away**: Colima's default port
  forwarder mirrors a container's bind address to the host — since Supabase's local containers
  publish on `0.0.0.0` (confirmed via `docker ps`), Colima's default forwarding also bound
  `0.0.0.0` on the Mac's real network interfaces, making the local stack reachable from any other
  device on the same LAN (confirmed with a real cross-device connectivity test, not assumed).
  Setting Docker's own `daemon.json` `"ip": "127.0.0.1"` default did **not** fix this, because
  Supabase's containers specify their host bind explicitly. The actual fix: `portForwarder: none`
  in Colima's config (disabling its automatic forwarder entirely) plus explicit, loopback-only SSH
  local-forwards opened by `supabase/scripts/dev-tunnel.sh` (and closed by
  `supabase/scripts/dev-tunnel-stop.sh`) for exactly the four ports CareerOS needs. Verified: the
  local stack is unreachable from the LAN and reachable from `127.0.0.1`. This is a real,
  non-obvious local-only quirk worth understanding before assuming "Colima just works like Docker
  Desktop" — it doesn't, by default.
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
