# ADR-017: Local-First Ingestion Execution

**Status**: Proposed — revises the execution-model assumption implicit in
[ARCHITECTURE.md](../ARCHITECTURE.md)'s Phase 0 diagram and [DATA_FLOW.md](../DATA_FLOW.md), both of
which currently depict scheduled GitHub Actions as the active ingestion scheduler. As of this ADR,
**no ingestion code exists and no hosted Supabase project exists**; this ADR governs where Phase 2A
ingestion runs once it does.

## Context

[ARCHITECTURE.md](../ARCHITECTURE.md) reserves GitHub Actions cron as the scheduler for Python
ingestion/parsing/scoring jobs, and [DATA_FLOW.md](../DATA_FLOW.md) §0 states "every flow below runs
on GitHub Actions cron." That was a reasonable default when written, but Phase 2A implementation
planning surfaced five concrete problems with adopting it as the *first* execution model, not merely
as a future one:

1. **There is no hosted Supabase project.** [ARCHITECTURE.md](../ARCHITECTURE.md) §3 and
   [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) both confirm development runs entirely against a local
   Supabase CLI stack (Colima + Docker), reachable only at `127.0.0.1`. **A GitHub-hosted runner
   cannot reach a loopback-only database** — this alone makes scheduled Actions non-functional today,
   not merely undesirable.
2. **A scheduled Action would require a service-role credential as a repository secret.** The
   service-role key bypasses Row Level Security by design
   ([RLS_POLICY_MATRIX.md](../RLS_POLICY_MATRIX.md)). Granting that key to a scheduled workflow
   before a hosted project and a least-privilege database role exist means any workflow change (or
   anyone able to land one) gets unrestricted, RLS-bypassing access to every table — an
   unnecessarily large blast radius to accept before it is needed.
3. **The repository is public.** Workflow logs, artifacts, and PR contents are world-readable
   ([SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md) §4 confirms secrets themselves are masked
   in logs, but *ingestion output* — counts, error text, URLs — is not, and must be held to the same
   no-personal-data logging discipline as everything else
   ([SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md) §9) in a surface that is public by default.
4. **Shared GitHub-hosted runner IP ranges are routinely rate-limited or blocked** by CDN/WAF layers
   in front of third-party ATS APIs, for reasons unrelated to the adapter's own correctness — exactly
   the "quiet, hard-to-diagnose staleness" failure mode
   [OBSERVABILITY.md](../OBSERVABILITY.md) §1 is written to guard against.
5. **GitHub Actions cron is best-effort and can start late or be skipped**
   ([ARCHITECTURE.md](../ARCHITECTURE.md) §7). Combined with the conservative closure logic required
   for opportunity lifecycle tracking, a skipped run must never be misread as "everything closed" —
   a risk best avoided entirely until a scheduler is actually needed, rather than designed around
   from day one.

## Decision

**Phase 2A ingestion initially runs as an explicit local CLI**, invoked on demand by the repository
owner against their own local (or, later, hosted) Supabase stack — not on any schedule, and not on
any hosted compute.

```
cd ingestion && node --env-file=.env.local dist/cli.js ingest --source greenhouse:<token> [--dry-run]
```

The service-role key is read from a gitignored `ingestion/.env.local`, following the same pattern
`app/.env.example` already establishes for the frontend's publishable key — never committed, never
logged, never held by any hosted compute at this stage.

Reasons, restated as the standing rule for this stage:

- No hosted Supabase project exists to schedule against.
- A cloud runner cannot write to the loopback-only local database.
- A scheduled GitHub Action would require a service-role credential before a least-privilege role
  exists to scope it down.
- Public workflow logs and shared-runner IP reputation increase risk for no present benefit.
- Source rate limits and terms ([DATA_SOURCES_AND_COMPLIANCE.md](../DATA_SOURCES_AND_COMPLIANCE.md))
  are easier to respect under controlled, manual, single-operator execution than under an automated
  schedule whose exact timing and retry behavior is harder to reason about up front.
- Local, on-demand runs are sufficient for the current private, single-user system — there is no
  user waiting on near-real-time discovery.

### Later migration path (not provisioned by this ADR)

| Stage | Trigger to move | Target |
|---|---|---|
| 1 (this ADR) | — | Local CLI, manual, against local or a real hosted Supabase project |
| 2 | A hosted Supabase project exists and manual execution becomes the actual bottleneck | **Supabase Edge Function** on a schedule (Deno/TypeScript — see [ADR-016](ADR-016-typescript-ingestion-runtime.md)), colocated with the database, no egress from a shared CI/runner IP pool |
| 3 | Edge Function limits (execution time, memory) are actually hit with more sources | **Cloudflare Worker + Cron Trigger** (TypeScript, free tier, already the frontend's hosting provider) |
| 4 | Only if 2 and 3 both prove insufficient | A small scheduled container worker, evaluated on its own merits at that time |

Whichever hosted stage is eventually adopted, **secrets are held only by that trusted hosted
compute**, never by a GitHub Actions workflow secret used for live ingestion, and never by any
browser-reachable code. This ADR makes **no architectural assumption that GitHub Actions must
become the production scheduler** — it is listed above only as a rejected-by-default option (see
Alternatives), not a fallback the roadmap should drift toward. `workflow_dispatch` remains a
developer control, not a user-facing "run now" button
([ARCHITECTURE.md](../ARCHITECTURE.md) §7), independent of which stage above is current.

## Alternatives considered

- **Scheduled GitHub Actions ingestion from the start** (the assumption this ADR revises): rejected
  for Phase 2A for the five reasons in Context — most decisively, there is no reachable database for
  it to write to. Reconsider only as the last-resort stage 4 above, and only with a dedicated
  least-privilege Postgres role, never the full service-role key.
- **A hosted always-on worker from the start**: reintroduces the always-on-host cost
  [ADR-002](ADR-002-frontend-and-backend-boundaries.md)/[ADR-009](ADR-009-zero-cost-mvp-deployment.md)
  reject, to solve a scheduling problem that does not yet exist (there is exactly one operator,
  running ingestion on demand).
- **Local CLI, but with a cron-like local scheduler (e.g., `launchd`/`cron` on the owner's machine)**:
  considered and rejected as unnecessary complexity — the owner running one command when they want
  fresh data is simpler than maintaining a local scheduler for a single-user system, and does not
  need this ADR's approval to change later at the owner's own discretion.

## Consequences

- [ARCHITECTURE.md](../ARCHITECTURE.md)'s Phase 0 component diagram and prose, and
  [DATA_FLOW.md](../DATA_FLOW.md) §0/§1, are updated in the same change as this ADR to present local
  CLI execution as the current/approved-near-term design and scheduled hosted execution as a
  clearly labeled possible-later stage — not as the currently active design.
- Ingestion freshness is exactly as current as the owner's last manual run; the opportunity
  lifecycle model ([DATA_FLOW.md](../DATA_FLOW.md), Phase 2A's freshness/closure design) must treat
  `stale` as an expected, common state under this execution model, not an anomaly.
- Moving to any later stage in the migration path is an infrastructure change, not a schema or
  adapter-interface change — the adapter code written against [ADR-016](ADR-016-typescript-ingestion-runtime.md)
  is expected to run largely unchanged under a future Edge Function or Worker invocation.
- No cloud resource, scheduled workflow, or hosted secret is created by this ADR or by Phase 2A.
