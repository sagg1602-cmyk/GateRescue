# GateRescue backend contract (v1)

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
| Simulated times (`IsoLocal`) | `"2026-10-17T07:30:00"` — no timezone, same as the dashboard today. `formatTime()` works unchanged. |
| Real-world instants (`IsoInstant`) | `"2026-10-17T21:02:11.000Z"` — only on driver-report provenance (`reportedAt`, `receivedAt`). |
| Unknown body fields | Rejected with `400 invalid_request`. |

## Errors

Every error has this shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Request body failed validation",
    "fields": { "availableFrom": ["Expected 24-hour HH:MM"] }
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
| 503 | `dataset_incomplete` | The loaded dataset lacks values the types require; `message` lists them (see `docs/dataset-import.md`) |
| 500 | `internal_error` | Anything else (details are logged server-side only) |

Suggested UI handling: on `401 unauthenticated`, show the access-code prompt;
on `503`, fall back to the local synthetic demo with a visible notice.

Dataset note: the database is being loaded with the scenario owner's dataset
(ids `C01`, `D01`, `J01`, terminals `term-a`/`term-b`/`term-c`), not the
frontend's built-in synthetic data. The example values below come from the
earlier synthetic dataset; field shapes are identical.

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

Requires a session. Returns `OperationalSnapshot` — the same fields as the
dashboard's `DemoState`, minus its internal counters (`nextEventId`,
`nextPlanId`), plus `customers`.

| Field | Type | Notes |
|---|---|---|
| `now` | `IsoLocal` | Simulated clock |
| `inputsVersion` | `number` | Increments on every operational input change |
| `terminals` | `Terminal[]` | |
| `customers` | `Customer[]` | Ordered by `id` |
| `jobs` | `Job[]` | Ordered by `id` (`job-01` … `job-20`) |
| `drivers` | `Driver[]` | Ordered by `id`, `busy` slots included |
| `events` | `ActivityEvent[]` | Newest first, at most 200 |
| `plan` | `RecoveryPlan \| null` | Most recent plan; check `plan.status` |

Response `200` (arrays shortened; values are from a test run against the
seeded database after one driver report):

```json
{
  "now": "2026-10-17T06:31:00",
  "inputsVersion": 2,
  "terminals": [
    { "id": "term-a", "shortName": "Terminal A", "name": "Harborview Container Yard (fictional)", "portalStatus": "online" }
  ],
  "customers": [
    { "id": "cust-cobalt", "name": "Cobalt Home Goods" }
  ],
  "jobs": [
    {
      "id": "job-01",
      "container": "SYNU1000011",
      "customerId": "cust-northwind",
      "terminalId": "term-a",
      "priority": "critical",
      "deadline": "2026-10-17T10:00:00",
      "appointment": {
        "status": "confirmed",
        "window": { "start": "2026-10-17T07:30:00", "end": "2026-10-17T08:30:00" },
        "preOutage": null
      },
      "containerAvailable": true,
      "holds": [],
      "requiredEquipment": "chassis-40",
      "approval": null
    }
  ],
  "drivers": [
    {
      "id": "drv-2",
      "name": "Theo Okafor",
      "equipment": ["reefer-40", "chassis-40"],
      "availability": "on-job",
      "availableFrom": "2026-10-17T08:30:00",
      "lastReport": "2026-10-17T06:05:00",
      "lastNote": "Finishing an outbound reefer delivery.",
      "busy": [{ "start": "2026-10-17T06:00:00", "end": "2026-10-17T08:30:00", "label": "Pre-existing delivery" }]
    }
  ],
  "events": [
    {
      "id": 6,
      "at": "2026-10-17T06:31:00",
      "kind": "plan",
      "severity": "warning",
      "message": "Pending recommendations invalidated (1 unapproved): Ana Lucía Torres check-in. Regenerate the plan."
    },
    {
      "id": 5,
      "at": "2026-10-17T06:31:00",
      "kind": "driver",
      "severity": "success",
      "message": "Ana Lucía Torres checked in: available, free from 07:00. “Back online at yard”"
    }
  ],
  "plan": {
    "id": 1,
    "generatedAt": "2026-10-17T06:31:00",
    "inputsVersion": 1,
    "status": "invalidated",
    "invalidatedReason": "Ana Lucía Torres check-in",
    "recommendations": []
  }
}
```

---

