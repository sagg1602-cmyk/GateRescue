# GateRescue backend contract (v2)

For: frontend (Melanie). Owner: backend (Sebastian).
Status: foundation. The dashboard still runs on local synthetic state; these
endpoints are ready to be wired in when you choose. All data is synthetic.

- Types: `src/lib/shared/operational-types.ts` (the same shapes the dashboard
  already uses — `src/lib/demo/frontend-types.ts` now re-exports them).
- Request schemas + response types: `src/lib/shared/api-contract.ts`
  (client-safe; import the types instead of redeclaring them).

## Conventions

| Topic | Rule |
|---|---|
| Base path | Same origin as the app: `/api/...` |
| Format | JSON in, JSON out. Mutations require `Content-Type: application/json`. |
| Auth | HttpOnly session cookie from `POST /api/demo-session`. Browsers send it automatically on same-origin `fetch` — no headers to add. |
| Caching | All responses are `Cache-Control: no-store`. |
| Timestamps | ISO 8601 **with offset**, in the scenario time zone (America/Los_Angeles): `"2026-10-19T15:00:00-07:00"`. Requests must include an offset. Compare with `src/lib/shared/datetime.ts`; `formatTime()` (wall-clock `HH:MM`) still works. Only `report.receivedAt` is UTC (`…Z`). |
| Unknown values | `null`, and listed in the snapshot's `unknowns` with a reason. Never filled with defaults. |
| Synthetic estimates | Times in `recoveryQueue` use labelled synthetic estimates (`recoveryQueue.estimatesLabel`); show the label next to them. |
| Unknown body fields | Rejected with `400 invalid_request`. |

## Errors

Every error has this shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Request body failed validation",
    "fields": { "availableUntil": ["availableUntil must be after availableFrom"] }
  }
}
```

`fields` appears only on validation errors (keys are dotted paths).

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Body is not JSON or fails validation |
| 401 | `unauthenticated` | Missing, forged or expired session cookie |
| 401 | `invalid_access_code` | Wrong code on `POST /api/demo-session` |
| 403 | `forbidden_origin` | Mutation sent from another origin |
| 404 | `driver_not_found` | `driverId` does not exist |
| 415 | `unsupported_media_type` | Mutation without `Content-Type: application/json` |
| 503 | `backend_not_configured` | Server environment variables are missing |
| 503 | `dataset_incomplete` | `POST /api/driver-reports` only: the simulated clock is not set (run the scenario import). `GET /api/state` never returns this; it returns partial data. |
| 500 | `internal_error` | Anything else (details are logged server-side only) |

Suggested UI handling: on `401 unauthenticated`, show the access-code prompt;
on `503`, fall back to the local synthetic demo with a visible notice.

Dataset: the database holds the scenario owner's dataset plus the scenario
decisions in `docs/scenario-decisions.md` (ids `C01`, `D01`, `J01`, terminals
`term-a`/`term-b`/`term-c`). Examples below are real responses from a local
test run of that dataset.

---

## `POST /api/demo-session` — start a session

Exchanges the shared demo access code for an 8-hour session cookie
(`gr_demo_session`, HttpOnly, SameSite=Strict, Secure in production). The code
is provided out of band by the backend owner — never hard-code it.

Request:

```http
POST /api/demo-session
Content-Type: application/json

