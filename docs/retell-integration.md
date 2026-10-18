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
