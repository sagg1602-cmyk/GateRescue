<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GateRescue (hackathon project)

Dispatcher recovery tool for when a port terminal's appointment system fails.
All data is SYNTHETIC. Every record has a data_origin field. Never present
synthetic data as real.

## Stack
Next.js + TypeScript, Supabase, Vercel. Retell AI for driver calls.

## Rules
- Shared record types live in a single types file. Do not change it or the
  database schema without telling the team.
- Job statuses: ready_for_approval, awaiting_verification, blocked.
  Every job shows its blocker, who resolves it, and the next action.
- Urgency is separate from permission to move: an urgent job can lead the
  queue and still be blocked.
- Ranking: drop jobs failing mandatory constraints; sort by criticality tier,
  then earliest harm deadline, then job id; assign a compatible free driver;
  reserve that driver's time. Same input must give same output.
- Mandatory constraints: verified appointment in window, terminal open,
  right equipment, driver free for the trip, no blocking hold.
- Humans approve every assignment. A voice report never dispatches by itself.
- Restored terminal access never marks a shipment delivered.
- Keep secrets in environment variables. Never commit keys.

## Folders
Backend: src/lib/recovery, src/app/api. Frontend: src/components, src/app.
Seed data: /seed. Work on your own branch; pull main before starting;
merge small and often.