{ "accessCode": "<code entered by the dispatcher>" }
```

Response `200`:

```json
{ "authenticated": true, "expiresAt": "2026-10-18T06:50:40.806Z" }
```

Response `401`:

```json
{ "error": { "code": "invalid_access_code", "message": "Access code is incorrect" } }
```

## `GET /api/demo-session` — check the session

Never returns 401; use it on load to decide whether to show the prompt.

```json
{ "authenticated": false, "expiresAt": null }
```

## `DELETE /api/demo-session` — sign out

Response `200`:

```json
{ "authenticated": false, "expiresAt": null }
```

---

## `GET /api/state` — operational snapshot

Requires a session. Always `200` when authenticated: if data is missing, the
response is **partial** and every gap is listed in `unknowns`.

| Field | Type | Notes |
|---|---|---|
| `scenario` | `{ id, version, timeZone } \| null` | e.g. `terminal-a-outage` v1 |
| `now` | timestamp `\| null` | Simulated clock; `null` if not set |
| `inputsVersion` | `number \| null` | Increments on every operational input change |
| `terminals` | `Terminal[]` | `portalStatus` describes the scheduling system, not physical closure |
| `customers` | `Customer[]` | Ordered by `id`; contact fields included |
| `jobs` | `Job[]` | Ordered by `id`. `deadline` is the harm deadline. Includes `criticality`, `originalAssignedDriverId` (history), `containerAvailabilityAsOf`. |
| `drivers` | `Driver[]` | `availability` may be `"not-reported"`; `availableFrom`, `lastReport`, `location` may be `null`; `availableUntil` optional |
| `events` | `ActivityEvent[]` | Newest first, at most 200 |
| `plan` | `RecoveryPlan \| null` | Dashboard-style plan, if one was stored |
| `recoveryQueue` | `RecoveryQueue \| null` | Ranked recovery queue from the backend engine; `null` if the clock or scenario config is missing |
| `unknowns` | `UnknownValue[]` | `{ entity, id, field, reason }` for every unknown value |

`recoveryQueue.entries[]` (ranked: tier desc → harm deadline asc → job id):

| Field | Notes |
|---|---|
| `rank`, `jobId`, `criticalityTier`, `criticalityBasis`, `harmDeadline` | |
| `status` | `ready_for_approval` \| `awaiting_verification` \| `blocked` |
| `blocker` | e.g. `appointment_unverified`, `no_feasible_assignment`, `customs_hold`; `null` when ready |
| `owner`, `nextAction` | e.g. `dispatcher` / `call_terminal_to_reconfirm`, `wait_for_reefer_driver_report`, `dispatcher_approves` |
| `proposedDriverId`, `proposal` | Only when ready: `{ driverId, departAt, pickupAt, completeBy, travelMinutes }` |
| `originalAssignedDriverId` | Source assignment, kept as history |
| `checks[]` | `{ label, result: pass\|fail\|skip, detail }` for display |

Response `200` right after the scenario import (14:05, after the Terminal A
outage), shortened:

```json
{
  "scenario": { "id": "terminal-a-outage", "version": 1, "timeZone": "America/Los_Angeles" },
  "now": "2026-10-19T14:05:00-07:00",
  "inputsVersion": 1,
  "terminals": [
    { "id": "term-a", "shortName": "Terminal A", "name": "Terminal A", "portalStatus": "outage" }
  ],
  "customers": [
    { "id": "C01", "name": "Westbay Medical Supply", "customerType": "hospital_supplier", "contactName": "Dana Whitfield", "contactPhone": "555-0101", "city": "Long Beach, CA" }
  ],
  "jobs": [
    {
      "id": "J01",
      "container": "SYNU1000001",
      "customerId": "C01",
      "terminalId": "term-a",
      "priority": "critical",
      "deadline": "2026-10-20T08:00:00-07:00",
      "appointment": {
        "status": "unverified",
        "window": { "start": "2026-10-19T15:00:00-07:00", "end": "2026-10-19T16:00:00-07:00" },
        "preOutage": {
          "status": "confirmed",
          "window": { "start": "2026-10-19T15:00:00-07:00", "end": "2026-10-19T16:00:00-07:00" }
        }
      },
      "containerAvailable": true,
      "containerAvailabilityAsOf": "2026-10-19T14:00:00-07:00",
      "holds": [],
      "requiredEquipment": "chassis-40",
      "approval": null,
      "criticality": { "tier": 2, "basis": "third_party_verified", "statedBy": "Westbay Medical Supply" },
      "originalAssignedDriverId": null,
      "cargoDescription": "Ventilators",
      "lastFreeDay": "2026-10-21"
    }
  ],
  "drivers": [
    {
      "id": "D02",
      "name": "Aisha Johnson",
      "equipment": ["reefer-40"],
      "availability": "not-reported",
      "availableFrom": null,
      "availableUntil": null,
      "lastReport": null,
      "lastNote": "",
      "location": null,
      "busy": []
    }
  ],
  "events": [
    {
      "id": 4,
      "at": "2026-10-19T14:05:00-07:00",
      "kind": "terminal",
      "severity": "critical",
      "message": "Terminal A scheduling system outage (simulated): 7 confirmed appointments marked unverified; previous values preserved. Terminal not assumed physically closed."
    }
  ],
  "plan": null,
  "recoveryQueue": {
    "computedAt": "2026-10-19T14:05:00-07:00",
    "estimatesLabel": "Synthetic timing estimate: 15 min within an area, 30 min between areas, 120 min job reservation (pickup and delivery)",
    "entries": [
      {
        "rank": 1, "jobId": "J01", "criticalityTier": 2, "criticalityBasis": "third_party_verified",
        "harmDeadline": "2026-10-20T08:00:00-07:00",
        "status": "awaiting_verification", "blocker": "appointment_unverified",
        "owner": "dispatcher", "nextAction": "call_terminal_to_reconfirm",
        "proposedDriverId": null, "proposal": null, "originalAssignedDriverId": null,
        "checks": [{ "label": "Verified appointment in window", "result": "fail", "detail": "Appointment unverified" }]
      },
      {
        "rank": 2, "jobId": "J02", "criticalityTier": 1, "criticalityBasis": "self_declared",
        "harmDeadline": "2026-10-19T17:30:00-07:00",
        "status": "blocked", "blocker": "no_feasible_assignment",
        "owner": "dispatcher", "nextAction": "wait_for_reefer_driver_report",
        "proposedDriverId": null, "proposal": null, "originalAssignedDriverId": null,
        "checks": [{ "label": "Driver D02", "result": "fail", "detail": "driver_not_reported" }]
      }
    ],
    "reservations": [
      { "driverId": "D04", "jobId": "J18", "start": "2026-10-19T16:00:00-07:00", "end": "2026-10-19T18:00:00-07:00", "kind": "existing_assignment" }
    ]
  },
  "unknowns": [
    { "entity": "driver", "id": "D02", "field": "availableFrom", "reason": "Driver has not reported yet" },
    { "entity": "driver", "id": "D02", "field": "lastReport", "reason": "Driver has not reported yet" },
    { "entity": "driver", "id": "D02", "field": "location", "reason": "Driver has not reported yet" }
  ]
}
```

After D02's 14:10 report, entry 2 becomes:

```json
{
  "rank": 2, "jobId": "J02", "status": "ready_for_approval", "blocker": null,
  "owner": "dispatcher", "nextAction": "dispatcher_approves", "proposedDriverId": "D02",
  "proposal": {
    "driverId": "D02",
    "departAt": "2026-10-19T15:15:00-07:00",
    "pickupAt": "2026-10-19T15:30:00-07:00",
    "completeBy": "2026-10-19T17:30:00-07:00",
    "travelMinutes": 15
  }
}
```

---

## `POST /api/driver-reports` — record a driver report

Requires a session. The server records `source: "dispatcher"`; the body
cannot set `source`.

| Field | Type | Required | Rules |
|---|---|---|---|
| `driverId` | string | yes | e.g. `"D02"` |
| `availability` | `"available" \| "on-job" \| "off-duty" \| "unreachable"` | yes | `"not-reported"` is an initial state only |
| `availableFrom` | timestamp with offset | yes | Start of the availability window |
| `availableUntil` | timestamp with offset | no | Must be after `availableFrom` |
| `location` | string | no | ≤ 200 chars, e.g. `"Terminal B staging area"`; omitted keeps the previous location |
| `equipment` | `EquipmentType[]` | no | Replaces the driver's equipment when present |
| `note` | string | no | ≤ 500 chars, trimmed; empty keeps the previous note |
| `providerEventId` | string | yes | 8–200 chars of `A–Z a–z 0–9 . _ : -`. Generate once per submission (`crypto.randomUUID()`) and reuse it on retry. |
| `reportedAt` | timestamp with offset | no | When the driver gave the report. Defaults to server receipt time. |

What the server does, atomically:

1. Deduplicates on (`source`, `providerEventId`). A repeat returns the
   original report with `duplicate: true` and changes nothing.
2. Stores the report with provenance.
3. Moves the simulated clock to `reportedAt` if that is within 12 hours
   after the clock; otherwise it advances the clock one minute (e.g. for a
   real-time call on another day).
4. Updates the driver (`availability`, `availableFrom`, `availableUntil`,
   `location`, `equipment`, `lastReport`, `lastNote`), adds an activity
   event, increments `inputsVersion`, and invalidates a `current` plan.

Request (the scenario's D02 report, from
`data/scenario/terminal-a-outage.v1.json`):

```http
POST /api/driver-reports
Content-Type: application/json

