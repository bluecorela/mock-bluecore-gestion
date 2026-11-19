-- Bluecore Gestion v2 - consolidated data migration
-- Run scripts/create-bluecore-v2-schema.sql first.
-- Then run: npm run supabase:v2:migrate -- --apply
-- Finally execute this file in Supabase SQL Editor.


-- Source: add-bluecore-v2-sprint-score-components.sql
begin;

alter table bluecore_v2.sprint_member_metrics
  add column if not exists component_1_score numeric(7,2),
  add column if not exists component_2_score numeric(7,2),
  add column if not exists component_3_score numeric(7,2);

-- Recover the three score components omitted by the initial sprint migration.
update bluecore_v2.sprint_member_metrics target
set
  component_1_score = source_member.total1,
  component_2_score = source_member.total2,
  component_3_score = source_member.total3,
  updated_at = now()
from bluecore_v2.sprints target_sprint
join bluecore_v2.teams target_team
  on target_team.id = target_sprint.team_id
join public.sprints source_sprint
  on source_sprint.team_id = target_team.code
 and source_sprint.firebase_id = target_sprint.name
join public.sprint_members source_member
  on source_member.sprint_id = source_sprint.id
join bluecore_v2.employees employee
  on lower(btrim(employee.full_name)) = lower(btrim(source_member.employee_name))
where target.sprint_id = target_sprint.id
  and target.employee_id = employee.id;

commit;

select
  count(*) as migrated_metrics,
  count(*) filter (
    where component_1_score is not null
       or component_2_score is not null
       or component_3_score is not null
  ) as metrics_with_components,
  count(*) filter (
    where component_1_score is null
      and component_2_score is null
      and component_3_score is null
  ) as metrics_without_components
from bluecore_v2.sprint_member_metrics;


-- Source: migrate-rotation-history-to-v2.sql
begin;

alter table bluecore_v2.team_rotation_events
  add column if not exists source text not null default 'application',
  add column if not exists source_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table bluecore_v2.team_rotation_events
  drop constraint if exists team_rotation_events_source_check;

alter table bluecore_v2.team_rotation_events
  add constraint team_rotation_events_source_check
  check (source in ('application', 'migration', 'import'));

create unique index if not exists uq_team_rotation_events_source_reference
  on bluecore_v2.team_rotation_events(source, source_reference)
  where source_reference is not null;

do $$
declare
  v_unmapped_employees integer;
begin
  select count(*) into v_unmapped_employees
  from public.rotations_history history
  where not exists (
    select 1
    from bluecore_v2.employees employee
    where employee.employee_code = history.employee_id
       or lower(employee.full_name) = lower(history.employee_name)
  );

  if v_unmapped_employees > 0 then
    raise exception 'There are % rotation events whose employee could not be mapped', v_unmapped_employees;
  end if;
end $$;

insert into bluecore_v2.team_rotation_events (
  employee_id,
  from_team_id,
  to_team_id,
  event_type,
  effective_at,
  notes,
  source,
  source_reference,
  metadata
)
select
  employee.id,
  source_team.id,
  destination_team.id,
  case history.type
    when 'rotacion' then 'rotation'
    when 'vacaciones' then 'vacation_start'
    when 'reintegracion' then 'vacation_end'
    when 'cubriendo-vacaciones' then 'assignment'
    else 'rotation'
  end,
  history.date,
  case history.type
    when 'cubriendo-vacaciones' then 'Legacy vacation coverage assignment'
    else null
  end,
  'migration',
  history.id,
  jsonb_build_object(
    'legacyType', history.type,
    'legacyEmployeeId', history.employee_id,
    'employeeName', history.employee_name,
    'fromTeam', history.from_team,
    'fromTeamName', history.from_name_team,
    'toTeam', history.to_team,
    'toTeamName', history.to_name_team,
    'rawData', coalesce(history.raw_data, '{}'::jsonb)
  )
from public.rotations_history history
join lateral (
  select candidate.id
  from bluecore_v2.employees candidate
  where candidate.employee_code = history.employee_id
     or lower(candidate.full_name) = lower(history.employee_name)
  order by (candidate.employee_code = history.employee_id) desc
  limit 1
) employee on true
left join lateral (
  select candidate.id
  from bluecore_v2.teams candidate
  where lower(candidate.code) = lower(history.from_team)
     or lower(candidate.name) = lower(history.from_team)
     or lower(candidate.name) = lower(history.from_name_team)
     or lower(candidate.code) = lower(replace(history.from_team, ' ', '-'))
  limit 1
) source_team on true
left join lateral (
  select candidate.id
  from bluecore_v2.teams candidate
  where lower(candidate.code) = lower(history.to_team)
     or lower(candidate.name) = lower(history.to_team)
     or lower(candidate.name) = lower(history.to_name_team)
     or lower(candidate.code) = lower(replace(history.to_team, ' ', '-'))
     or (
       history.type = 'reintegracion'
       and history.to_team = '?'
       and (
         lower(candidate.code) = lower((
           select vacation.from_team
           from public.rotations_history vacation
           where vacation.employee_id = history.employee_id
             and vacation.type = 'vacaciones'
             and vacation.date <= history.date
           order by vacation.date desc
           limit 1
         ))
         or lower(candidate.name) = lower((
           select coalesce(vacation.from_name_team, vacation.from_team)
           from public.rotations_history vacation
           where vacation.employee_id = history.employee_id
             and vacation.type = 'vacaciones'
             and vacation.date <= history.date
           order by vacation.date desc
           limit 1
         ))
       )
     )
  limit 1
) destination_team on true
on conflict (source, source_reference) where source_reference is not null do nothing;

commit;

