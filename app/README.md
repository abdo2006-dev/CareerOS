# CareerOS frontend

React + TypeScript + Vite single-page app. Talks directly to the local Supabase stack
(Postgres/Auth/PostgREST) — no backend server in this project (see
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), [ADR-002](../docs/adr/ADR-002-frontend-and-backend-boundaries.md)).

For normal personal use, run `npm run personal` from the repository root. It writes this app's
gitignored `.env.local`, establishes an invisible local Personal Mode session, refreshes configured
sources, and starts Vite. See the repository root [README.md](../README.md) for the full local
runtime notes and advanced maintainer setup.

## Scripts

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                            |
| `npm run build`        | Type-check (`tsc -b`) and produce a production build |
| `npm run preview`      | Serve the production build locally                   |
| `npm run typecheck`    | Type-check only                                      |
| `npm run lint`         | ESLint                                               |
| `npm run format`       | Prettier, write mode                                 |
| `npm run format:check` | Prettier, check mode (used in CI)                    |
| `npm run test`         | Vitest, single run (used in CI)                      |
| `npm run test:watch`   | Vitest, watch mode                                   |

## Environment variables

`npm run personal` creates `.env.local` automatically for the local personal runtime. Only
`VITE_`-prefixed values are exposed to the browser bundle — never put a secret/service-role key in
one. `VITE_PERSONAL_MODE=true` is a local-only convenience boundary: it uses a generated local
owner credential to establish the existing RLS-scoped session without rendering authentication UI.
Set it false or omit it when returning to the dormant public-auth route.