{
  "driverId": "D02",
  "availability": "available",
  "availableFrom": "2026-10-19T15:00:00-07:00",
  "availableUntil": "2026-10-19T19:00:00-07:00",
  "location": "Terminal B staging area",
  "equipment": ["reefer-40"],
  "note": "At Terminal B staging area with reefer_40 equipment, available 15:00–19:00.",
  "providerEventId": "scenario-terminal-a-outage-v1-d02-1410",
  "reportedAt": "2026-10-19T14:10:00-07:00"
}
```

Response `201` (applied):

```json
{
  "duplicate": false,
  "report": {
    "id": "<uuid>",
    "driverId": "D02",
    "source": "dispatcher",
    "providerEventId": "scenario-terminal-a-outage-v1-d02-1410",
    "reportedAt": "2026-10-19T14:10:00-07:00",
    "receivedAt": "<server receipt instant, UTC, e.g. 2026-10-18T00:31:12.481Z>",
    "appliedAt": "2026-10-19T14:10:00-07:00",
    "availability": "available",
    "availableFrom": "2026-10-19T15:00:00-07:00",
    "availableUntil": "2026-10-19T19:00:00-07:00",
    "location": "Terminal B staging area",
    "equipment": ["reefer-40"],
    "note": "At Terminal B staging area with reefer_40 equipment, available 15:00–19:00."
  },
  "driver": {
    "id": "D02",
    "name": "Aisha Johnson",
    "equipment": ["reefer-40"],
    "availability": "available",
    "availableFrom": "2026-10-19T15:00:00-07:00",
    "availableUntil": "2026-10-19T19:00:00-07:00",
    "lastReport": "2026-10-19T14:10:00-07:00",
    "lastNote": "At Terminal B staging area with reefer_40 equipment, available 15:00–19:00.",
    "location": "Terminal B staging area",
    "busy": []
  },
  "inputsVersion": 2,
  "planInvalidated": false
}
```

Response `200` (same `providerEventId` again): same shape, `"duplicate": true`.

Response `400`:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Request body failed validation",
    "fields": {
      "availableFrom": ["Invalid ISO datetime", "Expected ISO 8601 date-time with offset, e.g. 2026-10-19T15:00:00-07:00"]
    }
  }
}
```

