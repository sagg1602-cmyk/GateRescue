# Scenario dataset import

For: backend (Sebastian), scenario/data (Maelie), frontend (Melanie).

> **Status**
> - Tested **locally only**, against disposable Postgres 17 + PostgREST and
>   the real Next.js API. Tested:
>   - all three migrations, applied in order;
>   - the import, including the reset and the legacy-seed guard;
>   - `GET /api/state` and the D02 report. Both give 8/8 expected-ranking
>     rows before and after the report.
> - **Live Supabase import pending.** Run there so far: the operational-schema
>   migration only. Exact steps are below.
> - `GET /api/state` returns **partial data with explicit `unknowns`**. It no
>   longer fails on incomplete data: once imported, the only unknowns are
>   D02's fields until the 14:10 report. Driver reports return
>   `503 dataset_incomplete` only if the simulated clock was never set.

## Inputs

| File | Use |
|---|---|
| `data/source/gaterescue_customers.csv`, `…_drivers.csv`, `…_jobs.csv` | Imported. **Unchanged** originals from the scenario owner. |
| `data/source/gaterescue_expected_ranking.csv` | Test fixture only → `tests/fixtures/expected-ranking.json` |
| `data/source/gaterescue_schema.sql` | Reference only. **Do not run**: it redefines our tables. |
| `data/scenario/terminal-a-outage.v1.json` | Versioned scenario decisions that fill the gaps. See [scenario-decisions.md](scenario-decisions.md). |

## Pipeline

```
data/source/*.csv + data/scenario/*.json
   └─ src/lib/recovery/scenario-dataset.ts   (one mapping, shared with the tests)
        └─ npm run db:import:generate → supabase/import/authoritative_dataset.sql
data/source/gaterescue_expected_ranking.csv ─ npm run fixture:ranking → tests/fixtures/expected-ranking.json
```

The import **resets** the scenario to 14:05, after the Terminal A
scheduling outage:
- it clears driver reports, plans, activity and busy slots, then inserts the
  dataset;
- it aborts without changes if the database holds rows from another dataset
  (e.g. the legacy 20-job `supabase/seed.sql`, which must not be loaded).

D02's 14:10 report is not imported. Send it through
`POST /api/driver-reports`; the exact body is in the scenario config.

## Run in Supabase (SQL Editor, in order)

1. `supabase/migrations/20261019000000_authoritative_dataset_fields.sql`
2. `supabase/migrations/20261019120000_scenario_v1_timestamps_and_reports.sql`
3. `supabase/import/authoritative_dataset.sql`

(`20261017000000_operational_schema.sql` was already run.) Run each file's
entire contents. Step 2 requires `driver_reports` to be empty, which it is
on a fresh project; it stops with a clear message otherwise. Step 3 can be
re-run at any time to reset the demo.

## Field mapping

Timestamps keep their `-07:00` offset and are stored as `timestamptz`; the
API returns them in America/Los_Angeles time.

### customers
`customer_id→id`, `name`, `customer_type`, `contact_name`, `contact_phone`,
`city`, `data_origin` (direct).

### drivers

| CSV | Stored | Notes |
|---|---|---|
| `driver_id`, `name`, `phone` | same | |
| `equipment` | `equipment[]` + `source_equipment` | `dry_20→chassis-20`, `dry_40→chassis-40`, `reefer_40→reefer-40` (`reefer_20`/`unknown` would fail the import) |
| `status_at_start` | `availability` + `source_status` | `available→available`, `busy→on-job`, `not_reported→not-reported` |
| `available_from` | `available_from` | Kept from the CSV (decision 4); `null` for D02 |
| `location_at_start` | `location` | `null` for D02 (decision 5) |
| `checked_in` | `checked_in` | |
| — | `last_report` | 13:55 for D01/D03/D04/D05 (decision 4); `null` for D02 |

### jobs

| CSV | Stored | Notes |
|---|---|---|
| `job_id`, `customer_id`, `container_id` | `id`, `customer_id`, `container` | |
| `container_type` | `required_equipment` + `source_container_type` | Same equipment mapping |
| `terminal` | `terminal_id` + `source_terminal` | `Terminal A/B/C → term-a/b/c`; terminal rows are derived from these values |
| `appointment_*` | `appointment_*` | Terminal A becomes `unverified` with `pre_outage_*` preserved (decision 2) |
| `assigned_driver_id` | `assigned_driver_id` | Original assignment; the engine reserves or keeps it as history (decision 7) |
| `criticality_tier`, `criticality_basis`, `criticality_stated_by` | same + `priority` label | Ranking uses the tier (decision 8) |
| `harm_deadline` | `deadline` | Full timestamp; spans Oct 19–26 |
| `hold_type` | `holds[]` | |
| `cargo_description`, `last_free_day`, `data_origin` | same | |
| — | `container_available`, `container_status_as_of` | `true` as of 14:00 (decision 3) |

## Remaining contradictions

See [scenario-decisions.md](scenario-decisions.md#remaining-contradictions-in-the-dataset):
- reservations overlap CSV availability for D01, D03 and D05;
- held containers are still assigned (J07, J12);
- there's no lifecycle status for jobs whose windows ended before 14:00;
- J02 has zero slack.
