-- GateRescue synthetic seed tables. Run in the Supabase SQL editor first,
-- then import the CSVs in this order: customers, drivers, jobs, expected_ranking.

create table if not exists customers (
  customer_id   text primary key,
  name          text not null,
  customer_type text not null,
  contact_name  text,
  contact_phone text,
  city          text,
  data_origin   text not null default 'synthetic'
);

create table if not exists drivers (
  driver_id         text primary key,
  name              text not null,
  phone             text,
  equipment         text not null check (equipment in ('dry_20','dry_40','reefer_20','reefer_40','unknown')),
  status_at_start   text not null check (status_at_start in ('available','busy','not_reported')),
  available_from    timestamptz,
  location_at_start text,
  checked_in        boolean not null default false,
  data_origin       text not null default 'synthetic'
);

create table if not exists jobs (
  job_id                text primary key,
  customer_id           text not null references customers(customer_id),
  container_id          text not null,
  cargo_description     text,
  container_type        text not null check (container_type in ('dry_20','dry_40','reefer_20','reefer_40')),
  terminal              text not null,
  appointment_start     timestamptz not null,
  appointment_end       timestamptz not null,
  appointment_status    text not null check (appointment_status in ('confirmed','unverified')),
  assigned_driver_id    text references drivers(driver_id),
  criticality_tier      smallint not null check (criticality_tier between 0 and 3),
  criticality_basis     text not null check (criticality_basis in ('government_designated','third_party_verified','self_declared','none')),
  criticality_stated_by text,
  harm_deadline         timestamptz not null,
  hold_type             text not null check (hold_type in ('none','customs','freight')),
  last_free_day         date,
  data_origin           text not null default 'synthetic'
);

create table if not exists expected_ranking (
  rank                         smallint primary key,
  job_id                       text not null references jobs(job_id),
  criticality_tier             smallint not null,
  harm_deadline                timestamptz not null,
  status_before_call           text not null,
  blocker_before_call          text,
  proposed_driver_before_call  text references drivers(driver_id),
  next_action_before_call      text,
  status_after_call            text not null,
  blocker_after_call           text,
  proposed_driver_after_call   text references drivers(driver_id),
  next_action_after_call       text,
  owner                        text not null,
  data_origin                  text not null default 'synthetic'
);
