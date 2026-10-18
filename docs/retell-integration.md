# Retell driver-report intake

For: backend/Vercel (Sebastian); FYI dashboard (Melanie), scenario/pitch (Maelie).

A Retell voice agent talks to a driver and calls the custom function
`submit_driver_report`, which posts to `POST /api/retell/driver-report`. The
report goes through the same driver-report service as dispatcher check-ins,
with `source: "retell"`. Per AGENTS.md, **a voice report never dispatches
anything**: it only updates the driver's status, and a dispatcher approves
every assignment.

Status: implemented and tested locally (unit tests plus an end-to-end run
with requests signed by the official retell-sdk code). **Not yet tested with
a real Retell call.** That needs a deployed URL; see "Real test call" below.

## Demo setup: post-call webhook is the single writer

For the demo, reports are written **only** by the post-call webhook
`POST /api/retell` (Retell `call_analyzed` event + Post Call Extraction).
Do **not** add the `submit_driver_report` custom function to the demo
agent. That path stays implemented (section below) but is not configured.
If both are ever enabled, the database still applies at most one Retell
report per call (`driver_reports_one_per_call`), so the second path becomes
a duplicate.

### Before deploying: run in Supabase (SQL Editor)

`supabase/migrations/20261020000000_retell_one_report_per_call.sql`, the
whole file. It adds `provider_call_id` and the one-report-per-call guard,
and updates `apply_driver_report()`. Deploy the code **after** running it:
the new code calls the updated function.

### Webhook (Retell agent → Webhook settings)

- URL: `https://<production-domain>/api/retell`. The domain is on the Vercel
  project's Overview page; production deploys from `main`.
- Events: `call_analyzed` is the one that writes. `call_started` and
  `call_ended` are accepted and ignored.
- Signing: Retell signs every webhook with the API key that has the webhook
  badge. Set that key as `RETELL_API_KEY` in Vercel. Unsigned or wrongly
  signed requests get `401`.
- The production domain must be publicly reachable (Vercel → Settings →
  Deployment Protection must not cover production).

### Who the driver is

The route trusts only call-level configuration:
`retell_llm_dynamic_variables.driver_id`, else `metadata.driver_id`. For the
D02 test call, set the dynamic variable `driver_id = D02` (and
`driver_name = Aisha Johnson` for the prompt). The extracted `driver_name` is
never used to pick the driver; a mismatch is only logged
(`name_mismatch: true`).

### Post Call Extraction fields (Retell agent → Post call extraction)

The names must match exactly:

| Name | Type | Description to paste | Choices |
|---|---|---|---|
| `driver_name` | Text | Name the driver gave on the call. | — |
| `available` | Boolean | True if the driver says they can take a new load today; false if not. Leave empty if unclear. | — |
| `available_from` | Text | Time the driver becomes available, 24-hour HH:MM local time, e.g. 15:00. Leave empty if not stated or unclear. | — |
| `available_until` | Text | Time the driver's availability ends, 24-hour HH:MM local time, e.g. 19:00. Leave empty if not stated. | — |
| `location_type` | Selector | Where the driver is now. | `terminal` (or `terminal_yard`), `staging_area`, `other`, `unknown` |
| `terminal_name` | Selector | Which terminal the driver is at or near. | `Terminal A`, `Terminal B`, `Terminal C`, `none` |
| `equipment` | Selector | Container equipment the driver has. | `dry_20`, `dry_40`, `reefer_40`, `unknown` |
| `appointment_outcome` | Text | Anything said about the terminal appointment, one short phrase. | — |
| `notes` | Text | Anything else relevant, one sentence. | — |

Mapping rules:
- A report is written only when `available` is true and `available_from` is
  an unambiguous time: `15:00`, `09:30`, `3 pm` or `3:30 pm`. Single-digit
  times without am/pm, like `3:00`, are ambiguous.
- Times are placed on the configured scenario date (2026-10-19) in
  America/Los_Angeles.
