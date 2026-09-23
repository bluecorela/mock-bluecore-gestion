begin;

alter table bluecore_v2.team_initiatives
  add column if not exists team_id uuid references bluecore_v2.teams(id);
alter table bluecore_v2.team_initiatives
  alter column weekly_report_id drop not null;
alter table bluecore_v2.team_initiatives
  drop constraint if exists team_initiatives_status_check;
alter table bluecore_v2.team_initiatives
  add constraint team_initiatives_status_check
  check (status in ('planned','in_progress','requires_attention','at_risk','completed','cancelled'));
alter table bluecore_v2.sprints
  add column if not exists objective text;

create table if not exists bluecore_v2.sprint_initiatives (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references bluecore_v2.sprints(id) on delete cascade,
  initiative_id uuid references bluecore_v2.team_initiatives(id) on delete set null,
  name text not null,
  description text,
  start_date date not null,
  planned_end_date date,
  actual_end_date date,
  progress_percentage numeric(5,2) not null default 0 check (progress_percentage between 0 and 100),
  status text not null default 'planned' check (status in ('planned','in_progress','requires_attention','at_risk','completed','cancelled')),
  owner_id uuid references bluecore_v2.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end_date is null or planned_end_date >= start_date),
  check (actual_end_date is null or actual_end_date >= start_date)
);

create table if not exists bluecore_v2.sprint_user_stories (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references bluecore_v2.sprints(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'planned' check (status in ('planned','in_progress','blocked','completed')),
  story_points numeric(10,2) not null default 0 check (story_points >= 0),
  estimated_work_days numeric(10,2) check (estimated_work_days >= 0),
  assigned_employee_id uuid references bluecore_v2.employees(id),
  carried_from_sprint_id uuid references bluecore_v2.sprints(id) on delete set null,
  carried_from_story_id uuid references bluecore_v2.sprint_user_stories(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sprint_id, code)
);

create table if not exists bluecore_v2.sprint_bugs (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references bluecore_v2.sprints(id) on delete cascade,
  code text not null,
  type text not null check (type in ('bug','return')),
  description text not null,
  story_id uuid references bluecore_v2.sprint_user_stories(id) on delete set null,
  priority text not null check (priority in ('low','medium','high','critical')),
  detected_at date not null,
  responsible_employee_id uuid references bluecore_v2.employees(id),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  environment text check (environment in ('development','qa','production')),
  observations text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sprint_id, code)
);

create table if not exists bluecore_v2.sprint_risks (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references bluecore_v2.sprints(id) on delete cascade,
  code text not null,
  description text not null,
  impact text not null check (impact in ('low','medium','high','critical')),
  probability text check (probability in ('low','medium','high')),
  responsible_employee_id uuid references bluecore_v2.employees(id),
  responsible_name text,
  status text not null default 'open' check (status in ('open','at_risk','monitoring','resolved','accepted','cancelled')),
  mitigation_plan text,
  due_date date,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sprint_id, code)
);

create table if not exists bluecore_v2.sprint_user_story_transfers (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references bluecore_v2.sprint_user_stories(id) on delete cascade,
  source_sprint_id uuid not null references bluecore_v2.sprints(id),
  target_sprint_id uuid not null references bluecore_v2.sprints(id),
  created_at timestamptz not null default now(),
  unique (story_id, source_sprint_id, target_sprint_id),
  check (source_sprint_id <> target_sprint_id)
);

create index if not exists ix_sprint_initiatives_sprint on bluecore_v2.sprint_initiatives(sprint_id);
create index if not exists ix_sprint_stories_sprint_status on bluecore_v2.sprint_user_stories(sprint_id,status);
create index if not exists ix_sprint_bugs_sprint_status on bluecore_v2.sprint_bugs(sprint_id,status);
create index if not exists ix_sprint_risks_sprint_status on bluecore_v2.sprint_risks(sprint_id,status);
create index if not exists ix_team_initiatives_team_status on bluecore_v2.team_initiatives(team_id,status);

create table if not exists bluecore_v2.sequence_counters (
  counter_key text primary key,
  next_value bigint not null check (next_value > 0),
  updated_at timestamptz not null default now()
);

create or replace function bluecore_v2.next_sprint_number(p_team_id uuid)
returns integer
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_number bigint;
begin
  insert into bluecore_v2.sequence_counters(counter_key,next_value)
  select 'sprint:' || p_team_id::text, coalesce(max(sprint_number),0)+1
  from bluecore_v2.sprints where team_id=p_team_id
  on conflict(counter_key) do update
    set next_value=greatest(bluecore_v2.sequence_counters.next_value+1,excluded.next_value),
        updated_at=now()
  returning next_value into v_number;
  return v_number::integer;
