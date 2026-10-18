# GateRescue

Drayage disruption recovery for port dispatchers: when a terminal's
appointment portal goes down, GateRescue tracks which moves are affected,
collects driver check-ins, and proposes recovery assignments for dispatcher
approval. All data in this repository is **synthetic**.

| Area | Owner |
|---|---|
| Backend, GitHub, Vercel | Sebastian |
| Frontend (dispatcher dashboard) | Melanie |
| Scenario / data, pitch | Maelie |

## Current status

- **Dashboard** (`/`): runs entirely on built-in local synthetic data
  (`src/lib/demo/`). Not yet connected to the API.
- **Backend foundation** (branch `backend/foundation`, not merged):
  `GET /api/state`, `POST /api/driver-reports`, demo session endpoints,
  Supabase schema with RLS, server-only database access.
  Contract: [docs/backend-contract.md](docs/backend-contract.md).
- **Scenario `terminal-a-outage` v1**: Maelie's CSVs (`data/source/`,
  unchanged) plus the team-authorized decisions in
  `data/scenario/terminal-a-outage.v1.json`
  ([docs/scenario-decisions.md](docs/scenario-decisions.md)) convert to
  `supabase/import/authoritative_dataset.sql`
  ([docs/dataset-import.md](docs/dataset-import.md)).
  - ✅ **Tested locally** (disposable Postgres + PostgREST and the real API):
    migrations, import, and the backend recovery queue. It matches all 8
    expected-ranking rows before and after D02's 14:10 report. `npm test`
    covers the same comparison plus independent feasibility checks.
  - ⏳ **Live Supabase import still pending**: two migrations and the import
    remain to be run (steps in `docs/dataset-import.md`).
  - `GET /api/state` now returns **partial data with explicit `unknowns`**
    instead of failing. Before D02 reports, D02's availability, location and
    last report are listed as unknown.
  - Shared-type and date-handling changes for the dashboard are listed in
    [docs/frontend-coordination.md](docs/frontend-coordination.md).

- **Retell driver-report intake** (`POST /api/retell/driver-report`,
  signature-authenticated, deduplicated; uses the shared driver-report
  service): implemented and tested locally. Setup and the real-call
  checklist: [docs/retell-integration.md](docs/retell-integration.md).

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

The dashboard needs no configuration. To exercise the API, copy
`.env.example` to `.env.local` (git-ignored) and fill in the values from the
backend owner — never commit real credentials.

## Useful scripts

| Command | Purpose |
|---|---|
| `npm run lint` / `npm run build` | Lint and production build |
| `npm test` | Recovery engine, feasibility, date handling and expected-ranking tests (Node test runner) |
| `npm run db:import:generate` | Regenerate the scenario import from `data/source/` + `data/scenario/` |
| `npm run fixture:ranking` | Regenerate `tests/fixtures/expected-ranking.json` (test fixture, not operational data) |
| `npm run db:seed:generate` | Regenerate the **legacy** local-demo seed (do not load into the shared project) |