- A missing or ambiguous `available_until`, location or equipment stays
  unknown; the report still saves.
- `available = false` writes nothing: these fields can't distinguish on-job
  from off-duty or give a return time. Add a selector field later if needed.
- `staging_area` plus `Terminal B` becomes the location "Terminal B staging
  area", which the recovery engine places in the Terminal B area.
  `terminal` or `terminal_yard` plus `Terminal B` becomes "Terminal B".
  Other location types stay unknown.
- `notes` and `appointment_outcome` go into the report note.

### Responses and logs

- The report is saved (committed) **before** the 200 response; there is no
  background work. Retell's timeout is 10 s with up to 3 retries.
- Outcomes:
  - `200 {ok, outcome}`, where outcome is `recorded`, `duplicate`,
    `ignored`, `incomplete`, `driver_not_identified` or `driver_not_found`;
  - `401` bad signature; `400` malformed; `503`/`500` retryable.
- Logs are one JSON line per webhook: event, `call_id`, driver id, outcome,
  report id, unknown field names, and the names (not values) of the analysis
  fields received. Transcripts and answers are not logged.

### Test call (with Maélie)

1. Reset the scenario: run `supabase/import/authoritative_dataset.sql`.
2. Start the test call with dynamic variable `driver_id = D02`. Answer:
   available, 15:00 until 19:00, Terminal B staging area, reefer 40.
3. After the call, Vercel → Logs: look for
   `{"route":"POST /api/retell","event":"call_analyzed",…,"outcome":"recorded"}`.
   If the outcome is `incomplete`, its `unknown` list names the fields to
   fix in the extraction setup.
4. `GET /api/state`: D02 is available 15:00–19:00 at Terminal B staging
   area, and J02 is `ready_for_approval` with D02.

---

## Custom-function path (implemented, not configured for the demo)

## How it works

