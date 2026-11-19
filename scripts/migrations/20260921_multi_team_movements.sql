-- Cover every active team during vacations and preserve unrelated memberships.
begin;

create or replace function bluecore_v2.manage_employee_movement(
  p_action text,
  p_employee_id uuid,
  p_source_team_id uuid default null,
  p_destination_team_id uuid default null,
  p_replacement_id uuid default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_result_id uuid;
  v_current_team_id uuid;
  v_current_role_id uuid;
  v_destination_team_id uuid;
  v_pool_team_id uuid;
  v_absence bluecore_v2.employee_absences%rowtype;
  v_replacement_role_id uuid;
  v_coverage_memberships jsonb := '[]'::jsonb;
  v_membership record;
  v_item jsonb;
  v_coverage_created boolean;
  v_team_id uuid;
begin
  if p_action not in ('rotate', 'vacation_start', 'vacation_end') then
    raise exception 'Unsupported employee movement action: %', p_action;
  end if;

  if not exists (
    select 1 from bluecore_v2.employees
    where id = p_employee_id and status = 'active' and deleted_at is null
  ) then
    raise exception 'Active employee was not found';
  end if;

  if p_action in ('rotate', 'vacation_start') then
    if p_source_team_id is null then
      raise exception 'A source team is required when an employee can belong to multiple teams';
    end if;

    select membership.team_id, membership.role_id
      into v_current_team_id, v_current_role_id
    from bluecore_v2.team_memberships membership
    where membership.employee_id = p_employee_id
      and membership.team_id = p_source_team_id
      and membership.is_active
    for update;

    if v_current_team_id is null then
      raise exception 'The employee does not have an active membership in the source team';
    end if;
  end if;

  if p_action = 'rotate' then
    if p_destination_team_id is null or not exists (
      select 1 from bluecore_v2.teams
      where id = p_destination_team_id and status = 'active' and deleted_at is null
    ) then
      raise exception 'Active destination team was not found';
    end if;

    update bluecore_v2.team_memberships
    set is_active = false, ended_at = current_date, updated_at = now()
    where employee_id = p_employee_id
      and team_id = v_current_team_id
      and is_active;

    insert into bluecore_v2.team_memberships (
      team_id, employee_id, role_id, started_at, is_active, created_by
    ) select
      p_destination_team_id, p_employee_id, v_current_role_id, current_date, true, p_created_by
    where not exists (
      select 1 from bluecore_v2.team_memberships
      where team_id = p_destination_team_id
        and employee_id = p_employee_id
        and is_active
    )
    on conflict (team_id, employee_id, started_at) do update set
      role_id = excluded.role_id,
      ended_at = null,
      is_active = true,
      updated_at = now();

    insert into bluecore_v2.team_rotation_events (
      employee_id, from_team_id, to_team_id, event_type, effective_at, created_by
    ) values (
      p_employee_id, v_current_team_id, p_destination_team_id, 'rotation', now(), p_created_by
    ) returning id into v_result_id;

    return v_result_id;
  end if;

  select id into v_pool_team_id
  from bluecore_v2.teams
  where code = 'pool-de-vacaciones' and status = 'active' and deleted_at is null;

  if v_pool_team_id is null then
    raise exception 'Vacation pool team was not found';
  end if;

  if p_action = 'vacation_start' then
    if p_replacement_id is null or p_replacement_id = p_employee_id then
      raise exception 'A different replacement employee is required';
    end if;

    if exists (
      select 1 from bluecore_v2.employee_absences
      where employee_id = p_employee_id and status = 'active'
    ) then
      raise exception 'The employee already has an active absence';
    end if;

    if not exists (
      select 1 from bluecore_v2.employees
      where id = p_replacement_id and status = 'active' and deleted_at is null
    ) then
      raise exception 'Active replacement employee was not found';
    end if;

    select membership.role_id
      into v_replacement_role_id
    from bluecore_v2.team_memberships membership
    where membership.employee_id = p_replacement_id
      and membership.team_id = v_pool_team_id
      and membership.is_active
    for update;

    if not found then
      raise exception 'The replacement employee must have an active vacation pool membership';
    end if;

    update bluecore_v2.team_memberships
    set is_active = false, ended_at = current_date, updated_at = now()
    where employee_id = p_replacement_id
      and team_id = v_pool_team_id
      and is_active;

    for v_membership in
      select membership.team_id, membership.role_id
      from bluecore_v2.team_memberships membership
      join bluecore_v2.teams team on team.id = membership.team_id
      where membership.employee_id = p_employee_id
        and membership.is_active
        and membership.team_id <> v_pool_team_id
        and team.status = 'active'
        and team.deleted_at is null
      order by membership.started_at, membership.team_id
    loop
      select not exists (
        select 1 from bluecore_v2.team_memberships
        where team_id = v_membership.team_id
          and employee_id = p_replacement_id
          and is_active
      ) into v_coverage_created;

      if v_coverage_created then
        insert into bluecore_v2.team_memberships (
          team_id, employee_id, role_id, started_at, is_active, created_by
        ) values (
          v_membership.team_id, p_replacement_id, v_replacement_role_id,
          current_date, true, p_created_by
        )
        on conflict (team_id, employee_id, started_at) do update set
          role_id = excluded.role_id,
          ended_at = null,
          is_active = true,
          updated_at = now();
      end if;

      v_coverage_memberships := v_coverage_memberships || jsonb_build_array(
        jsonb_build_object(
          'teamId', v_membership.team_id,
          'membershipCreated', v_coverage_created
        )
      );

      insert into bluecore_v2.team_rotation_events (
        employee_id, from_team_id, to_team_id, event_type, effective_at,
        created_by, metadata
      ) values (
        p_replacement_id, v_pool_team_id, v_membership.team_id, 'assignment',
        now(), p_created_by,
        jsonb_build_object('reason', 'vacation_coverage', 'absentEmployeeId', p_employee_id)
      );

      insert into bluecore_v2.team_rotation_events (
        employee_id, from_team_id, to_team_id, event_type, effective_at,
        created_by, metadata
      ) values (
        p_employee_id, v_membership.team_id, v_pool_team_id, 'vacation_start',
        now(), p_created_by, jsonb_build_object('replacementEmployeeId', p_replacement_id)
      );
    end loop;

    if jsonb_array_length(v_coverage_memberships) = 0 then
      raise exception 'The employee does not have active teams to cover';
    end if;

    insert into bluecore_v2.employee_absences (
      employee_id, team_id, absence_type, start_date, status, reason,
      replacement_employee_id, created_by, metadata
    ) values (
      p_employee_id, p_source_team_id, 'vacation', current_date, 'active',
      'Vacation registered from the application', p_replacement_id, p_created_by,
      jsonb_build_object(
        'replacementPoolRoleId', v_replacement_role_id,
        'coverageMemberships', v_coverage_memberships
      )
    ) returning id into v_result_id;

    return v_result_id;
  end if;

  select * into v_absence
  from bluecore_v2.employee_absences
  where employee_id = p_employee_id
    and absence_type = 'vacation'
    and status = 'active'
  order by start_date desc nulls last, created_at desc
  limit 1
  for update;

  if v_absence.id is null then
    raise exception 'An active vacation absence was not found';
  end if;

  update bluecore_v2.employee_absences
  set status = 'completed', end_date = current_date, updated_at = now()
  where id = v_absence.id;

  if v_absence.replacement_employee_id is not null then
    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_absence.metadata->'coverageMemberships', '[]'::jsonb))
    loop
      v_team_id := nullif(v_item->>'teamId', '')::uuid;
      v_coverage_created := coalesce((v_item->>'membershipCreated')::boolean, false);

      if v_team_id is not null and v_coverage_created then
        update bluecore_v2.team_memberships
        set is_active = false, ended_at = current_date, updated_at = now()
        where employee_id = v_absence.replacement_employee_id
          and team_id = v_team_id
          and is_active;

        insert into bluecore_v2.team_rotation_events (
          employee_id, from_team_id, to_team_id, event_type, effective_at,
          created_by, metadata
        ) values (
          v_absence.replacement_employee_id, v_team_id, v_pool_team_id,
          'unassignment', now(), p_created_by,
          jsonb_build_object('reason', 'vacation_coverage_ended', 'absenceId', v_absence.id)
        ) returning id into v_result_id;
      end if;

      if v_team_id is not null then
        insert into bluecore_v2.team_rotation_events (
          employee_id, from_team_id, to_team_id, event_type, effective_at,
          created_by, metadata
        ) values (
          p_employee_id, v_pool_team_id, v_team_id, 'vacation_end', now(),
          p_created_by, jsonb_build_object('absenceId', v_absence.id)
        ) returning id into v_result_id;
      end if;
    end loop;

    insert into bluecore_v2.team_memberships (
      team_id, employee_id, role_id, started_at, is_active, created_by
    ) select
      v_pool_team_id,
      v_absence.replacement_employee_id,
      nullif(v_absence.metadata->>'replacementPoolRoleId', '')::uuid,
      current_date,
      true,
      p_created_by
    where not exists (
      select 1 from bluecore_v2.team_memberships
      where team_id = v_pool_team_id
        and employee_id = v_absence.replacement_employee_id
        and is_active
    )
    on conflict (team_id, employee_id, started_at) do update set
      role_id = excluded.role_id,
      ended_at = null,
      is_active = true,
      updated_at = now();
  end if;

  return coalesce(v_result_id, v_absence.id);
