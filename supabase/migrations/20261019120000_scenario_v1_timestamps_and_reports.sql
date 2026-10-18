-- Scenario v1 support. Run AFTER 20261017000000 and 20261019000000.
--
-- 1. Simulated-time columns become timestamptz so calendar dates and offsets
--    are preserved (existing values are read as America/Los_Angeles time).
-- 2. Explicit 'not-reported' driver state; availability window end; location.
-- 3. Scenario identity on demo_state; data_origin on remaining tables.
-- 4. apply_driver_report() takes full timestamps, an optional availability
--    end, location and equipment, and applies reports at the report time
--    when it falls shortly after the simulated clock.

-- 1. timestamptz ------------------------------------------------------------
alter table public.drivers
  alter column available_from type timestamptz using available_from at time zone 'America/Los_Angeles',
  alter column last_report type timestamptz using last_report at time zone 'America/Los_Angeles';

alter table public.jobs
  alter column deadline type timestamptz using deadline at time zone 'America/Los_Angeles',
  alter column appointment_start type timestamptz using appointment_start at time zone 'America/Los_Angeles',
  alter column appointment_end type timestamptz using appointment_end at time zone 'America/Los_Angeles',
  alter column pre_outage_start type timestamptz using pre_outage_start at time zone 'America/Los_Angeles',
  alter column pre_outage_end type timestamptz using pre_outage_end at time zone 'America/Los_Angeles',
  alter column approval_at type timestamptz using approval_at at time zone 'America/Los_Angeles';

alter table public.driver_busy_slots
  alter column start_at type timestamptz using start_at at time zone 'America/Los_Angeles',
  alter column end_at type timestamptz using end_at at time zone 'America/Los_Angeles';

alter table public.activity_events
  alter column at type timestamptz using at at time zone 'America/Los_Angeles';

alter table public.demo_state
  alter column sim_now type timestamptz using sim_now at time zone 'America/Los_Angeles';

alter table public.recovery_plans
  alter column generated_at type timestamptz using generated_at at time zone 'America/Los_Angeles';

alter table public.driver_reports
  alter column applied_at type timestamptz using applied_at at time zone 'America/Los_Angeles';

-- driver_reports.available_from was a bare time of day; it becomes a full
-- timestamp. Reports cannot be converted without a date, so require empty.
do $$
begin
  if exists (select 1 from public.driver_reports) then
    raise exception 'driver_reports is not empty; convert available_from manually before this migration';
  end if;
end $$;
alter table public.driver_reports drop column available_from;
alter table public.driver_reports add column available_from timestamptz not null;

-- 2. Driver state -------------------------------------------------------------
alter table public.drivers drop constraint drivers_availability_check;
alter table public.drivers add constraint drivers_availability_check
  check (availability in ('available', 'on-job', 'off-duty', 'unreachable', 'not-reported'));
alter table public.drivers
  add column available_until timestamptz,
  add constraint drivers_availability_window_check
    check (available_until is null or available_from is null or available_until > available_from);

alter table public.driver_reports drop constraint driver_reports_source_check;
alter table public.driver_reports add constraint driver_reports_source_check
  check (source in ('dispatcher', 'retell', 'scenario'));
alter table public.driver_reports
  add column available_until timestamptz,
  add column location text,
  add column equipment text[]
    check (equipment is null or equipment <@ array['chassis-40', 'chassis-20', 'reefer-40', 'triaxle']),
  add column data_origin text not null default 'synthetic',
  add constraint driver_reports_window_check check (available_until is null or available_until > available_from);

alter table public.jobs add column container_status_as_of timestamptz;

-- 3. Scenario identity / data origin --------------------------------------------
alter table public.demo_state
  add column scenario_id text,
  add column scenario_version integer,
  add column time_zone text not null default 'America/Los_Angeles';

alter table public.terminals add column data_origin text not null default 'synthetic';
alter table public.activity_events add column data_origin text not null default 'synthetic';
alter table public.recovery_plans add column data_origin text not null default 'synthetic';
alter table public.driver_busy_slots add column data_origin text not null default 'synthetic';

-- 4. apply_driver_report() ---------------------------------------------------------
drop function if exists public.apply_driver_report(text, text, text, timestamptz, text, time, text);