| Concern | Behaviour |
|---|---|
| Authentication | `X-Retell-Signature: v=<ms>,d=<hex>` = HMAC-SHA256(raw body + timestamp, `RETELL_API_KEY`), within ±5 min. Mirrors `Retell.verify` ([docs](https://docs.retellai.com/features/secure-webhook)). Anything else → `401`. No demo session is involved. |
| Payload | Retell's **default** custom-function payload `{ name, call, args }` (not "args only"), so the call's dynamic variables are available. |
| Driver identity | `call.retell_llm_dynamic_variables.driver_id` → `call.metadata.driver_id` → `args.driver_id` (LLM-extracted, last resort). The source is logged. |
| Times | The driver says local 24-hour times (`15:00`). They are placed on the scenario's simulated day in America/Los_Angeles. |
| Deduplication | `providerEventId = retell:<call_id>:<sha256(sorted args)[0:16]>`. A Retell retry of the same request is a no-op (`already_recorded`); a corrected report later in the same call is recorded. |
| Simulated clock | A live call happens on a real date, so it is applied at the simulated clock + 1 minute. The real `reportedAt` is kept for provenance. |
| Responses (read back to the agent) | `200 {result: "recorded" \| "already_recorded" \| "rejected", message}`; `401` bad signature; `400` malformed envelope; `503` scenario not loaded or backend not configured. |

## Retell agent setup

In the [Retell dashboard](https://dashboard.retellai.com):

1. **API key.** Settings → API Keys: copy the key that shows the **webhook
   badge**. That is `RETELL_API_KEY`; only that key can verify signatures.
2. **Agent.** Create a Single Prompt agent (Retell LLM). Use this prompt
   (adjust tone freely; keep the rules):

   ```
   You are GateRescue's dispatch assistant calling {{driver_name}} (driver ID {{driver_id}})
   about today's port drayage disruption. This is a synthetic demo; never claim it is real.

   Goal: get the driver's current status and record it with submit_driver_report.
   Ask, one at a time, and confirm back:
   - availability: available, on-job, off-duty or unreachable
   - the time they become available (24-hour local time, e.g. 15:00), and until when, if they know
   - where they are now (e.g. "Terminal B staging area")
   - their equipment: dry_20, dry_40 or reefer_40
   Then call submit_driver_report once. If it returns "rejected", ask about the field
   it names and call again. Read back its message.

   Never promise or confirm an assignment or dispatch. A dispatcher reviews and approves
   every move; say so if asked.
   ```

3. **Custom function** (Tools → Add → Custom Function):
   - Name: `submit_driver_report`
   - Description: `Record the driver's reported status. Call once after confirming the details with the driver.`
   - URL: `https://<your-vercel-domain>/api/retell/driver-report`
   - Method: `POST`. **Payload: args only = OFF** (the default payload is required)
   - Timeout: `10000` ms. Max retry: `1` (the endpoint is idempotent)
   - Talk while waiting: on, static sentence "One moment while I record that."
   - Parameters (JSON schema):

   ```json
   {
     "type": "object",
     "properties": {
       "availability": {
         "type": "string",
         "enum": ["available", "on-job", "off-duty", "unreachable"],
         "description": "Driver's current availability as stated by the driver"
       },
       "available_from": {
         "type": "string",
         "description": "Local 24-hour time HH:MM when the driver can start a new move, e.g. 15:00"
       },
       "available_until": {
         "type": "string",
         "description": "Local 24-hour time HH:MM when the driver's availability ends, if stated"
       },
       "location": {
         "type": "string",
         "description": "Where the driver is now, e.g. Terminal B staging area"
       },
       "equipment": {
         "type": "string",
         "enum": ["dry_20", "dry_40", "reefer_40"],
         "description": "Container equipment the driver has"
       },
       "note": {
         "type": "string",
         "description": "Anything else relevant the driver said, one sentence"
       },
       "driver_id": {
         "type": "string",
         "description": "Driver ID only if the driver states it and it was not provided to you"
       }
     },
     "required": ["availability", "available_from"]
   }
   ```

4. **Dynamic variables for the test call.** Set `driver_id = D02` and
   `driver_name = Aisha Johnson`. In the dashboard's test-call panel, enter
   them as dynamic variables. For an outbound phone call via the API, pass
   `retell_llm_dynamic_variables: { "driver_id": "D02", "driver_name": "Aisha Johnson" }`
   ([create phone call](https://docs.retellai.com/api-references/create-phone-call)).
   That requires a Retell-purchased or imported `from_number`, and US
   destination numbers only.

## Vercel environment variables

Set these for **Production** and **Preview**, marked **Sensitive**. None of
them use `NEXT_PUBLIC_`.

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **secret** key (`sb_secret_…`) |
| `DEMO_ACCESS_CODE` | Shared dispatcher access code |
| `DEMO_SESSION_SECRET` | `openssl rand -base64 48` (a different value per environment is fine) |
| `RETELL_API_KEY` | Retell API key with the webhook badge |

Redeploy after changing variables.

## Real test call (checklist)

1. Run `supabase/import/authoritative_dataset.sql` to reset the scenario to
   14:05 (D02 not reported).
2. Deploy, then set the custom-function URL to the deployment's domain.
   A protected preview URL blocks Retell unless the custom function sends
   Vercel's automation bypass header. In Vercel → Project → Settings →
   Deployment Protection → Protection Bypass for Automation, create a secret.
   In the Retell custom function → Headers, add
   `x-vercel-protection-bypass: <that secret>`
   ([Vercel docs](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)).
3. Start a test call with `driver_id = D02`. Say: available from 15:00
   until 19:00, at Terminal B staging area, reefer_40.
4. Expect the agent to read back "Recorded: Aisha Johnson available,
   15:00–19:00 at Terminal B staging area…".
5. `GET /api/state`: D02 is `available`, the newest event ends with
   "(via retell)", and the J02 queue entry is `ready_for_approval` with D02.

Optional hardening: restrict the route to Retell's published outbound IP
(`100.20.5.228`, per the docs above) at the edge.
