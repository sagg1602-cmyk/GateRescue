// Converts Maelie's authoritative CSVs (data/source/, kept unchanged) into an
// idempotent SQL import for the operational schema:
//
//   npm run db:import:generate                 # customers, drivers, jobs, terminals
//   npm run db:import:generate -- --sim-now=2026-10-19T12:00:00
//                                              # also sets the simulated clock
//
// Output: supabase/import/authoritative_dataset.sql
//
// Rules: original values are kept verbatim in source_* columns; values the
// CSVs do not supply are written as NULL, never invented. Mappings marked
// PROVISIONAL need confirmation (see docs/dataset-import.md).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const sourceDir = new URL("data/source/", root);
const outFile = fileURLToPath(new URL("supabase/import/authoritative_dataset.sql", root));

/* ------------------------------------------------------------------ mapping */

const TERMINAL_IDS = { "Terminal A": "term-a", "Terminal B": "term-b", "Terminal C": "term-c" };

// Source container/equipment type → operational equipment type. Only values
// present in the dataset are mapped; anything else (reefer_20, unknown) fails.
const EQUIPMENT = { dry_20: "chassis-20", dry_40: "chassis-40", reefer_40: "reefer-40" };

// PROVISIONAL: source driver status → operational availability.
const AVAILABILITY = { available: "available", busy: "on-job", not_reported: "unreachable" };

// PROVISIONAL: criticality tier (0–3, higher = more critical) → priority.
const PRIORITY_BY_TIER = { 3: "critical", 2: "critical", 1: "high", 0: "normal" };

const HOLDS = { none: [], customs: ["customs"], freight: ["freight"] };

const EXPECTED_HEADERS = {
  customers: "customer_id,name,customer_type,contact_name,contact_phone,city,data_origin",
  drivers: "driver_id,name,phone,equipment,status_at_start,available_from,location_at_start,checked_in,data_origin",
  jobs: "job_id,customer_id,container_id,cargo_description,container_type,terminal,appointment_start,appointment_end,appointment_status,assigned_driver_id,criticality_tier,criticality_basis,criticality_stated_by,harm_deadline,hold_type,last_free_day,data_origin",
};

/* -------------------------------------------------------------------- input */

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v !== "")) rows.push(row); }
  return rows;
}

const checksums = {};
function load(name) {
  const file = `gaterescue_${name}.csv`;
  const text = readFileSync(new URL(file, sourceDir), "utf8");
  checksums[file] = createHash("sha256").update(text).digest("hex");
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ""));
  if (header.join(",") !== EXPECTED_HEADERS[name]) {
    throw new Error(`${file}: unexpected header\n  got:      ${header.join(",")}\n  expected: ${EXPECTED_HEADERS[name]}`);
  }
  return body.map((values, i) => {
    if (values.length !== header.length) throw new Error(`${file} row ${i + 2}: ${values.length} fields, expected ${header.length}`);
    return Object.fromEntries(header.map((h, j) => [h, values[j]]));
  });
}

const problems = [];
function need(condition, message) {
  if (!condition) problems.push(message);
}

/** "2026-10-19T15:00:00-07:00" → "2026-10-19T15:00:00" (Pacific wall-clock time). */
function toLocal(value, where) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(-07:00)$/.exec(value);
  need(m, `${where}: expected an ISO time with -07:00 offset, got "${value}"`);
  return m ? m[1] : null;
}

function mapped(table, value, where) {
  need(value in table, `${where}: unsupported value "${value}"`);
  return table[value];
}

/* ---------------------------------------------------------------- transform */

const customers = load("customers");
const drivers = load("drivers");
const jobs = load("jobs");
const driverIds = new Set(drivers.map((d) => d.driver_id));
const customerIds = new Set(customers.map((c) => c.customer_id));

const driverRows = drivers.map((d) => {
  const at = `drivers ${d.driver_id}`;
  need(["true", "false"].includes(d.checked_in), `${at}: checked_in must be true/false`);
  return {
    id: d.driver_id,
    name: d.name,
    phone: d.phone || null,
    equipment: [mapped(EQUIPMENT, d.equipment, `${at} equipment`)],
    source_equipment: d.equipment,
    availability: mapped(AVAILABILITY, d.status_at_start, `${at} status_at_start`),
    source_status: d.status_at_start,
    available_from: d.available_from ? toLocal(d.available_from, `${at} available_from`) : null,
    last_report: null, // not supplied (only checked_in is)
    last_note: "",
    location: d.location_at_start || null,
    checked_in: d.checked_in === "true",
    data_origin: d.data_origin,
  };
});

const terminalNames = [...new Set(jobs.map((j) => j.terminal))].sort();
const terminalRows = terminalNames.map((name) => ({
  id: mapped(TERMINAL_IDS, name, `jobs terminal`),
  short_name: name,
  name, // the dataset supplies no longer terminal name
  portal_status: "online",
}));

