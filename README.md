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
- **Scenario dataset import**: Maelie's CSVs (`data/source/`, unchanged)
  convert to `supabase/import/authoritative_dataset.sql`.
  Details and open items: [docs/dataset-import.md](docs/dataset-import.md).
  - ✅ Migrations, import and API were **tested locally** against a disposable
    Postgres + PostgREST stack.
  - ⏳ The **live Supabase import is still pending**: the operational-schema
    migration has been run; the dataset migration and import have not.
  - ⚠️ The dataset is missing scenario fields (simulated start time, container
    availability, driver last-report times). Until they are supplied,
    **`GET /api/state` returns `503 dataset_incomplete`** with the list of
    missing values, and driver reports return the same error until the
    start time is set. Values are never invented to fill the gaps.

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
| `npm run db:import:generate [-- --sim-now=2026-10-19THH:MM:00]` | Regenerate the dataset import from `data/source/` |
| `npm run fixture:ranking` | Regenerate `tests/fixtures/expected-ranking.json` (test fixture, not operational data) |
| `npm run db:seed:generate` | Regenerate the **legacy** local-demo seed (do not load into the shared project) |
