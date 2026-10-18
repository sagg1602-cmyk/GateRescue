# Shared-file changes for the frontend

For: Melanie. From: backend (branch `backend/foundation`).

Per AGENTS.md ("do not change the types file or schema without telling the
team"), this lists every change on this branch to shared files or frontend
files, why, and what to check when merging. The dashboard's behaviour on its
built-in demo data is unchanged; I re-ran the local reducer walkthrough
(outage → check-ins → plan → approval → restore → reconciliation → reset)
and got the same results as before.

## 1. Timestamps carry an offset (date handling fix)

**Why.** `toMinutes()` sliced `HH:MM` and ignored the date. The scenario's
harm deadlines span Oct 19–26, so `2026-10-20T08:00` sorted as 08:00 on the
19th.

| File | Change |
|---|---|
| `src/lib/shared/datetime.ts` (new) | Offset-aware parse, compare, add, format and time-zone conversion. No dependence on the runtime time zone. |
| `src/lib/demo/time.ts` | Same exports and signatures, now delegating to `datetime.ts`. `toMinutes()` returns **absolute** minutes; use it only for comparisons and differences (all current callers do). `formatTime()` still shows wall-clock `HH:MM`. |
| `src/lib/demo/synthetic-data.ts` | Demo timestamps now end in `-07:00` (`t()`, `DEMO_DAY`, `DEMO_START_TIME`). Values are otherwise identical. |
| `src/lib/demo/recovery-heuristic.ts` | The `9999` "no appointment" sentinel was replaced by `Number.MAX_SAFE_INTEGER`, since absolute minutes are far larger than 9999. |

Rule going forward: **every timestamp must include an offset**.
`parseIsoDateTime()` throws on timezone-free strings, so they fail loudly.

## 2. Shared types (`src/lib/shared/operational-types.ts`)

| Change | Frontend impact |
|---|---|
| `DriverAvailability` gains `"not-reported"` | `AVAILABILITY_LABEL` in `DriverPanel.tsx` gained a "Not reported" (amber) entry. The check-in form lists it automatically. |
| `Driver.availableFrom` / `Driver.lastReport` → `string \| null` | `DriverPanel.tsx` shows "No report yet" and hides "free from" when null. `DriverCheckInForm.tsx` leaves the time field empty when null. `recovery-heuristic.ts` treats null `availableFrom` as never available. |
| New optional `Driver.availableUntil`, `Driver.location` | None (optional) |
| `Job.containerAvailable` → `boolean \| null` | None: existing `!job.containerAvailable` checks treat unknown as not available |
| New optional `Job.criticality` (`tier`, `basis`, `statedBy`), `originalAssignedDriverId`, `containerAvailabilityAsOf`, `cargoDescription`, `lastFreeDay`; optional `Customer` contact fields | None (optional) |
| `TerminalId` gains `"term-c"` | None |
| `IsoLocal` kept as a deprecated alias of `IsoDateTime` | None |
| New `RecoveryQueue` / `RecoveryQueueEntry` with team statuses `ready_for_approval` / `awaiting_verification` / `blocked` | None yet. The dashboard's own `Recommendation` (`ready` / `awaiting-verification`) is unchanged. Mapping: `ready` ↔ `ready_for_approval`, `awaiting-verification` ↔ `awaiting_verification`. |
| `OperationalSnapshot` gains `scenario`, `recoveryQueue`, `unknowns`; `now` / `inputsVersion` may be null | Only matters once the dashboard reads `GET /api/state` |

## 3. Config

`tsconfig.json`: `"allowImportingTsExtensions": true` (valid because
`noEmit` is already true). It lets `src/lib/recovery/*` and the tests import
with `.ts` extensions, so `npm test` runs on Node's built-in test runner with
no new dependencies.

## Merging with `main`

`main` has your reconciliation view (PR #1). It uses `formatTime`,
`sortJobsForPlanning`, `OUTAGE_TERMINAL_ID`, `getJobStatus` and
`containerAvailable` checks, and all of them keep their signatures here. No
files overlap. After merging, run `npm run build`: any new code that passes
`driver.availableFrom` or `driver.lastReport` straight into `formatTime()`
needs a null check.

## Using the backend recovery queue (optional, when you're ready)

`GET /api/state` → `recoveryQueue.entries[]` is already ranked and carries,
per job, `status`, `blocker`, `owner`, `nextAction`, `proposedDriverId`, and
`proposal` (depart / pickup / complete times). It also has `checks[]` with
human-readable details and an `estimatesLabel` to show beside any times.
See [backend-contract.md](backend-contract.md).
