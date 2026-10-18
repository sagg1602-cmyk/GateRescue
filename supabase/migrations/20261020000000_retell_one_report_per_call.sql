-- One Retell report per call, across intake paths. Run AFTER 20261019120000.
--
-- The Retell custom function (mid-call) and the call_analyzed webhook
-- (post-call) use different provider event ids. provider_call_id plus a
-- partial unique index makes the second path a duplicate instead of a
-- second report, even if both are enabled by mistake.

alter table public.driver_reports add column provider_call_id text;

create unique index driver_reports_one_per_call
  on public.driver_reports (source, provider_call_id)
  where provider_call_id is not null;

drop function if exists public.apply_driver_report(text, text, text, timestamptz, text, timestamptz, timestamptz, text, text[], text);

create function public.apply_driver_report(
  p_driver_id text,
  p_source text,
  p_provider_event_id text,
  p_provider_call_id text,
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

  -- No conflict target: either unique constraint (event id, or one per call) makes this a duplicate.
  insert into public.driver_reports
    (driver_id, source, provider_event_id, provider_call_id, reported_at, availability, available_from,
     available_until, location, equipment, note)
  values
    (p_driver_id, p_source, p_provider_event_id, p_provider_call_id, p_reported_at, p_availability, p_available_from,
     p_available_until, v_location, nullif(p_equipment, '{}'), v_note)
  on conflict do nothing
  returning * into v_report;

  if v_report.id is null then
    select * into v_report from public.driver_reports
     where source = p_source
       and (provider_event_id = p_provider_event_id
            or (p_provider_call_id is not null and provider_call_id = p_provider_call_id))
     order by received_at
     limit 1;
    select inputs_version into v_inputs_version from public.demo_state where id = 1;
    return jsonb_build_object(
      'duplicate', true, 'report', to_jsonb(v_report),
      'inputs_version', v_inputs_version, 'plan_invalidated', false);
  end if;

  select sim_now, time_zone into v_sim_now, v_time_zone from public.demo_state where id = 1 for update;
  if v_sim_now is null then
    raise exception 'demo_state row missing — run the seed' using errcode = 'P0001';
  end if;

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

revoke all on function public.apply_driver_report(text, text, text, text, timestamptz, text, timestamptz, timestamptz, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.apply_driver_report(text, text, text, text, timestamptz, text, timestamptz, timestamptz, text, text[], text)
  to service_role;
