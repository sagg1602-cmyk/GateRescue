-- Additive migration for Maelie's authoritative demo dataset
-- (data/source/gaterescue_*.csv). Run AFTER 20261017000000_operational_schema.sql.
--
-- - Allows a third terminal (the dataset uses Terminal A, B and C).
-- - Adds columns for supplied fields the operational schema had no place for,
--   plus `source_*` columns that keep the original CSV values verbatim next to
--   any mapped value.
-- - Relaxes NOT NULL where the dataset genuinely has no value (unknown is
--   stored as NULL, never invented).
-- Nothing is dropped or renamed; existing code paths keep working.

-- Terminals ----------------------------------------------------------------
alter table public.terminals drop constraint terminals_id_check;
alter table public.terminals
  add constraint terminals_id_check check (id in ('term-a', 'term-b', 'term-c'));

-- Customers ----------------------------------------------------------------
alter table public.customers
  add column customer_type text,
  add column contact_name text,
  add column contact_phone text,
  add column city text,
  add column data_origin text not null default 'synthetic';

-- Drivers ------------------------------------------------------------------
alter table public.drivers
  add column phone text,
  add column location text,
  add column checked_in boolean,
  add column source_equipment text,
  add column source_status text,
  add column data_origin text not null default 'synthetic';

-- Unknown for drivers who have not reported yet / no report time supplied.
alter table public.drivers alter column available_from drop not null;
alter table public.drivers alter column last_report drop not null;

-- Jobs ---------------------------------------------------------------------
alter table public.jobs
  add column cargo_description text,
  add column source_container_type text,
  add column source_terminal text,
  add column criticality_tier smallint check (criticality_tier between 0 and 3),
  add column criticality_basis text
    check (criticality_basis in ('government_designated', 'third_party_verified', 'self_declared', 'none')),
  add column criticality_stated_by text,
  add column last_free_day date,
  -- Pre-existing driver assignment from the source data. Distinct from
  -- approval_* (a dispatcher approval recorded in GateRescue).
  add column assigned_driver_id text references public.drivers (id),
  add column data_origin text not null default 'synthetic';

-- Not supplied by the dataset.
alter table public.jobs alter column container_available drop not null;

-- New columns inherit the existing grants (none for anon/authenticated) and
-- the tables already have RLS enabled; no policy changes needed.
