begin;

create or replace function bluecore_v2.create_sprint_with_stories(
  p_team_id uuid,
  p_payload jsonb,
  p_story_count integer
) returns bluecore_v2.sprints
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_sprint bluecore_v2.sprints;
  v_sprint_number integer;
  v_index integer;
begin
  if p_story_count < 1 or p_story_count > 200 then
    raise exception 'The user story count must be between 1 and 200';
  end if;

  v_sprint_number := bluecore_v2.next_sprint_number(p_team_id);
  insert into bluecore_v2.sprints (
    team_id, project_id, sprint_number, name, objective, start_date, end_date,
    scrum_master_id, architect_id, committed_points, status
  ) values (
    p_team_id,
    (p_payload->>'project_id')::uuid,
    v_sprint_number,
    'Sprint-' || v_sprint_number,
    nullif(p_payload->>'objective', ''),
    (p_payload->>'start_date')::date,
    (p_payload->>'end_date')::date,
    nullif(p_payload->>'scrum_master_id', '')::uuid,
    nullif(p_payload->>'architect_id', '')::uuid,
    coalesce((p_payload->>'committed_points')::numeric, 0),
    'planned'
  ) returning * into v_sprint;

  for v_index in 1..p_story_count loop
    insert into bluecore_v2.sprint_user_stories (
      sprint_id, code, name, description, status, story_points
    ) values (
      v_sprint.id,
      bluecore_v2.next_sprint_item_code('sprint_user_stories', 'HU'),
      'Historia de usuario ' || v_index,
      'Historia de usuario pendiente de definir',
      'planned',
      0
    );
  end loop;

  update bluecore_v2.sprints
  set wip_stories = p_story_count, updated_at = now()
  where id = v_sprint.id
  returning * into v_sprint;

  return v_sprint;
end;
$$;

revoke all on function bluecore_v2.create_sprint_with_stories(uuid,jsonb,integer) from public;
grant execute on function bluecore_v2.create_sprint_with_stories(uuid,jsonb,integer) to service_role;

commit;
