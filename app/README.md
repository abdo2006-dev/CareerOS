# CareerOS frontend

React + TypeScript + Vite single-page app. Talks directly to the local Supabase stack
(Postgres/Auth/PostgREST) — no backend server in this project (see
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), [ADR-002](../docs/adr/ADR-002-frontend-and-backend-boundaries.md)).

See the repository root [README.md](../README.md) for full local setup instructions
(Colima/Docker, Supabase CLI, the loopback dev tunnel).

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

Copy `.env.example` to `.env.local` and fill in the values `supabase status` prints
for the local stack. Only `VITE_`-prefixed variables are exposed to the browser bundle —
never put a secret/service-role key in one.
