# ADR-009: Zero-Cost MVP Deployment

**Status**: Proposed

## Context

The project's default budget is $0. The MVP must run on infrastructure that doesn't require
recurring payment, while still being real enough (not a toy) to serve a live single user and to
demonstrate genuine engineering judgment as a portfolio artifact.

## Decision

Deploy on free tiers of established providers, chosen for their published free-tier durability and
because each is independently swappable: **Cloudflare Pages** for the static frontend, **Supabase**
free tier for Postgres/Auth/Storage, and **GitHub Actions** free minutes for scheduled Python
ingestion/parsing/scoring jobs. No always-on server is provisioned (see
[ADR-002](ADR-002-frontend-and-backend-boundaries.md)), which is itself what makes $0 realistic —
most paid-tier triggers on these platforms are tied to always-on compute or high traffic, neither
of which this MVP has.

## Alternatives considered

- **A single low-cost VPS running everything**: simpler mental model (one place to look), but
  introduces a real recurring cost and server-maintenance burden (patching, backups, uptime
  monitoring) that free managed tiers avoid entirely for equivalent MVP-scale needs. Documented as
  a fallback (see [COST_MODEL.md](../COST_MODEL.md)), not the default.
- **AWS/Azure/GCP free tier**: these free tiers are typically time-limited (e.g., 12 months) or
  narrowly scoped, and the operational complexity (IAM, VPCs, service configuration) is
  disproportionate to a single-user MVP's needs. Revisit deliberately at public-launch scale, or as
  a separate learning exercise, not as the MVP default.
- **Paying a small amount from the start** to sidestep free-tier fragility (e.g., Supabase's
  paused-project behavior): rejected as the default per explicit project instruction, but not
  hidden — [COST_MODEL.md](../COST_MODEL.md) documents exactly which fragilities this choice
  accepts (the Supabase pause risk) so the tradeoff is visible rather than silently absorbed.

## Consequences

- Every provider choice in [ARCHITECTURE.md](../ARCHITECTURE.md) is anchored to this ADR's
  constraint; a future change that introduces a recurring cost must update this ADR (or supersede
  it) and be flagged to the user explicitly, per [AGENTS.md](../../AGENTS.md).
- Some free-tier fragilities (Supabase pausing) are knowingly accepted rather than engineered
  away, and must be actively monitored (see [OBSERVABILITY.md](../OBSERVABILITY.md)) rather than
  assumed solved. The repository being public removes one fragility rather than adding one:
  standard GitHub Actions runner minutes are free and unlimited here, unlike on a private
  repository's free plan (see [COST_MODEL.md](../COST_MODEL.md)).
- The one plausible small cost (a custom domain) remains optional and cosmetic, not a functional
  requirement.