select
  count(*) filter (where source = 'migration') as migrated_events,
  count(*) filter (where source = 'migration' and from_team_id is null) as missing_source_team,
  count(*) filter (where source = 'migration' and to_team_id is null) as missing_destination_team,
  count(*) filter (where source = 'migration' and event_type = 'vacation_start') as vacation_starts,
  count(*) filter (where source = 'migration' and event_type = 'vacation_end') as vacation_ends,
  count(*) filter (where source = 'migration' and event_type = 'assignment') as vacation_coverages
from bluecore_v2.team_rotation_events;


-- Source: migrate-vacation-periods-to-v2.sql
begin;

create unique index if not exists uq_employee_absences_source_reference
  on bluecore_v2.employee_absences(source, source_reference)
  where source_reference is not null;

insert into bluecore_v2.employee_absences (
  employee_id,
  team_id,
  absence_type,
  start_date,
  end_date,
  status,
  reason,
  replacement_employee_id,
  source,
  source_reference,
  metadata
)
select
  vacation_start.employee_id,
  vacation_start.from_team_id,
  'vacation',
  vacation_start.effective_at::date,
  vacation_end.effective_at::date,
  case when vacation_end.id is null then 'active' else 'completed' end,
  'Migrated from legacy vacation history',
  coverage.employee_id,
  'migration',
  vacation_start.source_reference,
  jsonb_build_object(
    'vacationStartEventId', vacation_start.id,
    'vacationStartLegacyId', vacation_start.source_reference,
    'vacationStartedAt', vacation_start.effective_at,
    'vacationEndEventId', vacation_end.id,
    'vacationEndLegacyId', vacation_end.source_reference,
    'vacationEndedAt', vacation_end.effective_at,
    'coverageEventId', coverage.id,
    'coverageLegacyId', coverage.source_reference
  )
from bluecore_v2.team_rotation_events vacation_start
left join lateral (
  select candidate.*
  from bluecore_v2.team_rotation_events candidate
  where candidate.employee_id = vacation_start.employee_id
    and candidate.event_type = 'vacation_end'
    and candidate.effective_at >= vacation_start.effective_at
    and (
      candidate.to_team_id = vacation_start.from_team_id
      or candidate.to_team_id is null
    )
    and not exists (
      select 1
      from bluecore_v2.team_rotation_events later_start
      where later_start.employee_id = vacation_start.employee_id
        and later_start.event_type = 'vacation_start'
        and later_start.effective_at > vacation_start.effective_at
        and later_start.effective_at < candidate.effective_at
    )
  order by candidate.effective_at
  limit 1
) vacation_end on true
left join lateral (
  select candidate.*
  from bluecore_v2.team_rotation_events candidate
  where candidate.event_type = 'assignment'
    and candidate.employee_id <> vacation_start.employee_id
    and candidate.to_team_id = vacation_start.from_team_id
    and candidate.effective_at between
      vacation_start.effective_at - interval '10 minutes'
      and vacation_start.effective_at + interval '10 minutes'
  order by abs(extract(epoch from candidate.effective_at - vacation_start.effective_at))
  limit 1
) coverage on true
where vacation_start.event_type = 'vacation_start'
  and vacation_start.source = 'migration'
on conflict (source, source_reference) where source_reference is not null do nothing;

commit;

select
  count(*) filter (where source = 'migration' and absence_type = 'vacation') as migrated_vacations,
  count(*) filter (where source = 'migration' and absence_type = 'vacation' and status = 'completed') as completed_vacations,
  count(*) filter (where source = 'migration' and absence_type = 'vacation' and status = 'active') as active_vacations,
  count(*) filter (
    where source = 'migration'
      and absence_type = 'vacation'
      and replacement_employee_id is not null
  ) as vacations_with_replacement
from bluecore_v2.employee_absences;


-- Source: migrate-evaluation-templates-to-v2.sql
begin;

do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from (values ('performance'), ('one-to-one')) expected(id)
  where not exists (
    select 1
    from public.config_evaluations legacy
    where legacy.id = expected.id
      and coalesce(legacy.raw_data, '{}'::jsonb) <> '{}'::jsonb
  );

  if v_missing > 0 then
    raise exception 'There are % required legacy evaluation configurations missing', v_missing;
  end if;
end $$;

insert into bluecore_v2.evaluation_templates (
  type,
  name,
  is_active
)
values
  ('performance', 'Performance Evaluation', true),
  ('one_to_one', 'One-to-One Evaluation', true)
on conflict (type, name) do update set
  is_active = excluded.is_active,
  updated_at = now();

with legacy_configs as (
  select
    case legacy.id
      when 'performance' then 'performance'
      when 'one-to-one' then 'one_to_one'
    end as template_type,
    case legacy.id
      when 'performance' then 'Performance Evaluation'
      when 'one-to-one' then 'One-to-One Evaluation'
    end as template_name,
    legacy.raw_data as configuration
  from public.config_evaluations legacy
  where legacy.id in ('performance', 'one-to-one')
)
insert into bluecore_v2.evaluation_template_versions (
  template_id,
  version,
  configuration,
  published_at
)
select
  template.id,
  1,
  legacy.configuration,
  now()
from legacy_configs legacy
join bluecore_v2.evaluation_templates template
  on template.type = legacy.template_type
 and template.name = legacy.template_name
on conflict (template_id, version) do update set
  configuration = excluded.configuration,
  published_at = coalesce(
    bluecore_v2.evaluation_template_versions.published_at,
    excluded.published_at
  );

commit;

select
  template.type,
  template.name,
  version.version,
  version.published_at is not null as is_published,
  case template.type
    when 'performance' then jsonb_array_length(version.configuration->'questions')
    when 'one_to_one' then jsonb_array_length(version.configuration->'sections')
  end as configured_sections_or_questions
