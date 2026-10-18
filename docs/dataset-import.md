# Authoritative dataset import

For: backend (Sebastian), scenario/data (Maelie), frontend (Melanie).

> **Status**
> - Tested **locally only** (disposable Postgres 17 + PostgREST): both
>   migrations, the import (including re-runs and the old-seed guard), and
>   the API on the imported data.
> - **Live Supabase import pending.** Run there so far: the operational-schema
>   migration only. Still to run: `20261019000000_authoritative_dataset_fields.sql`,
>   then `supabase/import/authoritative_dataset.sql`.
> - Missing scenario fields (open items 1–3 below) make **`GET /api/state`
>   return `503 dataset_incomplete`** with the list of missing values; driver
>   reports return the same error until the simulated start time is set.

The scenario owner's CSVs replace the old 20-job seed (`supabase/seed.sql`,
which must **not** be loaded). Originals live unchanged in `data/source/`:

| File | Rows | Use |
|---|---|---|
| `gaterescue_customers.csv` | 3 | Imported |
| `gaterescue_drivers.csv` | 5 | Imported |
| `gaterescue_jobs.csv` | 20 | Imported (+ 3 terminals derived from `terminal`) |
| `gaterescue_expected_ranking.csv` | 8 | Test fixture only → `tests/fixtures/expected-ranking.json` |
| `gaterescue_schema.sql` | — | Reference only. **Do not run** against our database: it redefines `customers`/`drivers`/`jobs` with different columns, and `create table if not exists` would silently skip them. |

## Pipeline

```
data/source/*.csv ──npm run db:import:generate──▶ supabase/import/authoritative_dataset.sql
data/source/gaterescue_expected_ranking.csv ──npm run fixture:ranking──▶ tests/fixtures/expected-ranking.json
```

Database order: `20261017000000_operational_schema.sql` (done) →
`20261019000000_authoritative_dataset_fields.sql` → `authoritative_dataset.sql`.

The import upserts by id (safe to re-run), keeps every original value in a
`source_*` or dedicated column, writes `NULL` where the CSVs supply nothing,
and aborts without changes if the database contains rows from another
dataset (e.g. the old seed). Re-running resets terminal portal status to
`online`.

## Field mapping

All timestamps carry `-07:00`; they are stored as Pacific wall-clock time
(`2026-10-19T15:00:00-07:00` → `2026-10-19T15:00:00`). The importer rejects
any other offset.

### customers → `customers`
`customer_id→id`, `name`, `customer_type`, `contact_name`, `contact_phone`,
`city`, `data_origin` — all direct (last five are new columns).

### drivers → `drivers`

| CSV | DB | Notes |
|---|---|---|
| `driver_id` | `id` | |
| `name`, `phone` | `name`, `phone` | |
| `equipment` | `equipment` (array) + `source_equipment` | `dry_20→chassis-20`, `dry_40→chassis-40`, `reefer_40→reefer-40`. No `reefer_20`/`unknown` in this data; the importer fails if they appear. |
| `status_at_start` | `availability` + `source_status` | `available→available`, `busy→on-job`, **`not_reported→unreachable` (provisional)** |
| `available_from` | `available_from` | Empty for D02 → `NULL` |
| `location_at_start` | `location` | |
| `checked_in` | `checked_in` | |
| — | `last_report` | **Not supplied → `NULL`** |

### jobs → `jobs` (+ `terminals`)

| CSV | DB | Notes |
|---|---|---|
| `job_id`, `customer_id` | `id`, `customer_id` | |
| `container_id` | `container` | |
| `cargo_description` | `cargo_description` | |
| `container_type` | `required_equipment` + `source_container_type` | Same mapping as driver equipment |
| `terminal` | `terminal_id` + `source_terminal` | `Terminal A/B/C → term-a/b/c`. Terminal rows are created from these values; the data has no longer terminal name, so `name` = `Terminal X`. |
| `appointment_start/end` | `appointment_start/end` | |
| `appointment_status` | `appointment_status` | All `confirmed` |
| `assigned_driver_id` | `assigned_driver_id` | Kept as a pre-existing assignment, **not** mapped to a dispatcher approval |
| `criticality_tier` | `criticality_tier` + `priority` | **Provisional:** `3,2→critical`, `1→high`, `0→normal` |
| `criticality_basis`, `criticality_stated_by` | same | |
| `harm_deadline` | `deadline` | Spans 2026-10-19 → 2026-10-26 |
| `hold_type` | `holds` | `none→[]`, `customs→[customs]`, `freight→[freight]` |
| `last_free_day` | `last_free_day` | |
| — | `container_available` | **Not supplied → `NULL`** |

## Open items (owners)

Until 1–3 are resolved, `GET /api/state` answers
`503 dataset_incomplete` listing the missing values (it never invents them).
Driver reports work once the simulated clock (item 1) is set.

1. **Scenario start time** (Maelie). Needed for the simulated clock
   (`demo_state.sim_now`). Then: `npm run db:import:generate -- --sim-now=2026-10-19THH:MM:00`.
2. **Container availability** (Maelie). The CSVs have no per-job
   availability, but the recovery checks require it. Either a column in
   `jobs.csv` or confirmation that all 20 containers are available.
3. **Last report times** (Maelie + Melanie). `checked_in` is a yes/no flag;
   the dashboard shows a last-report time. Either times in `drivers.csv`,
   or the shared `Driver.lastReport` / `Driver.availableFrom` types become
   nullable (frontend change) so "never reported" can be shown honestly.
   D02's `available_from` is genuinely unknown until the call.
4. **`not_reported` status** (Maelie + Melanie). Mapped to `unreachable`
   provisionally; a distinct `not-reported` availability would need a
   frontend label.
5. **Criticality → priority** (Maelie). Confirm the tier mapping, or switch
   the planner to rank by `criticality_tier` directly (the fixture ranks by
   tier desc → harm deadline asc → job id).
6. **Driver call payload** (Maelie). The fixture says D02 becomes the
   proposed driver for J02 after the call, but not what D02 reports
   (availability, free-from time). Needed to script the Retell call.
7. **Assignment semantics** (Maelie + Melanie). 18 of 20 jobs have an
   `assigned_driver_id`. The fixture leaves assigned, unaffected jobs out of
   the ranking and proposes no driver for awaiting-verification jobs; the
   current planner plans every unapproved job and proposes tentative drivers.
   The shared `Job` type needs an `assignedDriverId` field and the planner a
   rule for it.

## Fixture comparison (current planner)

Run locally with the current `recovery-heuristic.ts`, under stated test
assumptions (Terminal A outage applied, containers available, D02 reports
"available from 15:00", clock at 00:00):

- Status and proposed driver: **8/8 match** before the call and **8/8**
  after (J02 → `ready` with D02).
- Order: `J01 J04 J02 J09 J15 J17 J11 J03` vs expected
  `J01 J02 J09 J04 J15 J11 J17 J03`.
  - J04 ranks too high: `time.ts`'s `toMinutes()` ignores the date, so the
    deadline `2026-10-20T08:00` sorts as 08:00 on the same day. Multi-day
    deadlines need a date-aware comparison (frontend, `src/lib/demo/time.ts`).
  - J11/J17 tie on deadline; the planner breaks ties by appointment start,
    the fixture by job id.
- Also proposes for 12 assigned, unranked jobs (item 7).