end;
$$;

create or replace function bluecore_v2.next_sprint_item_code(
  p_table text,
  p_prefix text
) returns text
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_number bigint;
  v_existing bigint;
begin
  if p_table not in ('sprint_user_stories','sprint_bugs','sprint_risks') then
    raise exception 'Invalid sprint item table';
  end if;
  execute format(
    'select coalesce(max((regexp_match(code,$1))[1]::bigint),0) from bluecore_v2.%I where code ~ $2',
    p_table
  ) into v_existing using '^' || p_prefix || '-([0-9]+)$', '^' || p_prefix || '-[0-9]+$';
  insert into bluecore_v2.sequence_counters(counter_key,next_value)
  values('item:' || p_table || ':' || upper(p_prefix),v_existing+1)
  on conflict(counter_key) do update
    set next_value=greatest(bluecore_v2.sequence_counters.next_value+1,excluded.next_value),
        updated_at=now()
  returning next_value into v_number;
  return upper(p_prefix) || '-' || v_number::text;
end;
$$;

-- PostgreSQL cannot use CREATE OR REPLACE when the existing view has a
-- different column order or names. This view contains no persisted data.
drop view if exists bluecore_v2.sprint_dashboard;

create view bluecore_v2.sprint_dashboard as
select
  sprint.id as sprint_id,
  sprint.team_id,
  sprint.project_id,
  sprint.sprint_number,
  sprint.name,
  sprint.objective,
  sprint.status,
  sprint.start_date,
  sprint.end_date,
  0::bigint as planned_history_count,
  0::bigint as in_progress_history_count,
  0::bigint as blocked_history_count,
  0::bigint as completed_history_count,
  sprint.committed_points,
  sprint.completed_points,
  sprint.wip_stories,
  sprint.scrum_master_id,
  sprint.architect_id,
  story.stories_total,
  story.stories_planned,
  story.stories_in_progress,
  story.stories_completed,
  story.stories_blocked,
  story.story_points_total,
  story.story_points_completed,
  bug.bugs_total,
  bug.bugs_open,
  bug.bugs_resolved,
  bug.bugs_critical,
  bug.returns_total,
  bug.production_bugs,
  risk.risks_active,
  risk.risks_high_impact,
  case when sprint.committed_points > 0
    then round(least(100, sprint.completed_points * 100 / sprint.committed_points),2)
    else 0 end as completion_percentage
from bluecore_v2.sprints sprint
cross join lateral (
  select
    count(*) as stories_total,
    count(*) filter (where status='planned') as stories_planned,
    count(*) filter (where status='in_progress') as stories_in_progress,
    count(*) filter (where status='completed') as stories_completed,
    count(*) filter (where status='blocked') as stories_blocked,
    coalesce(sum(story_points),0) as story_points_total,
    coalesce(sum(story_points) filter (where status='completed'),0) as story_points_completed
  from bluecore_v2.sprint_user_stories where sprint_id=sprint.id
) story
cross join lateral (
  select
    count(*) as bugs_total,
    count(*) filter (where status in ('open','in_progress')) as bugs_open,
    count(*) filter (where status in ('resolved','closed')) as bugs_resolved,
    count(*) filter (where priority='critical') as bugs_critical,
    count(*) filter (where type='return') as returns_total,
    count(*) filter (where environment='production') as production_bugs
  from bluecore_v2.sprint_bugs where sprint_id=sprint.id
) bug
cross join lateral (
  select
    count(*) filter (where status in ('open','at_risk','monitoring')) as risks_active,
    count(*) filter (where impact in ('high','critical') and status in ('open','at_risk','monitoring')) as risks_high_impact
  from bluecore_v2.sprint_risks where sprint_id=sprint.id
) risk;

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
  if found then
    return v_story;
  end if;
  perform 1 from bluecore_v2.sprints
  where id in (p_source_sprint_id,p_target_sprint_id)
    and team_id = p_team_id
    and status in ('planned','in_progress')
  for update;
  if (select count(*) from bluecore_v2.sprints where id in (p_source_sprint_id,p_target_sprint_id) and team_id=p_team_id and status in ('planned','in_progress')) <> 2 then
    raise exception 'Source or target sprint is not writable';
  end if;
  update bluecore_v2.sprint_user_stories
  set sprint_id=p_target_sprint_id, carried_from_sprint_id=p_source_sprint_id, updated_at=now()
  where id=p_story_id and sprint_id=p_source_sprint_id
  returning * into v_story;
  if not found then raise exception 'User story not found'; end if;
  insert into bluecore_v2.sprint_user_story_transfers(story_id,source_sprint_id,target_sprint_id)
  values(v_story.id,p_source_sprint_id,p_target_sprint_id);
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
  if v_sprint.status = 'completed' then return v_sprint; end if;
  if v_sprint.status <> 'in_progress' then raise exception 'Sprint is not in progress'; end if;
  if current_date < v_sprint.end_date then raise exception 'Sprint cannot be closed before %', v_sprint.end_date; end if;

  if exists(select 1 from bluecore_v2.sprint_user_stories where sprint_id=p_sprint_id and status in ('planned','in_progress','blocked')) then
    select * into v_next from bluecore_v2.sprints
    where team_id=p_team_id and project_id=v_sprint.project_id and status='planned'
      and sprint_number>v_sprint.sprint_number
    order by sprint_number limit 1 for update;
    if not found then raise exception 'A planned next sprint is required for pending stories'; end if;

    with copies as (
      insert into bluecore_v2.sprint_user_stories(
        sprint_id,code,name,description,status,story_points,estimated_work_days,
        assigned_employee_id,carried_from_sprint_id,carried_from_story_id
      )
      select v_next.id,s.code,s.name,s.description,s.status,s.story_points,s.estimated_work_days,
        s.assigned_employee_id,p_sprint_id,s.id
      from bluecore_v2.sprint_user_stories s
      where s.sprint_id=p_sprint_id and s.status in ('planned','in_progress','blocked')
      on conflict (sprint_id,code) do nothing
      returning id
    )
    insert into bluecore_v2.sprint_user_story_transfers(story_id,source_sprint_id,target_sprint_id)
    select id,p_sprint_id,v_next.id from copies
    on conflict do nothing;
  end if;

  update bluecore_v2.sprints
  set status='completed', closed_at=now(),
    completed_points=coalesce((select sum(story_points) from bluecore_v2.sprint_user_stories where sprint_id=p_sprint_id and status='completed'),0),
    wip_stories=(select count(*) from bluecore_v2.sprint_user_stories where sprint_id=p_sprint_id),
    updated_at=now()
  where id=p_sprint_id returning * into v_result;
  return v_result;