Other errors: `404 driver_not_found`; `503 dataset_incomplete` if the
simulated clock is not set.

After a successful report, refetch `GET /api/state` to get the updated
queue, activity log and plan status.

### Example client code

```ts
import type { DriverReportRequest, DriverReportResponse, ApiErrorResponse } from "@/lib/shared/api-contract";

async function submitCheckIn(input: Omit<DriverReportRequest, "providerEventId">) {
  const body: DriverReportRequest = { ...input, providerEventId: crypto.randomUUID() };
  const res = await fetch("/api/driver-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw (await res.json()) as ApiErrorResponse;
  return (await res.json()) as DriverReportResponse;
}
```

---

## Not in the backend yet

These still run only in the dashboard's local reducer and have no endpoints:
terminal outage / restore / reconciliation, appointment reconfirmation,
assignment approval, demo reset. (The Terminal A outage is applied by the
scenario import; the recovery queue is computed on every `GET /api/state`.) The database
schema already stores their state (`terminals.portal_status`,
`jobs.pre_outage_*`, `jobs.approval_*`, `recovery_plans`), so they can be added
without changing these shapes.

## Running the backend locally

Backend env vars are listed in `.env.example` (placeholders only). Ask the
backend owner for the demo access code; copy `.env.example` to `.env.local`
(git-ignored) and fill it in. Without these variables the dashboard still runs
on local synthetic data, and the API answers `503 backend_not_configured`.