## `POST /api/driver-reports` — record a driver check-in

Requires a session. Same inputs as the dashboard's check-in form
(`CheckInInput`), plus an idempotency key. The server records
`source: "dispatcher"`; the body cannot set `source`.

| Field | Type | Required | Rules |
|---|---|---|---|
| `driverId` | string | yes | e.g. `"drv-5"` |
| `availability` | `"available" \| "on-job" \| "off-duty" \| "unreachable"` | yes | |
| `availableFrom` | string | yes | 24-hour `"HH:MM"` on the simulated day |
| `note` | string | no | ≤ 500 chars, trimmed; empty keeps the previous note |
| `providerEventId` | string | yes | 8–200 chars of `A–Z a–z 0–9 . _ : -`. Generate once per submission with `crypto.randomUUID()` and reuse it on retry. |
| `reportedAt` | ISO 8601 with offset | no | When the driver gave the report. Defaults to server receipt time. |

What the server does, atomically:

1. Deduplicates on (`source`, `providerEventId`). A repeat returns the
   original report with `duplicate: true` and changes nothing; the repeated
   payload is ignored.
2. Stores the report with provenance (`source`, `providerEventId`,
   `reportedAt`, `receivedAt`, applied simulated time).
3. Advances the simulated clock one minute, updates the driver's
   `availability`, `availableFrom`, `lastReport`, `lastNote`.
4. Adds a `driver` activity event and increments `inputsVersion`.
5. If a plan is `current`, sets it to `invalidated` (reason
   `"<driver name> check-in"`) and logs a `plan` warning event — the same
   behavior as the local reducer.

Request:

```http
POST /api/driver-reports
Content-Type: application/json

{
  "driverId": "drv-5",
  "availability": "available",
  "availableFrom": "07:00",
  "note": "Back online at yard",
  "providerEventId": "9b2f6c1e-4d1a-4a8e-9a63-1f2d3c4b5a69",
  "reportedAt": "2026-10-17T14:02:11-07:00"
}
```

Response `201` (applied):

```json
{
  "duplicate": false,
  "report": {
    "id": "3557cc88-e401-4ba3-8056-cb101c1e2b9c",
    "driverId": "drv-5",
    "source": "dispatcher",
    "providerEventId": "9b2f6c1e-4d1a-4a8e-9a63-1f2d3c4b5a69",
    "reportedAt": "2026-10-17T21:02:11.000Z",
    "receivedAt": "2026-10-17T22:50:40.906Z",
    "appliedAt": "2026-10-17T06:31:00",
    "availability": "available",
    "availableFrom": "07:00",
    "note": "Back online at yard"
  },
  "driver": {
    "id": "drv-5",
    "name": "Ana Lucía Torres",
    "equipment": ["chassis-40", "reefer-40"],
    "availability": "available",
    "availableFrom": "2026-10-17T07:00:00",
    "lastReport": "2026-10-17T06:31:00",
    "lastNote": "Back online at yard",
    "busy": []
  },
  "inputsVersion": 2,
  "planInvalidated": true
}
```

Response `200` (same `providerEventId` sent again): identical body with
`"duplicate": true` and `"planInvalidated": false`.

Response `400`:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Request body failed validation",
    "fields": {
      "availability": ["Invalid option: expected one of \"available\"|\"on-job\"|\"off-duty\"|\"unreachable\""],
      "availableFrom": ["Expected 24-hour HH:MM"],
      "providerEventId": ["Too small: expected string to have >=8 characters"],
      "_": ["Unrecognized key: \"source\""]
    }
  }
}
```

Response `404`:

```json
{ "error": { "code": "driver_not_found", "message": "No driver with id \"drv-99\"" } }
```

After a successful report, refetch `GET /api/state` (or merge `driver` and
`inputsVersion` locally) so the activity log and plan status update.

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
recovery plan generation, assignment approval, demo reset. The database
schema already stores their state (`terminals.portal_status`,
`jobs.pre_outage_*`, `jobs.approval_*`, `recovery_plans`), so they can be added
without changing these shapes.

## Running the backend locally

Backend env vars are listed in `.env.example` (placeholders only). Ask the
backend owner for the demo access code; copy `.env.example` to `.env.local`
(git-ignored) and fill it in. Without these variables the dashboard still runs
on local synthetic data, and the API answers `503 backend_not_configured`.