end;
$$;

create or replace function bluecore_v2.create_sprint_initiative(
  p_team_id uuid,
  p_sprint_id uuid,
  p_payload jsonb
) returns bluecore_v2.sprint_initiatives
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_sprint bluecore_v2.sprints;
  v_master_id uuid;
  v_result bluecore_v2.sprint_initiatives;
begin
  select * into v_sprint from bluecore_v2.sprints
  where id=p_sprint_id and team_id=p_team_id and status in ('planned','in_progress')
  for update;
  if not found then raise exception 'Sprint is not writable'; end if;

  select id into v_master_id from bluecore_v2.team_initiatives
  where team_id=p_team_id
    and project_id is not distinct from v_sprint.project_id
    and lower(name)=lower(p_payload->>'name')
    and status not in ('completed','cancelled')
  order by created_at desc limit 1 for update;

  if v_master_id is null then
    insert into bluecore_v2.team_initiatives(
      team_id,project_id,name,description,start_date,planned_end_date,
      actual_end_date,progress_percentage,status,owner_id
    ) values (
      p_team_id,v_sprint.project_id,p_payload->>'name',p_payload->>'description',
      (p_payload->>'start_date')::date,nullif(p_payload->>'planned_end_date','')::date,
      nullif(p_payload->>'actual_end_date','')::date,
      coalesce((p_payload->>'progress_percentage')::numeric,0),
      coalesce(p_payload->>'status','planned'),
      nullif(p_payload->>'owner_id','')::uuid
    ) returning id into v_master_id;
  end if;

  insert into bluecore_v2.sprint_initiatives(
    sprint_id,initiative_id,name,description,start_date,planned_end_date,
    actual_end_date,progress_percentage,status,owner_id
  ) values (
    p_sprint_id,v_master_id,p_payload->>'name',p_payload->>'description',
    (p_payload->>'start_date')::date,nullif(p_payload->>'planned_end_date','')::date,
    nullif(p_payload->>'actual_end_date','')::date,
    coalesce((p_payload->>'progress_percentage')::numeric,0),
    coalesce(p_payload->>'status','planned'),
    nullif(p_payload->>'owner_id','')::uuid
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function bluecore_v2.update_sprint_initiative(
  p_team_id uuid,
  p_sprint_id uuid,
  p_item_id uuid,
  p_payload jsonb
) returns bluecore_v2.sprint_initiatives
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_item bluecore_v2.sprint_initiatives;
  v_result bluecore_v2.sprint_initiatives;
begin
  perform 1 from bluecore_v2.sprints
  where id=p_sprint_id and team_id=p_team_id and status in ('planned','in_progress')
  for update;
  if not found then raise exception 'Sprint is not writable'; end if;
  select * into v_item from bluecore_v2.sprint_initiatives
  where id=p_item_id and sprint_id=p_sprint_id for update;
  if not found then raise exception 'Sprint initiative not found'; end if;

  if v_item.initiative_id is not null then
    update bluecore_v2.team_initiatives set
      name=case when p_payload?'name' then p_payload->>'name' else name end,
      description=case when p_payload?'description' then p_payload->>'description' else description end,
      start_date=case when p_payload?'start_date' then (p_payload->>'start_date')::date else start_date end,
      planned_end_date=case when p_payload?'planned_end_date' then nullif(p_payload->>'planned_end_date','')::date else planned_end_date end,
      actual_end_date=case when p_payload?'actual_end_date' then nullif(p_payload->>'actual_end_date','')::date else actual_end_date end,
      progress_percentage=case when p_payload?'progress_percentage' then (p_payload->>'progress_percentage')::numeric else progress_percentage end,
      status=case when p_payload?'status' then p_payload->>'status' else status end,
      owner_id=case when p_payload?'owner_id' then nullif(p_payload->>'owner_id','')::uuid else owner_id end,
      updated_at=now()
    where id=v_item.initiative_id;
  end if;

  update bluecore_v2.sprint_initiatives set
    name=case when p_payload?'name' then p_payload->>'name' else name end,
    description=case when p_payload?'description' then p_payload->>'description' else description end,
    start_date=case when p_payload?'start_date' then (p_payload->>'start_date')::date else start_date end,
    planned_end_date=case when p_payload?'planned_end_date' then nullif(p_payload->>'planned_end_date','')::date else planned_end_date end,
    actual_end_date=case when p_payload?'actual_end_date' then nullif(p_payload->>'actual_end_date','')::date else actual_end_date end,
    progress_percentage=case when p_payload?'progress_percentage' then (p_payload->>'progress_percentage')::numeric else progress_percentage end,
    status=case when p_payload?'status' then p_payload->>'status' else status end,
    owner_id=case when p_payload?'owner_id' then nullif(p_payload->>'owner_id','')::uuid else owner_id end,
    updated_at=now()
  where id=p_item_id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function bluecore_v2.move_sprint_story(uuid,uuid,uuid,uuid) from public;
revoke all on function bluecore_v2.complete_sprint(uuid,uuid) from public;
revoke all on function bluecore_v2.next_sprint_number(uuid) from public;
revoke all on function bluecore_v2.next_sprint_item_code(text,text) from public;
revoke all on function bluecore_v2.create_sprint_initiative(uuid,uuid,jsonb) from public;
revoke all on function bluecore_v2.update_sprint_initiative(uuid,uuid,uuid,jsonb) from public;
grant execute on function bluecore_v2.move_sprint_story(uuid,uuid,uuid,uuid) to service_role;
grant execute on function bluecore_v2.complete_sprint(uuid,uuid) to service_role;
grant execute on function bluecore_v2.next_sprint_number(uuid) to service_role;
grant execute on function bluecore_v2.next_sprint_item_code(text,text) to service_role;
grant execute on function bluecore_v2.create_sprint_initiative(uuid,uuid,jsonb) to service_role;
grant execute on function bluecore_v2.update_sprint_initiative(uuid,uuid,uuid,jsonb) to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sprint_initiatives',
    'sprint_user_stories',
    'sprint_bugs',
    'sprint_risks'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname=format('trg_%s_updated_at',v_table)
        and tgrelid=format('bluecore_v2.%I',v_table)::regclass
        and not tgisinternal
    ) then
      execute format(
        'create trigger trg_%I_updated_at before update on bluecore_v2.%I for each row execute function bluecore_v2.set_updated_at()',
        v_table,
        v_table
      );
    end if;
  end loop;
end $$;

alter table bluecore_v2.sprint_initiatives enable row level security;
alter table bluecore_v2.sprint_user_stories enable row level security;
alter table bluecore_v2.sprint_bugs enable row level security;
alter table bluecore_v2.sprint_risks enable row level security;
alter table bluecore_v2.sprint_user_story_transfers enable row level security;
alter table bluecore_v2.sequence_counters enable row level security;

grant select,insert,update,delete on
  bluecore_v2.sprint_initiatives,
  bluecore_v2.sprint_user_stories,
  bluecore_v2.sprint_bugs,
  bluecore_v2.sprint_risks,
  bluecore_v2.sprint_user_story_transfers,
  bluecore_v2.sequence_counters
to service_role;
grant select on bluecore_v2.sprint_dashboard to service_role;

commit;