create function public.apply_driver_report(
  p_driver_id text,
  p_source text,
  p_provider_event_id text,
  p_reported_at timestamptz,
  p_availability text,
  p_available_from timestamptz,
  p_available_until timestamptz,
  p_location text,
  p_equipment text[],
  p_note text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_driver_name text;
  v_report public.driver_reports;
  v_sim_now timestamptz;
  v_time_zone text;
  v_applied_at timestamptz;
  v_inputs_version integer;
  v_note text := btrim(coalesce(p_note, ''));
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_plan_id bigint;
  v_plan_recommendations jsonb;
  v_pending integer;
begin
  select name into v_driver_name from public.drivers where id = p_driver_id;
  if v_driver_name is null then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;

  insert into public.driver_reports
    (driver_id, source, provider_event_id, reported_at, availability, available_from,
     available_until, location, equipment, note)
  values
    (p_driver_id, p_source, p_provider_event_id, p_reported_at, p_availability, p_available_from,
     p_available_until, v_location, nullif(p_equipment, '{}'), v_note)
  on conflict (source, provider_event_id) do nothing
  returning * into v_report;

  if v_report.id is null then
    select * into v_report from public.driver_reports
    where source = p_source and provider_event_id = p_provider_event_id;
    select inputs_version into v_inputs_version from public.demo_state where id = 1;
    return jsonb_build_object(
      'duplicate', true, 'report', to_jsonb(v_report),
      'inputs_version', v_inputs_version, 'plan_invalidated', false);
  end if;

  select sim_now, time_zone into v_sim_now, v_time_zone from public.demo_state where id = 1 for update;
  if v_sim_now is null then
    raise exception 'demo_state row missing — run the seed' using errcode = 'P0001';
  end if;

  -- Report time if within 12 h after the clock (scenario-scale), else clock + 1 min.
  v_applied_at := case
    when p_reported_at >= v_sim_now + interval '1 minute' and p_reported_at <= v_sim_now + interval '12 hours'
      then p_reported_at
    else v_sim_now + interval '1 minute'
  end;

  update public.demo_state
     set sim_now = v_applied_at, inputs_version = inputs_version + 1
   where id = 1
  returning inputs_version into v_inputs_version;

  update public.drivers
     set availability = p_availability,
         available_from = p_available_from,
         available_until = p_available_until,
         location = coalesce(v_location, location),
         equipment = case when p_equipment is null or cardinality(p_equipment) = 0 then equipment else p_equipment end,
         last_report = v_applied_at,
         last_note = case when v_note = '' then last_note else v_note end
   where id = p_driver_id;

  update public.driver_reports set applied_at = v_applied_at where id = v_report.id
  returning * into v_report;

  insert into public.activity_events (at, kind, severity, message)
  values (
    v_applied_at,
    'driver',
    case when p_availability = 'available' then 'success' else 'info' end,
    format('%s reported: %s, free from %s%s%s.%s%s',
      v_driver_name,
      replace(p_availability, '-', ' '),
      to_char(p_available_from at time zone v_time_zone, 'HH24:MI'),
      case when p_available_until is null then '' else ' until ' || to_char(p_available_until at time zone v_time_zone, 'HH24:MI') end,
      case when v_location is null then '' else ' at ' || v_location end,
      case when v_note = '' then '' else format(' “%s”', v_note) end,
      case when p_source = 'dispatcher' then '' else format(' (via %s)', p_source) end)
  );

  update public.recovery_plans
     set status = 'invalidated', invalidated_reason = v_driver_name || ' report'
   where status = 'current'
  returning id, recommendations into v_plan_id, v_plan_recommendations;

  if v_plan_id is not null then
    select count(*) into v_pending
      from jsonb_array_elements(v_plan_recommendations) r
     where not coalesce((r ->> 'approved')::boolean, false)
       and r ->> 'category' <> 'blocked';
    insert into public.activity_events (at, kind, severity, message)
    values (v_applied_at, 'plan', 'warning',
      format('Pending recommendations invalidated (%s unapproved): %s report. Regenerate the plan.', v_pending, v_driver_name));
  end if;

  return jsonb_build_object(
    'duplicate', false, 'report', to_jsonb(v_report),
    'inputs_version', v_inputs_version, 'plan_invalidated', v_plan_id is not null);
end;
$$;

revoke all on function public.apply_driver_report(text, text, text, timestamptz, text, timestamptz, timestamptz, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.apply_driver_report(text, text, text, timestamptz, text, timestamptz, timestamptz, text, text[], text)
  to service_role;
