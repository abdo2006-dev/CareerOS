# Cost Model

Status: **proposal**, based on published free-tier limits at planning time. Free-tier terms change
— this document should be re-verified against each provider's current published limits before
relying on it operationally, and updated when it drifts.

## 1. MVP target: $0/month

| Component | Provider | Free tier basis | Realistic MVP usage | Risk of exceeding |
|---|---|---|---|---|
| Frontend hosting | Cloudflare Pages | Generous free tier for static sites, unlimited requests/bandwidth on the free plan as published | One small SPA, single user | Very low |
| Database + Auth + Storage | Supabase free tier | Free project with published limits on database size, monthly active users, storage, and auto-pauses after a period of inactivity | Low data volume (low thousands of rows), one user, small files (resumes are KB-scale) | **Real risk**: free-tier project pausing after inactivity — mitigated by scheduled jobs acting as a keep-alive, but this is a genuine fragility, not fully solved (see §3). Storage growth is also bounded on purpose: only sanitized opportunity snapshots are retained indefinitely (see [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy)) — raw external responses are not stored by default, and the optional debug table has a short (14-day, proposal) retention with scheduled cleanup, so it cannot grow unbounded even if left enabled |
| Scheduled compute | GitHub Actions | Free minutes/month for private repositories (limited), unlimited for public repositories | Short jobs (minutes each), daily-to-hourly cadence | Low at proposed cadence; would become real if ingestion frequency increased substantially or the repo must stay private |
| Domain | Optional custom domain | N/A — `*.pages.dev` is free | Not required for functionality | N/A unless a custom domain is deliberately purchased |
| LLM API calls (deferred feature) | Not yet selected | Most providers require payment beyond a small trial credit | Not used until Phase 7 | This is the most likely first genuinely-paid line item once LLM explanation prose is added — budget and provider choice deferred to that phase, and must be re-evaluated against [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md)'s constraint that LLM use only follows grounded scoring |

## 2. A note on "free" as a design constraint, not a guarantee

Every "free tier" above is a business decision by a for-profit company and can change. The
architecture's resilience to this isn't "these will always be free" but "each component is
swappable without a rewrite": Cloudflare Pages could be replaced by any static host; Supabase's
Postgres+Auth+Storage bundle could, at real cost in migration effort, be replaced by a self-hosted
Postgres plus a different auth provider if its terms ever became unworkable; GitHub Actions could
be replaced by any scheduler that can run a Python script. This swappability is a consequence of
keeping business logic in the application/adapter code rather than in provider-specific glue,
consistent with [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Known fragility: Supabase free-tier project pausing

Free Supabase projects pause after a period of inactivity and require a manual or API-triggered
unpause. Scheduled ingestion/scoring jobs hitting the database regularly should prevent this in
practice, but this must be explicitly monitored (see [OBSERVABILITY.md](OBSERVABILITY.md)) rather
than assumed solved — a paused database silently breaks every scheduled job until someone notices
and unpauses it manually.

## 4. Real, legitimately-free options given the user's student status

The user is a university student, which unlocks the **GitHub Student Developer Pack** and similar
programs (e.g., cloud-provider student credits from Azure, DigitalOcean, or others as currently
offered). These are genuinely free, not merely low-cost, and are worth deliberately evaluating as
fallbacks if a specific free tier above proves insufficient (e.g., a self-hosted-adjacent worker
using student cloud credits instead of adding a paid GitHub Actions minutes tier). This document
does not assume the pack is already active — see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## 5. What would trigger a real spending decision

- LLM API usage at Phase 7, once explanation prose is added — likely the first real, ongoing cost,
  even if small.
- A custom domain, if wanted for portfolio presentation polish — a one-time/annual cost of roughly
  the price of a coffee per month, not a technical necessity.
- Any move to an always-on API/worker layer (see
  [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md)) if free-tier hosts' sleep/cold-start
  behavior becomes unacceptable — the point at which a small paid tier (a few dollars/month) might
  be the pragmatic choice over continued engineering effort to avoid it.

Each of these should be raised explicitly to the user before being adopted, per the project's
default-$0 instruction — this document is where that evaluation should be recorded when it
happens.