const jobRows = jobs.map((j) => {
  const at = `jobs ${j.job_id}`;
  need(customerIds.has(j.customer_id), `${at}: unknown customer_id ${j.customer_id}`);
  need(!j.assigned_driver_id || driverIds.has(j.assigned_driver_id), `${at}: unknown assigned_driver_id ${j.assigned_driver_id}`);
  need(["confirmed", "unverified"].includes(j.appointment_status), `${at}: appointment_status "${j.appointment_status}"`);
  const tier = Number(j.criticality_tier);
  return {
    id: j.job_id,
    container: j.container_id,
    customer_id: j.customer_id,
    terminal_id: mapped(TERMINAL_IDS, j.terminal, `${at} terminal`),
    source_terminal: j.terminal,
    priority: mapped(PRIORITY_BY_TIER, tier, `${at} criticality_tier`),
    criticality_tier: tier,
    criticality_basis: j.criticality_basis,
    criticality_stated_by: j.criticality_stated_by || null,
    deadline: toLocal(j.harm_deadline, `${at} harm_deadline`),
    appointment_status: j.appointment_status,
    appointment_start: toLocal(j.appointment_start, `${at} appointment_start`),
    appointment_end: toLocal(j.appointment_end, `${at} appointment_end`),
    container_available: null, // not supplied
    holds: mapped(HOLDS, j.hold_type, `${at} hold_type`),
    required_equipment: mapped(EQUIPMENT, j.container_type, `${at} container_type`),
    source_container_type: j.container_type,
    cargo_description: j.cargo_description || null,
    last_free_day: j.last_free_day || null,
    assigned_driver_id: j.assigned_driver_id || null,
    data_origin: j.data_origin,
  };
});

const simNowArg = process.argv.find((a) => a.startsWith("--sim-now="))?.slice("--sim-now=".length);
need(!simNowArg || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(simNowArg), `--sim-now must look like 2026-10-19T12:00:00`);

if (problems.length) {
  console.error(`Import NOT generated — ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

/* ------------------------------------------------------------------- output */

const lit = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? `array[${v.map(lit).join(", ")}]::text[]` : "'{}'::text[]";
  return `'${String(v).replaceAll("'", "''")}'`;
};

function upsert(table, rows) {
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n");
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(",\n  ");
  return `insert into public.${table} (${cols.join(", ")}) values\n${values}\non conflict (id) do update set\n  ${updates};`;
}

const ids = (rows) => rows.map((r) => lit(r.id)).join(", ");

const sql = `-- GENERATED by scripts/import-authoritative-csv.mjs — do not edit by hand.
-- Source files (unchanged, data/source/), sha256:
${Object.entries(checksums).map(([f, h]) => `--   ${f}  ${h}`).join("\n")}
-- SYNTHETIC DEMO DATA supplied by the scenario owner.
--
-- Requires migrations 20261017000000 and 20261019000000.
-- Idempotent: upserts by id. Aborts (changing nothing) if the database holds
-- customers, drivers, jobs or terminals that are not part of this dataset,
-- e.g. rows from the old 20-job seed.
-- Values the CSVs do not supply are NULL: drivers.last_report,
-- drivers.available_from (not-reported drivers), jobs.container_available.

begin;

do $$
declare
  foreign_rows text;
begin
  select string_agg(t || ':' || id, ', ') into foreign_rows from (
    select 'customers' t, id from public.customers where id not in (${ids(customers.map((c) => ({ id: c.customer_id })))})
    union all select 'drivers', id from public.drivers where id not in (${ids(driverRows)})
    union all select 'jobs', id from public.jobs where id not in (${ids(jobRows)})
    union all select 'terminals', id from public.terminals where id not in (${ids(terminalRows)})
  ) x;
  if foreign_rows is not null then
    raise exception 'Import aborted: database contains rows outside the authoritative dataset (%). Remove them first.', foreign_rows;
  end if;
end $$;

${upsert("terminals", terminalRows)}

${upsert("customers", customers.map((c) => ({
  id: c.customer_id,
  name: c.name,
  customer_type: c.customer_type || null,
  contact_name: c.contact_name || null,
  contact_phone: c.contact_phone || null,
  city: c.city || null,
  data_origin: c.data_origin,
})))}

${upsert("drivers", driverRows)}

${upsert("jobs", jobRows)}
${simNowArg ? `
insert into public.demo_state (id, sim_now, inputs_version) values (1, ${lit(simNowArg)}, 1)
on conflict (id) do update set sim_now = excluded.sim_now;
` : `
-- Simulated clock NOT set: scenario start time not supplied. Re-generate with
-- --sim-now=YYYY-MM-DDTHH:MM:SS once confirmed.
`}
commit;
`;

mkdirSync(fileURLToPath(new URL("supabase/import/", root)), { recursive: true });
writeFileSync(outFile, sql);
console.log(
  `Wrote ${outFile}: ${terminalRows.length} terminals, ${customers.length} customers, ${driverRows.length} drivers, ${jobRows.length} jobs` +
    (simNowArg ? `, sim clock ${simNowArg}.` : ". Simulated clock not set (no --sim-now)."),
);
