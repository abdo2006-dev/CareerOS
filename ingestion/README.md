# ingestion/

Local TypeScript CLI that imports real opportunity listings from configured, reviewed sources into
the local (or a real hosted) Supabase project. Trusted, service-role code — see
[docs/adr/ADR-016](../docs/adr/ADR-016-typescript-ingestion-runtime.md),
[docs/adr/ADR-017](../docs/adr/ADR-017-local-first-ingestion-execution.md), and
[docs/INGESTION_ARCHITECTURE.md](../docs/INGESTION_ARCHITECTURE.md) for the full design.

## Setup

```bash
cd ingestion
npm ci
cp .env.example .env.local   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (supabase status)
```

`.env.local` is gitignored. The service-role key bypasses Row Level Security — it must never be
committed, printed, or reach the browser. By default the CLI refuses to run against a
non-loopback `SUPABASE_URL`; set `INGESTION_ALLOW_REMOTE=1` only for a deliberately configured
real hosted target.

## Usage

```bash
npm run ingest -- --source greenhouse                 # all enabled Greenhouse boards
npm run ingest -- --source greenhouse --board helsing  # one board
npm run ingest -- --source greenhouse --dry-run        # fetch + compare only, zero writes
```

Only sources already reviewed and seeded (`enabled = true`) in the `sources` table are ever
fetched — the adapter never enumerates or probes arbitrary board tokens.

## Development

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
```

Tests use synthetic fixtures and a local `node:http` mock server — no live network call. CI runs
the same checks (`.github/workflows/ci.yml`, `ingestion` job).