end;
$$;

revoke all on function bluecore_v2.manage_employee_movement(text,uuid,uuid,uuid,uuid,uuid) from public;
grant execute on function bluecore_v2.manage_employee_movement(text,uuid,uuid,uuid,uuid,uuid) to service_role;

commit;

begin;

create or replace function bluecore_v2.update_employee_with_assignments(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_employee_id uuid;
  v_role_id uuid;
  v_current_role_id uuid;
  v_team_id uuid;
  v_current_team_id uuid;
  v_identifier text := nullif(btrim(p_payload->>'employeeId'), '');
  v_role_code text := upper(nullif(btrim(p_payload->>'roleCode'), ''));
  v_team_code text := nullif(btrim(p_payload->>'teamCode'), '');
  v_created_by uuid := nullif(p_payload->>'createdBy', '')::uuid;
  v_effective_date date := coalesce(nullif(p_payload->>'effectiveDate', '')::date, current_date);
begin
  if v_identifier is null then
    raise exception 'Employee identifier is required';
  end if;

  select employee.id
    into v_employee_id
  from bluecore_v2.employees employee
  where employee.id::text = v_identifier
     or employee.employee_code = v_identifier
  order by (employee.id::text = v_identifier) desc
  limit 1
  for update;

  if not found then
    raise exception 'Employee % does not exist', v_identifier;
  end if;

  if p_payload ? 'email'
    and nullif(btrim(p_payload->>'email'), '') is null then
    raise exception 'Employee email cannot be empty';
  end if;

  update bluecore_v2.employees
  set
    full_name = case
      when p_payload ? 'fullName' then coalesce(nullif(btrim(p_payload->>'fullName'), ''), full_name)
      else full_name
    end,
    email = case
      when p_payload ? 'email' then lower(btrim(p_payload->>'email'))
      else email
    end,
    status = case
      when p_payload ? 'status' then p_payload->>'status'
      else status
    end,
    terminated_at = case
      when p_payload->>'status' = 'inactive' then coalesce(terminated_at, v_effective_date)
      when p_payload->>'status' = 'active' then null
      else terminated_at
    end,
    updated_at = now()
  where id = v_employee_id;

  if v_role_code is not null then
    select role.id into v_role_id
    from bluecore_v2.roles role
    where role.code = v_role_code;

    if not found then
      raise exception 'Role code % does not exist', v_role_code;
    end if;

    select assignment.role_id into v_current_role_id
    from bluecore_v2.employee_roles assignment
    where assignment.employee_id = v_employee_id
      and assignment.ended_at is null
    order by assignment.is_primary desc, assignment.started_at desc
    limit 1;

    if v_current_role_id is distinct from v_role_id then
      update bluecore_v2.employee_roles
      set ended_at = v_effective_date, is_primary = false, updated_at = now()
      where employee_id = v_employee_id and ended_at is null;

      insert into bluecore_v2.employee_roles (
        employee_id, role_id, started_at, is_primary
      ) values (
        v_employee_id, v_role_id, v_effective_date, true
      )
      on conflict (employee_id, role_id, started_at) do update
      set ended_at = null, is_primary = true, updated_at = now();

      update bluecore_v2.team_memberships
      set role_id = v_role_id, updated_at = now()
      where employee_id = v_employee_id and is_active = true;
    end if;
  end if;

  if p_payload ? 'teamCode' then
    if v_team_code is not null then
      select team.id into v_team_id
      from bluecore_v2.teams team
      where lower(team.code) = lower(v_team_code);

      if not found then
        raise exception 'Team code % does not exist', v_team_code;
      end if;
    end if;

    if v_team_id is not null and not exists (
      select 1 from bluecore_v2.team_memberships
      where employee_id = v_employee_id
        and team_id = v_team_id
        and is_active
    ) then
      select role_id into v_role_id
      from bluecore_v2.employee_roles
      where employee_id = v_employee_id and ended_at is null
      order by is_primary desc, started_at desc
      limit 1;

      insert into bluecore_v2.team_memberships (
        team_id, employee_id, role_id, started_at, is_active, created_by
      ) values (
        v_team_id, v_employee_id, v_role_id, v_effective_date, true, v_created_by
      )
      on conflict (team_id, employee_id, started_at) do update
      set
        role_id = excluded.role_id,
        ended_at = null,
        is_active = true,
        created_by = coalesce(excluded.created_by, bluecore_v2.team_memberships.created_by),
        updated_at = now();
    end if;
  end if;

  return v_employee_id;
end;
$$;

revoke all on function bluecore_v2.update_employee_with_assignments(jsonb) from public;
grant execute on function bluecore_v2.update_employee_with_assignments(jsonb) to service_role;

commit;
