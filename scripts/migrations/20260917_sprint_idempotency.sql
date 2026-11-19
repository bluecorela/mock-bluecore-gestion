begin;

create or replace function bluecore_v2.move_sprint_story(
  p_team_id uuid,
  p_source_sprint_id uuid,
  p_story_id uuid,
  p_target_sprint_id uuid
) returns bluecore_v2.sprint_user_stories
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_story bluecore_v2.sprint_user_stories;
begin
  if p_source_sprint_id = p_target_sprint_id then
    raise exception 'Source and target sprint must be different';
  end if;
  if (
    select count(*) from bluecore_v2.sprints
    where id in (p_source_sprint_id,p_target_sprint_id) and team_id=p_team_id
  ) <> 2 then
    raise exception 'Source or target sprint does not belong to the team';
  end if;
  select * into v_story from bluecore_v2.sprint_user_stories
  where id=p_story_id
    and sprint_id=p_target_sprint_id
    and carried_from_sprint_id=p_source_sprint_id;
  if found then return v_story; end if;

  perform 1 from bluecore_v2.sprints
  where id in (p_source_sprint_id,p_target_sprint_id)
    and team_id=p_team_id
    and status in ('planned','in_progress')
  for update;
  if (
    select count(*) from bluecore_v2.sprints
    where id in (p_source_sprint_id,p_target_sprint_id)
      and team_id=p_team_id
      and status in ('planned','in_progress')
  ) <> 2 then
    raise exception 'Source or target sprint is not writable';
  end if;
  update bluecore_v2.sprint_user_stories
  set sprint_id=p_target_sprint_id,
      carried_from_sprint_id=p_source_sprint_id,
      updated_at=now()
  where id=p_story_id and sprint_id=p_source_sprint_id
  returning * into v_story;
  if not found then raise exception 'User story not found'; end if;
  insert into bluecore_v2.sprint_user_story_transfers(
    story_id,source_sprint_id,target_sprint_id
  ) values (
    v_story.id,p_source_sprint_id,p_target_sprint_id
  ) on conflict do nothing;
  return v_story;
end;
$$;

create or replace function bluecore_v2.complete_sprint(
  p_team_id uuid,
  p_sprint_id uuid
) returns bluecore_v2.sprints
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_sprint bluecore_v2.sprints;
  v_next bluecore_v2.sprints;
  v_result bluecore_v2.sprints;
begin
  select * into v_sprint from bluecore_v2.sprints
  where id=p_sprint_id and team_id=p_team_id for update;
  if not found then raise exception 'Sprint not found'; end if;
  if v_sprint.status='completed' then return v_sprint; end if;
  if v_sprint.status<>'in_progress' then raise exception 'Sprint is not in progress'; end if;
  if current_date<v_sprint.end_date then
    raise exception 'Sprint cannot be closed before %',v_sprint.end_date;
  end if;

  if exists(
    select 1 from bluecore_v2.sprint_user_stories
    where sprint_id=p_sprint_id and status in ('planned','in_progress','blocked')
  ) then
    select * into v_next from bluecore_v2.sprints
    where team_id=p_team_id
      and project_id=v_sprint.project_id
      and status='planned'
      and sprint_number>v_sprint.sprint_number
    order by sprint_number limit 1 for update;
    if not found then
      raise exception 'A planned next sprint is required for pending stories';
    end if;

    with copies as (
      insert into bluecore_v2.sprint_user_stories(
        sprint_id,code,name,description,status,story_points,estimated_work_days,
        assigned_employee_id,carried_from_sprint_id,carried_from_story_id
      )
      select
        v_next.id,s.code,s.name,s.description,s.status,s.story_points,
        s.estimated_work_days,s.assigned_employee_id,p_sprint_id,s.id
      from bluecore_v2.sprint_user_stories s
      where s.sprint_id=p_sprint_id
        and s.status in ('planned','in_progress','blocked')
      on conflict(sprint_id,code) do nothing
      returning id
    )
    insert into bluecore_v2.sprint_user_story_transfers(
      story_id,source_sprint_id,target_sprint_id
    )
    select id,p_sprint_id,v_next.id from copies
    on conflict do nothing;
  end if;

  update bluecore_v2.sprints
  set status='completed',
      closed_at=now(),
      completed_points=coalesce((
        select sum(story_points) from bluecore_v2.sprint_user_stories
        where sprint_id=p_sprint_id and status='completed'
      ),0),
      wip_stories=(
        select count(*) from bluecore_v2.sprint_user_stories
        where sprint_id=p_sprint_id
      ),
      updated_at=now()
  where id=p_sprint_id
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function bluecore_v2.move_sprint_story(uuid,uuid,uuid,uuid) from public;
revoke all on function bluecore_v2.complete_sprint(uuid,uuid) from public;
grant execute on function bluecore_v2.move_sprint_story(uuid,uuid,uuid,uuid) to service_role;
grant execute on function bluecore_v2.complete_sprint(uuid,uuid) to service_role;

commit;
