# Scenario decisions — `terminal-a-outage` v1

For: the whole team (Maelie for scenario/pitch, Melanie for the dashboard,
Sebastian for backend). All data is **synthetic and fictional**.

Maelie's CSVs in `data/source/` are kept **unchanged**. The decisions below
fill gaps in them; they live in the versioned configuration
[`data/scenario/terminal-a-outage.v1.json`](../data/scenario/terminal-a-outage.v1.json)
and were authorized by the team on 2026-10-17. Any change means a new
`version` (and a new file), never an in-place edit.

## Decisions

| # | Decision | Where it is applied |
|---|---|---|
| 1 | **Start** 2026-10-19 14:00 −07:00, time zone America/Los_Angeles. All timestamps keep their offset. | `start`, `timeZone` |
| 2 | **Terminal A scheduling outage at 14:05.** Its confirmed appointments become `unverified`; previous values are preserved in `preOutage`. The terminal is **not** assumed physically closed. | Import (state after 14:05) |
| 3 | **Container tracking snapshot at 14:00:** all 20 containers available (synthetic). Existing holds (J07 customs, J12 freight) remain blocking. | `jobs.container_available`, `container_status_as_of` |
| 4 | **D01, D03, D04, D05 last reported at 13:55**; their CSV `available_from` times are kept. | `drivers.last_report` |
| 5 | **D02 starts `not-reported`:** availability, location, available-from and last-report time are unknown (`null`, listed in `unknowns`). | New `not-reported` availability |
| 6 | **D02 reports at 14:10:** at Terminal B staging area, reefer_40 equipment, available 15:00–19:00. Sent through `POST /api/driver-reports` (the exact body is in the config), not imported. | `events[1].request` |
| 7 | **Recovery scope:** Terminal A outage-affected jobs plus unassigned jobs (J01, J02). Existing assignments **outside** the scope are preserved and reserve the driver; original assignments **inside** the scope are kept as history only. | `recovery.scope`, `existingAssignments` |
| 8 | **Ranking:** numeric criticality tier descending → full harm-deadline timestamp ascending → job id. Criticality basis is kept separately. | `recovery.ranking` |
| 9 | **Synthetic timing estimates** (labelled as such in API output): 15 min travel within an area, 30 min between areas, 2 h job reservation including pickup and delivery. "Terminal B staging area" is part of the Terminal B area. | `recovery.timingEstimates`, `locationAreas` |

## How the engine applies them

`src/lib/recovery/engine.ts` (pure, deterministic), exposed as
`recoveryQueue` in `GET /api/state`:

1. **Scope** per decision 7. Dispatcher-approved jobs are excluded.
2. **Mandatory constraints** for every scoped job: no blocking hold →
   container available → terminal open → verified appointment. An
   unverified appointment alone gives `awaiting_verification`
   (`call_terminal_to_reconfirm`); any other failure gives `blocked`. Jobs
   failing a constraint get no driver. AGENTS.md says "drop jobs failing
   mandatory constraints"; we read that as dropping them from assignment, not
   from the queue, because the expected ranking lists them.
3. **Feasibility** (`feasibility.ts`) for jobs passing all constraints:
   depart no earlier than now or `availableFrom`; travel per decision 9;
   pickup inside the appointment window; completion = pickup + 2 h, no later
   than the harm deadline or `availableUntil`; and no overlap with the
   driver's reservations. If the first pickup conflicts, later pickups after
   each reservation ends are tried.
4. **Assignment** in rank order. The feasible driver with the earliest pickup
   wins (then shortest travel, then driver id), and that time is reserved
   before the next job.
5. **No feasible driver** gives `blocked` / `no_feasible_assignment`. The
   next action is `wait_for_<reefer|dry>_driver_report` if a compatible
   driver has not reported yet.

Existing assignments reserve `[appointment start, +2 h)`. Travel before
them is not modelled, because their origin is unknown.

## Expected ranking: verified

`tests/fixtures/expected-ranking.json` (generated from the unchanged CSV;
the test checks its checksum) is compared in two places:

- `npm test`: the engine on the imported dataset, at 14:05 (before) and
  after applying D02's report at 14:10.
- Locally against disposable Postgres + PostgREST through the real API:
  migrations → import → `GET /api/state` → `POST /api/driver-reports` with the
  config's D02 body → `GET /api/state`.

Both runs give **8/8 rows matching, in the expected order, before and after**
the report. That covers status, blocker, proposed driver, next action,
owner, tier and harm deadline. After the report, J02 → D02: depart 15:15,
pickup 15:30, complete 17:30.

## Remaining contradictions in the dataset

None of these affects the expected ranking, but each is visible in the data:

1. **Reservations overlap CSV availability.** Under the 2 h reservation
   estimate, three existing assignments end after the driver's CSV
   `available_from`:
   - D01: J14 13:00–15:00 vs available 14:30
   - D03: J07 11:30–13:30 vs available 13:00
   - D05: J12 09:30–11:30 vs available 11:00

   The CSV times suggest about 1.5 h per job. Both are kept. A driver must
   satisfy both, so D01 is effectively free from 15:00.
2. **Held containers are assigned and reserved.** J07 (customs, D03) and J12
   (freight, D05) cannot be picked up, yet decision 7 reserves their
   drivers.
3. **No job lifecycle status.** Eight jobs' appointment windows ended before
   14:00 (J06, J07, J08, J10, J12, J13, J14, J20). The data does not say
   whether they were completed. They are outside the scope and reserve
   nothing that matters after 14:00.
4. **J02 has zero slack.** Harm deadline 17:30 = appointment end 17:30. With
   a 2 h reservation, J02 is only feasible if pickup happens exactly at the
   window start (15:30) and the deadline is inclusive. A later D02
   availability, or a longer reservation, would make it infeasible.
5. **CSV appointment status vs fixture.** `jobs.csv` lists every appointment
   as `confirmed`; the fixture's "before" state has Terminal A unverified.
   This is resolved by decision 2, not by editing either file.

## Still provisional

- **Priority label.** Criticality tier maps to the dashboard's `priority`
  label (3/2 → critical, 1 → high, 0 → normal). Ranking uses the numeric
  tier, not this label.
- **Terminal names.** They are just "Terminal A/B/C"; the dataset supplies
  no longer names.
