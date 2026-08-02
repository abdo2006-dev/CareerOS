# CareerOS

[![CI](https://github.com/abdo2006-dev/CareerOS/actions/workflows/ci.yml/badge.svg)](https://github.com/abdo2006-dev/CareerOS/actions/workflows/ci.yml)

CareerOS is a personal career-intelligence platform for a German-based Electrical and Computer
Engineering (ECE) student. It discovers internships, working-student roles, research positions,
hackathons, scholarships, and other resume-building opportunities; compares them against a
detailed saved profile; explains where the student is competitive and where they are not; and
tracks the full lifecycle from "found it" to "applied" to "interviewed."

Phase 0 is implemented, and the first Phase 1A profile-core/education slice adds routed manual
profile and primary-education workflows: a React/TypeScript/Vite frontend, a local Supabase stack
(Postgres/Auth/PostgREST), the initial `profiles`/`education_entries` schema with Row Level
Security, and CI. See [Local development setup](#local-development-setup) below to run it.

This repository is public for portfolio, education, and review purposes — see
[License status](#license-status) and [Contributing](#contributing) below before assuming more
than that.

## Why this exists

Job and internship listings disappear, requirements are inconsistently described, and it is hard
for a single student to judge, across dozens of postings, which ones are realistic targets versus
long shots — and which skills are worth building next. CareerOS turns that judgment process into
an explainable, evidence-based pipeline instead of a spreadsheet or a gut feeling.

The first user is a specific person (ECE undergraduate at Constructor University Bremen, starting
year 2 in August 2026), but the system is designed so that supporting additional users later is a
matter of enabling sign-ups, not rearchitecting the schema or the pipeline. See
[ADR-008](docs/adr/ADR-008-private-first-multi-user-later.md).

## Documentation map

| Document | Purpose |
|---|---|
| [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | What the product must do and for whom |
| [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) | What ships first, what is explicitly deferred |
| [docs/USER_WORKFLOWS.md](docs/USER_WORKFLOWS.md) | Concrete end-to-end usage scenarios |
| [docs/OPPORTUNITY_TAXONOMY.md](docs/OPPORTUNITY_TAXONOMY.md) | Career vs. development opportunities, and how each is classified |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System components, where they run, how they talk |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | How data moves from external source to scored, saved opportunity |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Database schema and entity relationships |
| [docs/PROFILE_COMPLETENESS_SPEC.md](docs/PROFILE_COMPLETENESS_SPEC.md) | Language-neutral, explainable Phase 1A completeness contract |
| [docs/SCORING_AND_MATCHING_MODEL.md](docs/SCORING_AND_MATCHING_MODEL.md) | How relevance and competitiveness scores are computed and explained |
| [docs/DATA_SOURCES_AND_COMPLIANCE.md](docs/DATA_SOURCES_AND_COMPLIANCE.md) | Which sources are used, legally and operationally |
| [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) | Auth, data isolation, secrets, resume privacy, threat handling |
| [docs/RLS_POLICY_MATRIX.md](docs/RLS_POLICY_MATRIX.md) | Table-by-table, bucket-by-bucket authorization reference |
| [docs/DEPLOYMENT_STRATEGY.md](docs/DEPLOYMENT_STRATEGY.md) | Where things are hosted and how they ship |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | How correctness is verified, including scoring correctness |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Logging, monitoring, and failure visibility |
| [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Phased implementation sequence |
| [docs/COST_MODEL.md](docs/COST_MODEL.md) | What this costs at each stage, and where the free tiers break down |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Unresolved decisions, honestly tracked |
| [docs/adr/](docs/adr/README.md) | Architecture Decision Records |
| [SECURITY.md](SECURITY.md) | How to report a security issue |

## Local development setup

Prerequisites:

- Node.js `22.23.1` (the root [.nvmrc](.nvmrc) is authoritative). Run `nvm use` from the
  repository root before `npm ci`; the frontend package declares the same engine.
- A Docker-compatible container runtime. This project uses **Colima** (Docker CLI + Colima, via
  Homebrew) rather than Docker Desktop — see [docs/DEPLOYMENT_STRATEGY.md](docs/DEPLOYMENT_STRATEGY.md)
  for why, including a real network-exposure issue found and fixed during setup.
- The Supabase CLI, pinned to the exact version recorded in
  [docs/DEPLOYMENT_STRATEGY.md](docs/DEPLOYMENT_STRATEGY.md) (`brew install supabase/tap/supabase`).

Steps:

```bash
# 1. Start the container runtime (only needed once per login session).
#    The --cpu/--memory/--disk values below are an example; adjust them to
#    what your own machine can spare.
colima start --cpu 4 --memory 4 --disk 60

# 2. Start Supabase (brings up the containers the tunnel below forwards to)
supabase start

# 3. Open a loopback-only tunnel to the local Supabase stack.
#    Colima's default port forwarder would otherwise expose the stack to
#    your LAN -- this has been observed on at least one Colima installation
#    (see docs/DEPLOYMENT_STRATEGY.md) and may not reproduce identically on
#    every machine/Colima version, so this tunnel is kept as the safe default
#    regardless. It replaces the default forwarding with forwards explicitly
#    bound to 127.0.0.1.
./supabase/scripts/dev-tunnel.sh

# 4. Apply every migration from an empty database
supabase db reset

# 5. Create the two local-only development login users (idempotent).
#    Prints a freshly generated local-only password once; nothing is written
#    to a tracked file. Set CAREEROS_DEV_PASSWORD to choose your own instead.
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SECRET_KEY=$(supabase status -o env | grep '^SECRET_KEY=' | cut -d= -f2- | tr -d '"') \
node supabase/scripts/setup-local-users.mjs

# 6. Configure the frontend's environment and run it
cd app
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from `supabase status`
npm ci
npm run dev
```

Sign in with one of the two accounts the setup script prints (`dev-owner@careeros.local` /
`dev-secondary@careeros.local`), using the password the script printed in step 5.

Running the tests:

```bash
# Frontend: lint, types, component tests, build
cd app && npm ci && npm run lint && npm run typecheck && npm run test && npm run build

# Database: pgTAP RLS tests, run against the real local Postgres instance
supabase test db

# Migration compatibility: Phase 0 schema/data -> Phase 1A migration
./supabase/scripts/migration-compatibility-test.sh

# API-path integration test: real Auth -> JWT -> PostgREST -> RLS -> Postgres,
# using temporary users (each with their own randomly generated per-run
# password) that are always cleaned up afterward
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SECRET_KEY=... SUPABASE_PUBLISHABLE_KEY=... \
node supabase/scripts/api-integration-test.mjs
```

When you're done: `./supabase/scripts/dev-tunnel-stop.sh`, `supabase stop`, `colima stop`.

## Documentation status

Planning documentation was reviewed and approved before implementation began. Per project
instructions, coding agents must not mark an ADR `Accepted` merely because code exists — see
[docs/adr/README.md](docs/adr/README.md) for which ADRs are actually implemented-and-tested versus
still proposed.

## License status

This repository is public for portfolio, education, and review purposes. **No open-source license
has currently been granted** — default copyright applies, meaning no reuse, redistribution, or
derivative-work rights are given beyond what GitHub's own Terms of Service allow for public
repositories (e.g., viewing and forking for personal reference). A license decision will be made
separately and this section updated when it is. Do not treat this project as open source until
then.

## Contributing

This is currently a solo-maintained portfolio project, not yet an open-contribution one. External
feedback is welcome through GitHub issues, but unsolicited implementation pull requests may be
declined while the architecture is still evolving (see [docs/adr/](docs/adr/README.md) for what's
actually settled versus still proposed). Security issues follow [SECURITY.md](SECURITY.md), not a
public issue.

## Guidance for coding agents

Before making any change to this codebase, read [AGENTS.md](AGENTS.md) and
[CLAUDE.md](CLAUDE.md).