from bluecore_v2.evaluation_templates template
join bluecore_v2.evaluation_template_versions version
  on version.template_id = template.id
where template.type in ('performance', 'one_to_one')
order by template.type;


-- Source: normalize-evaluation-templates-to-english.sql
begin;

with performance_versions as (
  select
    version.id,
    version.configuration,
    coalesce(version.configuration->'questions', version.configuration->'preguntas', '[]'::jsonb) as questions,
    coalesce(version.configuration->'answers', version.configuration->'respuestas', '{}'::jsonb) as answers
  from bluecore_v2.evaluation_template_versions version
  join bluecore_v2.evaluation_templates template on template.id = version.template_id
  where template.type = 'performance'
    and version.version = 1
),
normalized_performance as (
  select
    source.id,
    (source.configuration - 'preguntas' - 'respuestas') || jsonb_build_object(
      'questions', (
        select coalesce(
          jsonb_agg(
            (question.value - 'clave') || jsonb_build_object(
              'key', coalesce(question.value->'key', question.value->'clave')
            )
            order by question.ordinality
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(source.questions) with ordinality as question(value, ordinality)
      ),
      'answers', (
        select coalesce(jsonb_object_agg(answer.key, normalized.options), '{}'::jsonb)
        from jsonb_each(source.answers) answer
        cross join lateral (
          select coalesce(
            jsonb_agg(
              (option.value - 'valor' - 'descripcion') || jsonb_build_object(
                'value', coalesce(option.value->'value', option.value->'valor'),
                'description', coalesce(option.value->'description', option.value->'descripcion')
              )
              order by option.ordinality
            ),
            '[]'::jsonb
          ) as options
          from jsonb_array_elements(answer.value) with ordinality as option(value, ordinality)
        ) normalized
      ),
      'schemaVersion', 1
    ) as configuration
  from performance_versions source
)
update bluecore_v2.evaluation_template_versions version
set configuration = normalized.configuration
from normalized_performance normalized
where version.id = normalized.id;

with one_to_one_versions as (
  select
    version.id,
    version.configuration,
    coalesce(version.configuration->'sections', version.configuration->'secciones', '[]'::jsonb) as sections
  from bluecore_v2.evaluation_template_versions version
  join bluecore_v2.evaluation_templates template on template.id = version.template_id
  where template.type = 'one_to_one'
    and version.version = 1
),
normalized_one_to_one as (
  select
    source.id,
    (source.configuration - 'secciones') || jsonb_build_object(
      'sections', (
        select coalesce(
          jsonb_agg(
            (section.value - 'tipo' - 'preguntas') || jsonb_build_object(
              'type', coalesce(section.value->'type', section.value->'tipo'),
              'questions', normalized_questions.questions
            )
            order by section.ordinality
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(source.sections) with ordinality as section(value, ordinality)
        cross join lateral (
          select coalesce(
            jsonb_agg(
              (question.value - 'clave' - 'opciones') || jsonb_build_object(
                'key', coalesce(question.value->'key', question.value->'clave'),
                'options', normalized_options.options
              )
              order by question.ordinality
            ),
            '[]'::jsonb
          ) as questions
          from jsonb_array_elements(
            coalesce(section.value->'questions', section.value->'preguntas', '[]'::jsonb)
          ) with ordinality as question(value, ordinality)
          cross join lateral (
            select coalesce(
              jsonb_agg(
                (option.value - 'valor' - 'descripcion') || jsonb_build_object(
                  'value', coalesce(option.value->'value', option.value->'valor'),
                  'description', coalesce(option.value->'description', option.value->'descripcion')
                )
                order by option.ordinality
              ),
              '[]'::jsonb
            ) as options
            from jsonb_array_elements(
              coalesce(question.value->'options', question.value->'opciones', '[]'::jsonb)
            ) with ordinality as option(value, ordinality)
          ) normalized_options
        ) normalized_questions
      ),
      'schemaVersion', 1
    ) as configuration
  from one_to_one_versions source
)
update bluecore_v2.evaluation_template_versions version
set configuration = normalized.configuration
from normalized_one_to_one normalized
where version.id = normalized.id;

commit;

select
  template.type,
  version.version,
  version.configuration ? 'questions' as has_questions,
  version.configuration ? 'answers' as has_answers,
  version.configuration ? 'sections' as has_sections,
  case template.type
    when 'performance' then jsonb_array_length(version.configuration->'questions')
    when 'one_to_one' then jsonb_array_length(version.configuration->'sections')
  end as configured_sections_or_questions
from bluecore_v2.evaluation_templates template
join bluecore_v2.evaluation_template_versions version on version.template_id = template.id
where template.type in ('performance', 'one_to_one')
  and version.version = 1
order by template.type;


-- Source: migrate-performance-cycles-to-v2.sql
begin;

alter table bluecore_v2.performance_cycles
  alter column period_end drop not null,
  add column if not exists source text not null default 'application',
  add column if not exists source_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table bluecore_v2.performance_cycles
  drop constraint if exists performance_cycles_source_check;

alter table bluecore_v2.performance_cycles
  add constraint performance_cycles_source_check
  check (source in ('application', 'migration', 'import'));

create unique index if not exists uq_performance_cycles_source_reference
  on bluecore_v2.performance_cycles(source, source_reference)
  where source_reference is not null;

do $$
declare
  v_unmapped_teams integer;
begin
  select count(*) into v_unmapped_teams
  from public."performance_ qualifications" legacy
  where not exists (
    select 1
    from bluecore_v2.teams team
    where lower(team.code) = lower(legacy.teams_id)
       or lower(team.name) = lower(legacy.teams_name)
  );

  if v_unmapped_teams > 0 then
    raise exception 'There are % performance cycles whose team could not be mapped', v_unmapped_teams;
  end if;
end $$;

insert into bluecore_v2.performance_cycles (
  team_id,
  name,
  period_start,
  period_end,
  status,
  expected_evaluations,
  completed_evaluations,
  enabled_by,
  started_at,
  completed_at,
  source,
  source_reference,
  metadata,
  created_at,
  updated_at
)
select
  team.id,
  format('Legacy Performance Cycle - %s - %s', team.name, legacy.init_date::date),
  legacy.init_date::date,
  case when legacy.status = 'Completado'
    then coalesce(legacy.last_update, legacy.init_date)::date
    else null
  end,
  case legacy.status
    when 'Pendiente' then 'enabled'
    when 'En proceso' then 'in_progress'
    when 'Completado' then 'completed'
    else 'draft'
  end,
  coalesce(legacy."total_ expected", 0),
  coalesce(legacy.evaluated_count, 0),
  administrator.id,
  case when legacy.status in ('En proceso', 'Completado') then legacy.init_date else null end,
  case when legacy.status = 'Completado' then coalesce(legacy.last_update, legacy.init_date) else null end,
  'migration',
  legacy.id,
  jsonb_build_object(
    'legacyStatus', legacy.status,
    'legacyTeamId', legacy.teams_id,
    'legacyTeamName', legacy.teams_name,
    'adminName', legacy.admin_name,
    'rawData', coalesce(legacy.raw_data, '{}'::jsonb)
  ),
  legacy.init_date,
  coalesce(legacy.last_update, legacy.init_date)
from public."performance_ qualifications" legacy
join lateral (
  select candidate.id, candidate.name
  from bluecore_v2.teams candidate
  where lower(candidate.code) = lower(legacy.teams_id)
     or lower(candidate.name) = lower(legacy.teams_name)
  order by (lower(candidate.code) = lower(legacy.teams_id)) desc
  limit 1
) team on true
left join lateral (
  select candidate.id
  from bluecore_v2.employees candidate
  where lower(candidate.full_name) = lower(legacy.admin_name)
  limit 1
) administrator on true
on conflict (source, source_reference) where source_reference is not null do nothing;

commit;

select
  count(*) filter (where source = 'migration') as migrated_cycles,
  count(*) filter (where source = 'migration' and status = 'enabled') as enabled_cycles,
  count(*) filter (where source = 'migration' and status = 'in_progress') as in_progress_cycles,
  count(*) filter (where source = 'migration' and status = 'completed') as completed_cycles,
  count(*) filter (where source = 'migration' and enabled_by is null) as missing_enabled_by
from bluecore_v2.performance_cycles;


-- Source: migrate-performance-evaluations-to-v2.sql
begin;

alter table bluecore_v2.performance_evaluations
  add column if not exists period text,
  add column if not exists source text not null default 'application',
  add column if not exists source_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table bluecore_v2.performance_evaluations
  drop constraint if exists performance_evaluations_source_check;

alter table bluecore_v2.performance_evaluations
  add constraint performance_evaluations_source_check
  check (source in ('application', 'migration', 'import'));

create unique index if not exists uq_performance_evaluations_source_reference
  on bluecore_v2.performance_evaluations(source, source_reference)
  where source_reference is not null;

do $$
declare
  v_unmapped_people integer;
begin
  select count(*) into v_unmapped_people
  from public.performance_evaluaciones legacy
  where not exists (
    select 1 from bluecore_v2.employees employee
    where lower(employee.full_name) = lower(legacy.name_ingineer)
  ) or not exists (
    select 1 from bluecore_v2.employees evaluator
    where lower(evaluator.full_name) = lower(legacy.evaluator_name)
  );

  if v_unmapped_people > 0 then
    raise exception 'There are % performance evaluations with an unmapped employee or evaluator', v_unmapped_people;
  end if;
end $$;

insert into bluecore_v2.performance_evaluations (
  cycle_id,
  team_id,
  employee_id,
  evaluator_id,
  template_version_id,
  evaluation_number,
  period,
  achievements,
  growth_potential,
  additional_observations,
  feedback_confirmed,
  evaluated_at,
  source,
  source_reference,
  metadata,
  created_at,
  updated_at
)
select
  cycle.id,
  team.id,
  employee.id,
  evaluator.id,
  template_version.id,
  legacy.evaluation_number,
  legacy.period,
  legacy.achievements,
  legacy.growth_potential,
  legacy.additional_observations,
  coalesce(legacy.feedback_confirmed, false),
  legacy.date,
  'migration',
  legacy.id,
  jsonb_build_object(
    'legacyFirebaseId', legacy.firebase_id,
    'legacyCollection', legacy.firebase_collection,
    'engineerName', legacy.name_ingineer,
    'evaluatorName', legacy.evaluator_name,
    'rawData', coalesce(legacy.raw_data, '{}'::jsonb)
  ),
  legacy.date,
  legacy.date
from public.performance_evaluaciones legacy
join lateral (
  select candidate.id
  from bluecore_v2.teams candidate
  where lower(candidate.code) = lower(legacy.team_id)
     or lower(candidate.name) = lower(legacy.team_id)
  limit 1
) team on true
join lateral (
  select candidate.id
  from bluecore_v2.performance_cycles candidate
  where candidate.team_id = team.id
    and candidate.period_start <= legacy.date::date
    and (candidate.period_end is null or candidate.period_end >= legacy.date::date)
  order by candidate.period_start desc
  limit 1
) cycle on true
join lateral (
  select candidate.id
  from bluecore_v2.employees candidate
  where lower(candidate.full_name) = lower(legacy.name_ingineer)
  limit 1
) employee on true
join lateral (
  select candidate.id
  from bluecore_v2.employees candidate
  where lower(candidate.full_name) = lower(legacy.evaluator_name)
  limit 1
) evaluator on true
join lateral (
  select version.id
  from bluecore_v2.evaluation_template_versions version
  join bluecore_v2.evaluation_templates template on template.id = version.template_id
  where template.type = 'performance'
    and version.version = 1
  limit 1
) template_version on true
on conflict (source, source_reference) where source_reference is not null do nothing;

insert into bluecore_v2.performance_answers (
  evaluation_id,
  question_key,
  score,
  comment
)
select
  evaluation.id,
  answer.key,
  coalesce((answer.value->>'score')::numeric, (answer.value->>'puntaje')::numeric, 0),
  coalesce(answer.value->>'comment', answer.value->>'comentario', '')
from public.performance_evaluaciones legacy
join bluecore_v2.performance_evaluations evaluation
  on evaluation.source = 'migration'
 and evaluation.source_reference = legacy.id
cross join lateral jsonb_each(
  coalesce(legacy.answere, legacy.raw_data->'answers', legacy.raw_data->'respuestas', '{}'::jsonb)
) answer
on conflict (evaluation_id, question_key) do update set
  score = excluded.score,
  comment = excluded.comment,
  updated_at = now();

commit;

select
  count(distinct evaluation.id) as migrated_evaluations,
  count(answer.id) as migrated_answers,
  count(distinct evaluation.id) filter (where evaluation.cycle_id is null) as missing_cycle,
  count(distinct evaluation.id) filter (where evaluation.template_version_id is null) as missing_template
from bluecore_v2.performance_evaluations evaluation
left join bluecore_v2.performance_answers answer on answer.evaluation_id = evaluation.id
where evaluation.source = 'migration';


-- Source: migrate-one-to-one-sessions-to-v2.sql
begin;

alter table bluecore_v2.one_to_one_sessions
  add column if not exists source text not null default 'application',
  add column if not exists source_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table bluecore_v2.one_to_one_sessions
  drop constraint if exists one_to_one_sessions_source_check;

alter table bluecore_v2.one_to_one_sessions
  add constraint one_to_one_sessions_source_check
  check (source in ('application', 'migration', 'import'));

create unique index if not exists uq_one_to_one_sessions_source_reference
  on bluecore_v2.one_to_one_sessions(source, source_reference)
  where source_reference is not null;

do $$
declare
  v_unmapped_people integer;
begin
  select count(*) into v_unmapped_people
  from public.oto_evaluations legacy
  where not exists (
    select 1 from bluecore_v2.employees employee
    where lower(employee.full_name) = lower(legacy.name_engineer)
  ) or not exists (
    select 1 from bluecore_v2.employees evaluator
    where lower(evaluator.full_name) = lower(legacy.name_evaluator)
  );

  if v_unmapped_people > 0 then
    raise exception 'There are % one-to-one sessions with an unmapped employee or evaluator', v_unmapped_people;
  end if;
end $$;

insert into bluecore_v2.one_to_one_sessions (
  team_id,
  employee_id,
  evaluator_id,
  template_version_id,
  sprint_from_id,
  sprint_to_id,
  evaluation_number,
  period,
  summary,
  final_synthesis,
  reflection_answers,
  soft_skill_answers,
  evaluated_at,
  source,
  source_reference,
  metadata,
  created_at,
  updated_at
)
select
  team.id,
  employee.id,
  evaluator.id,
  template_version.id,
  sprint_from.id,
  sprint_to.id,
  legacy.number_evaluation,
  legacy.period,
  jsonb_build_object(
    'totalAssignedTasks', coalesce(
      legacy.summary->'totalAssignedTasks',
      legacy.summary->'totalTareasAsignadas',
      '0'::jsonb
    ),
    'assignedDeliveredPercentage', coalesce(
      legacy.summary->'assignedDeliveredPercentage',
      legacy.summary->'porcentajeAsignadasEntregadas',
      '0'::jsonb
    ),
    'deliveredReturnedPercentage', coalesce(
      legacy.summary->'deliveredReturnedPercentage',
      legacy.summary->'porcentajeEntregadasDevueltas',
      '0'::jsonb
    ),
    'codeQualityPercentage', coalesce(
      legacy.summary->'codeQualityPercentage',
      legacy.summary->'porcentajeCalidadCodigo',
      '0'::jsonb
    ),
    'averageFinalTotal', coalesce(
      legacy.summary->'averageFinalTotal',
      legacy.summary->'promedioTotalFinal',
      '0'::jsonb
    )
  ),
  coalesce(legacy.final_synthesis, legacy.raw_data->'finalSummary', legacy.raw_data->'sintesisFinal', '{}'::jsonb),
  coalesce(legacy.reflection_questions, legacy.raw_data->'reflectionQuestions', legacy.raw_data->'preguntasReflexion', '{}'::jsonb),
  coalesce(normalized_soft_skills.answers, '{}'::jsonb),
  legacy.date,
  'migration',
  legacy.id,
  jsonb_build_object(
    'legacyFirebaseId', legacy.firebase_id,
    'legacyCollection', legacy.firebase_collection,
    'engineerName', legacy.name_engineer,
    'evaluatorName', legacy.name_evaluator,
    'rawData', coalesce(legacy.raw_data, '{}'::jsonb)
  ),
  legacy.date,
  legacy.date
from public.oto_evaluations legacy
join lateral (
  select candidate.id
  from bluecore_v2.teams candidate
  where lower(candidate.code) = lower(legacy.team_id)
     or lower(candidate.name) = lower(legacy.team_id)
  limit 1
) team on true
join lateral (
  select candidate.id
  from bluecore_v2.employees candidate
  where lower(candidate.full_name) = lower(legacy.name_engineer)
  limit 1
) employee on true
join lateral (
  select candidate.id
  from bluecore_v2.employees candidate
  where lower(candidate.full_name) = lower(legacy.name_evaluator)
  limit 1
) evaluator on true
join lateral (
  select version.id
  from bluecore_v2.evaluation_template_versions version
  join bluecore_v2.evaluation_templates template on template.id = version.template_id
  where template.type = 'one_to_one'
    and version.version = 1
  limit 1
) template_version on true
left join bluecore_v2.sprints sprint_from
  on sprint_from.team_id = team.id
 and sprint_from.sprint_number = nullif(substring(legacy.period from 'Sprint ([0-9]+)'), '')::integer
left join bluecore_v2.sprints sprint_to
  on sprint_to.team_id = team.id
 and sprint_to.sprint_number = nullif(substring(legacy.period from 'al Sprint ([0-9]+)'), '')::integer
left join lateral (
  select jsonb_object_agg(
    skill.key,
    (skill.value - 'calificacion' - 'comentario') || jsonb_build_object(
      'rating', coalesce(skill.value->'rating', skill.value->'calificacion', '0'::jsonb),
      'comment', coalesce(skill.value->'comment', skill.value->'comentario', '""'::jsonb)
    )
  ) as answers
  from jsonb_each(
    coalesce(legacy.soft_skills, legacy.raw_data->'softSkills', legacy.raw_data->'habilidadesBlandas', '{}'::jsonb)
  ) skill
) normalized_soft_skills on true
on conflict (source, source_reference) where source_reference is not null do nothing;

commit;

select
  count(*) as migrated_sessions,
  count(*) filter (where sprint_from_id is null) as missing_sprint_from,
  count(*) filter (where sprint_to_id is null) as missing_sprint_to,
  count(*) filter (where template_version_id is null) as missing_template
from bluecore_v2.one_to_one_sessions
where source = 'migration';


-- Source: migrate-sidebar-and-settings-to-v2.sql
begin;

do $$
declare
  v_unknown_roles text;
begin
  select string_agg(distinct permitted.role_name, ', ')
    into v_unknown_roles
  from public.modules_sidebar legacy
  cross join lateral jsonb_array_elements_text(
    coalesce(to_jsonb(legacy.permitted_roles), '[]'::jsonb)
  ) permitted(role_name)
  where permitted.role_name not in (
    'Admin',
    'Arquitecto',
    'Scrum Master',
    'Ingeniero de Software',
    'Ingeniero de QA',
    'Ingeniero QA',
    'Creador de Bienestar'
  );

  if v_unknown_roles is not null then
    raise exception 'Unknown legacy sidebar roles: %', v_unknown_roles;
  end if;
end $$;

insert into bluecore_v2.sidebar_modules (
  code,
  name,
  route,
  icon,
  display_order,
  is_visible
)
select
  trim(both '_' from upper(regexp_replace(
    coalesce(nullif(legacy.route, ''), legacy.name_module),
    '[^a-zA-Z0-9]+',
    '_',
    'g'
  ))),
  legacy.name_module,
  legacy.route,
  legacy.icon,
  coalesce(legacy."order", 0),
  coalesce(legacy.visible, true)
from public.modules_sidebar legacy
where legacy.route is not null
  and legacy.name_module is not null
on conflict (code) do update set
  name = excluded.name,
  route = excluded.route,
  icon = excluded.icon,
  display_order = excluded.display_order,
  is_visible = excluded.is_visible,
  updated_at = now();

insert into bluecore_v2.sidebar_module_roles (
  module_id,
  role_id
)
select distinct
  module.id,
  role.id
from public.modules_sidebar legacy
join bluecore_v2.sidebar_modules module
  on module.code = trim(both '_' from upper(regexp_replace(
    coalesce(nullif(legacy.route, ''), legacy.name_module),
    '[^a-zA-Z0-9]+',
    '_',
    'g'
  )))
cross join lateral jsonb_array_elements_text(
  coalesce(to_jsonb(legacy.permitted_roles), '[]'::jsonb)
) permitted(role_name)
join bluecore_v2.roles role on role.code = case permitted.role_name
  when 'Admin' then 'ADMIN'
  when 'Arquitecto' then 'ARCHITECT'
  when 'Scrum Master' then 'SCRUM_MASTER'
  when 'Ingeniero de Software' then 'SOFTWARE_ENGINEER'
  when 'Ingeniero de QA' then 'QA_ENGINEER'
  when 'Ingeniero QA' then 'QA_ENGINEER'
  when 'Creador de Bienestar' then 'WELLBEING_CREATOR'
end
where not (
  permitted.role_name = 'Admin'
  and legacy.name_module in ('Gestor de Noticias', 'Documentos')
)
on conflict (module_id, role_id) do nothing;

insert into bluecore_v2.app_settings (
  key,
  value,
  description,
  is_public
)
select
  'maintenance',
  jsonb_build_object('active', coalesce(legacy.active, false)),
  'Controls whether the application is in maintenance mode',
  true
from public.settings legacy
where legacy.id = 'maintenance'
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  is_public = excluded.is_public,
  updated_at = now();

commit;

select
  (select count(*) from bluecore_v2.sidebar_modules) as migrated_modules,
  (select count(*) from bluecore_v2.sidebar_module_roles) as migrated_module_roles,
  (select count(*) from bluecore_v2.app_settings where key = 'maintenance') as migrated_settings,
  (
    select value->>'active'
    from bluecore_v2.app_settings
    where key = 'maintenance'
  ) as maintenance_active;


-- Source: assign-angie-global-bank-scrum-master.sql
begin;

do $$
declare
  v_employee_id uuid;
  v_role_id uuid;
  v_role_started_at date;
  v_assignment_count integer;
begin
  select id
    into v_employee_id
  from bluecore_v2.employees
  where lower(email) = 'abriceno@bluecorela.com'
    and status = 'active'
    and deleted_at is null;

  if v_employee_id is null then
    raise exception 'Active employee Angie Briceño was not found';
  end if;

  select id
    into v_role_id
  from bluecore_v2.roles
  where code = 'SCRUM_MASTER';

  if v_role_id is null then
    raise exception 'SCRUM_MASTER role was not found';
  end if;

  select min(tp.started_at), count(*)
    into v_role_started_at, v_assignment_count
  from bluecore_v2.team_projects tp
  join bluecore_v2.teams t on t.id = tp.team_id
  join bluecore_v2.projects p on p.id = tp.project_id
  join bluecore_v2.clients c on c.id = p.client_id
  where c.code = 'global-bank'
    and p.code = 'global-bank-banca-digital'
    and t.code in ('gb-movil', 'gb-web', 'gb-backoffice');

  if v_assignment_count <> 3 then
    raise exception 'Expected 3 Global Bank team assignments, found %', v_assignment_count;
  end if;

  insert into bluecore_v2.employee_roles (
    employee_id,
    role_id,
    started_at,
    is_primary
  )
  values (
    v_employee_id,
    v_role_id,
    v_role_started_at,
    true
  )
  on conflict (employee_id, role_id, started_at) do nothing;

  insert into bluecore_v2.team_project_memberships (
    team_project_id,
    employee_id,
    role_id,
    started_at
  )
  select
    tp.id,
    v_employee_id,
    v_role_id,
    tp.started_at
  from bluecore_v2.team_projects tp
  join bluecore_v2.teams t on t.id = tp.team_id
  join bluecore_v2.projects p on p.id = tp.project_id
  join bluecore_v2.clients c on c.id = p.client_id
  where c.code = 'global-bank'
    and p.code = 'global-bank-banca-digital'
    and t.code in ('gb-movil', 'gb-web', 'gb-backoffice')
  on conflict (team_project_id, employee_id, role_id, started_at) do nothing;
end $$;

commit;

select
  t.name as team,
  c.name as client,
  p.name as project,
  e.full_name as scrum_master,
  r.name as role,
  tpm.started_at,
  tpm.is_active
from bluecore_v2.team_project_memberships tpm
join bluecore_v2.team_projects tp on tp.id = tpm.team_project_id
join bluecore_v2.teams t on t.id = tp.team_id
join bluecore_v2.projects p on p.id = tp.project_id
join bluecore_v2.clients c on c.id = p.client_id
join bluecore_v2.employees e on e.id = tpm.employee_id
join bluecore_v2.roles r on r.id = tpm.role_id
where lower(e.email) = 'abriceno@bluecorela.com'
  and c.code = 'global-bank'
  and p.code = 'global-bank-banca-digital'
  and r.code = 'SCRUM_MASTER'
order by t.name;


-- Source: assign-global-bank-architects.sql
begin;

do $$
declare
  v_role_id uuid;
  v_employee_id uuid;
  v_team_project_id uuid;
  v_started_at date;
  v_assignment record;
begin
  select id into v_role_id
  from bluecore_v2.roles
  where code = 'ARCHITECT';

  if v_role_id is null then
    raise exception 'ARCHITECT role was not found';
  end if;

  for v_assignment in
    select *
    from (values
      ('gb-web', 'amillan@bluecorela.com'),
      ('gb-movil', 'icornejo@bluecorela.com'),
      ('gb-backoffice', 'olaparicio@bluecorela.com')
    ) as assignments(team_code, employee_email)
  loop
    select id into v_employee_id
    from bluecore_v2.employees
    where lower(email) = lower(v_assignment.employee_email)
      and status = 'active'
      and deleted_at is null;

    if v_employee_id is null then
      raise exception 'Active employee % was not found', v_assignment.employee_email;
    end if;

    select tp.id, tp.started_at
      into v_team_project_id, v_started_at
    from bluecore_v2.team_projects tp
    join bluecore_v2.teams t on t.id = tp.team_id
    join bluecore_v2.projects p on p.id = tp.project_id
    join bluecore_v2.clients c on c.id = p.client_id
    where t.code = v_assignment.team_code
      and c.code = 'global-bank'
      and p.code = 'global-bank-banca-digital'
      and tp.ended_at is null;

    if v_team_project_id is null then
      raise exception 'Active project assignment for team % was not found', v_assignment.team_code;
    end if;

    insert into bluecore_v2.employee_roles (
      employee_id, role_id, started_at, is_primary
    ) values (
      v_employee_id, v_role_id, v_started_at, true
    )
    on conflict (employee_id, role_id, started_at) do nothing;

    insert into bluecore_v2.team_project_memberships (
      team_project_id, employee_id, role_id, started_at
    ) values (
      v_team_project_id, v_employee_id, v_role_id, v_started_at
    )
    on conflict (team_project_id, employee_id, role_id, started_at) do nothing;
  end loop;
end $$;

commit;

select
  t.name as team,
  c.name as client,
  p.name as project,
  e.full_name as architect,
  r.name as role,
  tpm.started_at,
  tpm.is_active
from bluecore_v2.team_project_memberships tpm
join bluecore_v2.team_projects tp on tp.id = tpm.team_project_id
join bluecore_v2.teams t on t.id = tp.team_id
join bluecore_v2.projects p on p.id = tp.project_id
join bluecore_v2.clients c on c.id = p.client_id
join bluecore_v2.employees e on e.id = tpm.employee_id
join bluecore_v2.roles r on r.id = tpm.role_id
where c.code = 'global-bank'
  and p.code = 'global-bank-banca-digital'
  and r.code = 'ARCHITECT'
  and tpm.is_active = true
order by t.name;


-- Source: link-bluecore-v2-employees-to-auth-users.sql
begin;

update bluecore_v2.employees employee
set
  auth_user_id = auth_user.id,
  updated_at = now()
from auth.users auth_user
where employee.auth_user_id is null
  and employee.deleted_at is null
  and lower(employee.email) = lower(auth_user.email);

commit;

select
  count(*) filter (where employee.auth_user_id is not null) as linked_employees,
  count(*) filter (where employee.auth_user_id is null) as employees_without_auth,
  count(*) filter (
    where employee.auth_user_id is not null and auth_user.id is null
  ) as invalid_auth_links
from bluecore_v2.employees employee
left join auth.users auth_user on auth_user.id = employee.auth_user_id
where employee.deleted_at is null;

select count(*) as auth_users_without_employee
from auth.users auth_user
where not exists (
  select 1
  from bluecore_v2.employees employee
  where employee.auth_user_id = auth_user.id
    and employee.deleted_at is null
);


-- Source: validate-bluecore-v2-migration.sql
-- Read-only migration audit. This script does not modify data.

select table_name, row_count
from (
  select 'clients' as table_name, count(*) as row_count from bluecore_v2.clients
  union all select 'projects', count(*) from bluecore_v2.projects
  union all select 'teams', count(*) from bluecore_v2.teams
  union all select 'team_projects', count(*) from bluecore_v2.team_projects
  union all select 'roles', count(*) from bluecore_v2.roles
  union all select 'employees', count(*) from bluecore_v2.employees
  union all select 'employee_roles', count(*) from bluecore_v2.employee_roles
  union all select 'team_memberships', count(*) from bluecore_v2.team_memberships
  union all select 'team_project_memberships', count(*) from bluecore_v2.team_project_memberships
  union all select 'employee_absences', count(*) from bluecore_v2.employee_absences
  union all select 'team_rotation_events', count(*) from bluecore_v2.team_rotation_events
  union all select 'sprints', count(*) from bluecore_v2.sprints
  union all select 'sprint_member_metrics', count(*) from bluecore_v2.sprint_member_metrics
  union all select 'team_weekly_reports', count(*) from bluecore_v2.team_weekly_reports
  union all select 'team_initiatives', count(*) from bluecore_v2.team_initiatives
  union all select 'team_risks', count(*) from bluecore_v2.team_risks
  union all select 'quality_metrics', count(*) from bluecore_v2.quality_metrics
  union all select 'evaluation_templates', count(*) from bluecore_v2.evaluation_templates
  union all select 'evaluation_template_versions', count(*) from bluecore_v2.evaluation_template_versions
  union all select 'performance_cycles', count(*) from bluecore_v2.performance_cycles
  union all select 'performance_evaluations', count(*) from bluecore_v2.performance_evaluations
  union all select 'performance_answers', count(*) from bluecore_v2.performance_answers
  union all select 'one_to_one_sessions', count(*) from bluecore_v2.one_to_one_sessions
  union all select 'sidebar_modules', count(*) from bluecore_v2.sidebar_modules
  union all select 'sidebar_module_roles', count(*) from bluecore_v2.sidebar_module_roles
  union all select 'app_settings', count(*) from bluecore_v2.app_settings
) counts
order by table_name;

select check_name, issue_count,
  case when issue_count = 0 then 'OK' else 'REVIEW' end as status
from (
  select 'tables_without_rls' as check_name, count(*) as issue_count
  from pg_tables
  where schemaname = 'bluecore_v2' and not rowsecurity

  union all
  select 'rotation_events_without_team', count(*)
  from bluecore_v2.team_rotation_events
  where from_team_id is null and to_team_id is null

  union all
  select 'completed_vacations_without_end_date', count(*)
  from bluecore_v2.employee_absences
  where absence_type = 'vacation' and status = 'completed' and end_date is null

  union all
  select 'migrated_vacations_without_replacement', count(*)
  from bluecore_v2.employee_absences
  where source = 'migration' and absence_type = 'vacation' and replacement_employee_id is null

  union all
  select 'active_memberships_with_end_date', count(*)
  from bluecore_v2.team_memberships
  where is_active and ended_at is not null

  union all
  select 'active_project_memberships_with_end_date', count(*)
  from bluecore_v2.team_project_memberships
  where is_active and ended_at is not null

  union all
  select 'performance_evaluations_without_13_answers', count(*)
  from (
    select evaluation.id
    from bluecore_v2.performance_evaluations evaluation
    left join bluecore_v2.performance_answers answer on answer.evaluation_id = evaluation.id
    group by evaluation.id
    having count(answer.id) <> 13
  ) invalid

  union all
  select 'performance_cycles_with_incorrect_counts', count(*)
  from bluecore_v2.performance_cycles cycle
  where cycle.completed_evaluations <> (
    select count(*)
    from bluecore_v2.performance_evaluations evaluation
    where evaluation.cycle_id = cycle.id
  )

  union all
  select 'templates_with_spanish_structure_keys', count(*)
  from bluecore_v2.evaluation_template_versions version
  where version.configuration ?| array['preguntas', 'respuestas', 'secciones']

  union all
  select 'published_templates_without_configuration', count(*)
  from bluecore_v2.evaluation_template_versions version
  where version.published_at is not null
    and version.configuration = '{}'::jsonb

  union all
  select 'one_to_one_sessions_without_sprint_range', count(*)
  from bluecore_v2.one_to_one_sessions
  where sprint_from_id is null or sprint_to_id is null
) audit
order by check_name;
