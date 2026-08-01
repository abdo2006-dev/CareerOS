# Observability

Status: **proposal**. Scoped to what a single-maintainer, $0-budget, mostly-batch system actually
needs: knowing when a scheduled job silently stops working, and knowing when data goes stale.

## 1. Why this matters more than usual here

There is no always-on server to watch and no user-facing error rate to alert on in the traditional
sense — the biggest realistic failure mode is quiet: an adapter breaks because a source changed
its page layout, and nothing visibly errors, it just stops finding new opportunities. Without
deliberate observability, this could go unnoticed for weeks.

## 2. Ingestion run logging (the `ingestion_runs` table)

Every scheduled ingestion, parsing, and scoring job writes a row to `ingestion_runs` (see
[DATA_MODEL.md](DATA_MODEL.md)) recording: start/end time, status, records found/new/updated/
removed, and an error summary. This is the primary observability artifact and it lives in the same
Postgres database as everything else — no separate logging infrastructure needed at this scale.

## 3. GitHub Actions as the first layer of visibility

Each scheduled workflow's pass/fail status is visible in the GitHub Actions UI and can trigger
GitHub's own notification (email) on failure at no additional cost or setup — this is the
zero-effort baseline alert for "the job crashed outright."

## 4. Detecting silent degradation (not just crashes)

A job can "succeed" (exit 0) while doing nothing useful — e.g., an adapter whose selector broke
and now returns zero results without erroring. Mitigation (proposal): each ingestion run compares
`records_found` against a rolling recent baseline for that source and flags (not blocks) the run
as `needs_review` if it's anomalously low (e.g., zero when the recent average is dozens). This
flag surfaces in the frontend's own admin/status view, not just in raw logs, so the user actually
sees it during normal use rather than having to check GitHub Actions proactively.

## 5. Data freshness surfaced to the user

The frontend shows, per source (or in aggregate), "last successfully checked" timestamps derived
from `ingestion_runs` / `source_listings.last_seen_at`. If the most recent run for a source is
older than its expected cadence by a meaningful margin, the UI indicates staleness rather than
presenting old data as current — and because GitHub Actions cron is best-effort and can start late
or occasionally not run at all (see
[ARCHITECTURE.md](ARCHITECTURE.md#7-github-actions-reliability-characteristics-read-before-relying-on-cadence)),
"a bit later than the target cadence" must be treated as the normal case, not an anomaly, when
choosing the staleness threshold that actually triggers a visible warning.

## 5a. Pending-duplicate review queue depth

Because cross-source deduplication deliberately never auto-merges uncertain matches (see
[ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md)), the count of
`potential_duplicate_links` rows with `status = pending_review` is itself an observability signal:
a growing, unreviewed queue means market-intelligence numbers are increasingly over-counting
un-confirmed duplicates. This count is surfaced alongside the review queue in
[USER_WORKFLOWS.md](USER_WORKFLOWS.md#workflow-8--reviewing-a-potential-duplicate), not just
buried in a raw table — the goal is to make the accepted over-counting limitation visible rather
than silent.

## 5b. Claimed-but-stuck work items

Any table using the atomic-claim pattern (`resumes.status = 'processing'`, and any future
claimable work queue) should be monitorable for items whose `claimed_at` has exceeded the lease
timeout without completing — in practice, a simple count query an operator (currently the user,
acting as their own administrator) can check, surfacing a job that died mid-run without a
subsequent run having reclaimed it yet. See the deferred [resume domain](DATA_MODEL.md#resume-domain)
for the claim/lease mechanism Phase 1B must define.

## 6. Error logging content rules

Consistent with [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md): logs and `error_summary`
fields capture exception types, messages, and affected record IDs — never resume text, full
opportunity description bodies, or other personal-data field values.

## 7. What's deferred

A dedicated error-tracking service (Sentry or similar) and metrics/dashboarding tool (Grafana,
Datadog) are not justified at one-user, batch-job scale — GitHub Actions status plus the
`ingestion_runs` table cover the real need. Revisit if ingestion sources grow enough that manual
review of the status view becomes impractical, or if a synchronous API layer is added (see
[ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md)), since that introduces request-level
failure modes this batch-oriented approach doesn't cover.
