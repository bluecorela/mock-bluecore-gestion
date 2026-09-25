begin;

-- Resolve the evaluated employee by server-selected ID within the requested team.
create or replace function bluecore_v2.save_sprint_evaluation(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_team_id uuid;
  v_sprint_id uuid;
  v_employee_id uuid;
  v_evaluator_id uuid;
  v_sprint_number integer := nullif(p_payload->>'sprintNumber', '')::integer;
  v_expected integer;
  v_completed integer;
  v_closed boolean;
begin
  select team.id into v_team_id
  from bluecore_v2.teams team
  where lower(team.code) = lower(nullif(btrim(p_payload->>'teamCode'), ''));
  if not found then raise exception 'Team % does not exist', p_payload->>'teamCode'; end if;

  select employee.id into v_employee_id
  from bluecore_v2.employees employee
  join bluecore_v2.team_memberships membership
    on membership.employee_id = employee.id
   and membership.team_id = v_team_id
   and membership.is_active = true
  where employee.id = nullif(p_payload->>'employeeId', '')::uuid
    and employee.deleted_at is null;
  if not found then raise exception 'Employee % does not exist', p_payload->>'employeeName'; end if;

  select employee.id into v_evaluator_id
  from bluecore_v2.employees employee
  where lower(employee.email) = lower(nullif(btrim(p_payload->>'evaluatorEmail'), ''))
    and employee.deleted_at is null;
  if not found then raise exception 'Evaluator % does not exist', p_payload->>'evaluatorEmail'; end if;

  insert into bluecore_v2.sprints (
    team_id, sprint_number, name, start_date, end_date, status
  ) values (
    v_team_id,
    v_sprint_number,
    coalesce(nullif(p_payload->>'sprintId', ''), 'sprint-' || v_sprint_number),
    (p_payload->>'startDate')::date,
    (p_payload->>'endDate')::date,
    'in_progress'
  )
  on conflict (team_id, sprint_number) do update
  set
    name = excluded.name,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    updated_at = now()
  returning id into v_sprint_id;

  insert into bluecore_v2.sprint_member_metrics (
    sprint_id, employee_id, assigned_tasks, delivered_tasks, returned_tasks,
    code_quality_score, component_1_score, component_2_score, component_3_score,
    final_score, rating, comments, evaluated_by, evaluated_at
  ) values (
    v_sprint_id,
    v_employee_id,
    coalesce((p_payload->'metrics'->>'assignedTasks')::integer, 0),
    coalesce(
      (p_payload->'metrics'->>'deliveredTasks')::integer,
      (p_payload->'metrics'->>'deliveredTasksAlternative')::integer,
      0
    ),
    coalesce((p_payload->'metrics'->>'returnedTasks')::integer, 0),
    nullif(p_payload->'metrics'->>'codeQuality', '')::numeric,
    nullif(p_payload->'metrics'->>'total1', '')::numeric,
    nullif(p_payload->'metrics'->>'total2', '')::numeric,
    nullif(p_payload->'metrics'->>'total3', '')::numeric,
    (p_payload->>'finalScore')::numeric,
    nullif(p_payload->>'ratingLabel', ''),
    nullif(p_payload->>'comments', ''),
    v_evaluator_id,
    now()
  )
  on conflict (sprint_id, employee_id) do update
  set
    assigned_tasks = excluded.assigned_tasks,
    delivered_tasks = excluded.delivered_tasks,
    returned_tasks = excluded.returned_tasks,
    code_quality_score = excluded.code_quality_score,
    component_1_score = excluded.component_1_score,
    component_2_score = excluded.component_2_score,
    component_3_score = excluded.component_3_score,
    final_score = excluded.final_score,
    rating = excluded.rating,
    comments = excluded.comments,
    evaluated_by = excluded.evaluated_by,
    evaluated_at = excluded.evaluated_at,
    updated_at = now();

  select count(distinct membership.employee_id) into v_expected
  from bluecore_v2.team_memberships membership
  left join bluecore_v2.roles role on role.id = membership.role_id
  where membership.team_id = v_team_id
    and membership.is_active = true
    and coalesce(role.code, '') <> 'ARCHITECT'
    and not exists (
      select 1 from bluecore_v2.employee_absences absence
      where absence.employee_id = membership.employee_id and absence.status = 'active'
    );

  select count(*) into v_completed
  from bluecore_v2.sprint_member_metrics metric
  where metric.sprint_id = v_sprint_id;

  v_closed := v_expected > 0 and v_completed >= v_expected;
  update bluecore_v2.sprints
  set
    status = case when v_closed then 'completed' else 'in_progress' end,
    closed_at = case when v_closed then coalesce(closed_at, now()) else null end,
    updated_at = now()
  where id = v_sprint_id;

  return jsonb_build_object(
    'sprintId', v_sprint_id,
    'sprintClosed', v_closed,
    'evaluatedMembers', v_completed,
    'expectedMembers', v_expected
  );
end;
$$;

revoke all on function bluecore_v2.save_sprint_evaluation(jsonb) from public;
grant execute on function bluecore_v2.save_sprint_evaluation(jsonb) to service_role;

commit;
