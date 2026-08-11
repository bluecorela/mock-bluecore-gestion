-- Bluecore Gestion v2 - normalized Supabase schema
-- Creates an isolated schema. It does not alter or delete current public tables.
begin;
create extension if not exists pgcrypto;
create schema if not exists bluecore_v2;
grant usage on schema bluecore_v2 to authenticated, service_role;

create or replace function bluecore_v2.set_updated_at() returns trigger
language plpgsql set search_path = bluecore_v2, public as $$
begin new.updated_at = now(); return new; end;
$$;

-- Organization
create table if not exists bluecore_v2.clients (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  name text not null, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists bluecore_v2.projects (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references bluecore_v2.clients(id),
  code text not null unique, name text not null, description text,
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','cancelled')),
  start_date date, planned_end_date date, actual_end_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (planned_end_date is null or start_date is null or planned_end_date >= start_date),
  check (actual_end_date is null or start_date is null or actual_end_date >= start_date)
);
create table if not exists bluecore_v2.teams (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists bluecore_v2.team_projects (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id),
  project_id uuid not null references bluecore_v2.projects(id), started_at date not null, ended_at date,
  is_primary boolean not null default false, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (team_id,project_id,started_at),
  check (ended_at is null or ended_at >= started_at)
);

-- People and team history
create table if not exists bluecore_v2.roles (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into bluecore_v2.roles (code,name) values
 ('ADMIN','Administrator'),('ARCHITECT','Architect'),('SCRUM_MASTER','Scrum Master'),
 ('SOFTWARE_ENGINEER','Software Engineer'),('QA_ENGINEER','QA Engineer'),
 ('WELLBEING_CREATOR','Wellbeing Creator'),('INTERN','Pasante')
on conflict (code) do update set name=excluded.name;
create table if not exists bluecore_v2.employees (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users(id) on delete set null,
  employee_code text unique, full_name text not null, email text not null unique,
  status text not null default 'active' check (status in ('active','inactive','leave')),
  hired_at date, terminated_at date, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (terminated_at is null or hired_at is null or terminated_at >= hired_at)
);
create table if not exists bluecore_v2.employee_roles (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references bluecore_v2.employees(id),
  role_id uuid not null references bluecore_v2.roles(id), started_at date not null default current_date,
  ended_at date, is_primary boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(employee_id,role_id,started_at),
  check (ended_at is null or ended_at >= started_at)
);
create table if not exists bluecore_v2.team_memberships (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id),
  employee_id uuid not null references bluecore_v2.employees(id), role_id uuid references bluecore_v2.roles(id),
  started_at date not null, ended_at date, is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(team_id,employee_id,started_at),
  check (ended_at is null or ended_at >= started_at), check (not is_active or ended_at is null)
);
create table if not exists bluecore_v2.team_project_memberships (
  id uuid primary key default gen_random_uuid(),
  team_project_id uuid not null references bluecore_v2.team_projects(id) on delete cascade,
  employee_id uuid not null references bluecore_v2.employees(id),
  role_id uuid not null references bluecore_v2.roles(id),
  started_at date not null,
  ended_at date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_project_id,employee_id,role_id,started_at),
  check(ended_at is null or ended_at>=started_at),
  check(not is_active or ended_at is null)
);
create table if not exists bluecore_v2.employee_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references bluecore_v2.employees(id),
  team_id uuid references bluecore_v2.teams(id),
  absence_type text not null check(absence_type in ('vacation','sick_leave','personal_leave','parental_leave','unpaid_leave','other')),
  start_date date, end_date date,
  status text not null default 'planned' check(status in ('planned','active','completed','cancelled')),
  reason text, replacement_employee_id uuid references bluecore_v2.employees(id),
  approved_by uuid references bluecore_v2.employees(id), approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'application' check(source in ('application','migration','import')),
  source_reference text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(end_date is null or start_date is null or end_date>=start_date),
  check(employee_id<>replacement_employee_id), check(approved_at is null or approved_by is not null)
);
create table if not exists bluecore_v2.team_rotation_events (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references bluecore_v2.employees(id),
  from_team_id uuid references bluecore_v2.teams(id), to_team_id uuid references bluecore_v2.teams(id),
  event_type text not null check(event_type in ('rotation','vacation_start','vacation_end','assignment','unassignment')),
  effective_at timestamptz not null default now(), notes text, created_by uuid references auth.users(id) on delete set null,
  source text not null default 'application' check(source in ('application','migration','import')),
  source_reference text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(), check(from_team_id is not null or to_team_id is not null)
);

-- Sprints
create table if not exists bluecore_v2.sprints (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id),
  project_id uuid references bluecore_v2.projects(id), sprint_number integer not null check(sprint_number>0),
  name text not null, start_date date not null, end_date date not null,
  status text not null default 'planned' check(status in ('planned','in_progress','completed','cancelled')),
  committed_points numeric(10,2) not null default 0 check(committed_points>=0),
  completed_points numeric(10,2) not null default 0 check(completed_points>=0),
  wip_stories integer not null default 0 check(wip_stories>=0), closed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(team_id,sprint_number), check(end_date>=start_date)
);
create table if not exists bluecore_v2.sprint_member_metrics (
  id uuid primary key default gen_random_uuid(), sprint_id uuid not null references bluecore_v2.sprints(id) on delete cascade,
  employee_id uuid not null references bluecore_v2.employees(id), assigned_tasks integer not null default 0 check(assigned_tasks>=0),
  delivered_tasks integer not null default 0 check(delivered_tasks>=0), returned_tasks integer not null default 0 check(returned_tasks>=0),
  code_quality_score numeric(5,2) check(code_quality_score between 0 and 4),
  component_1_score numeric(7,2), component_2_score numeric(7,2),
  component_3_score numeric(7,2), final_score numeric(7,2), rating text, comments text,
  evaluated_by uuid references bluecore_v2.employees(id), evaluated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(sprint_id,employee_id)
);

-- Weekly dashboard
create table if not exists bluecore_v2.team_weekly_reports (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id),
  project_id uuid not null references bluecore_v2.projects(id), sprint_id uuid references bluecore_v2.sprints(id),
  scrum_master_id uuid references bluecore_v2.employees(id), architect_id uuid references bluecore_v2.employees(id),
  week_number integer not null check(week_number between 1 and 53), week_start date not null, week_end date not null,
  committed_points numeric(10,2) not null default 0 check(committed_points>=0),
  completed_points numeric(10,2) not null default 0 check(completed_points>=0),
  wip_stories integer not null default 0 check(wip_stories>=0), defects_found integer not null default 0 check(defects_found>=0),
  production_defects integer not null default 0 check(production_defects>=0),
  status text not null default 'draft' check(status in ('draft','submitted','approved','archived')),
  submitted_by uuid references bluecore_v2.employees(id), submitted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(team_id,project_id,week_start), check(week_end>=week_start),
  check(not(status in ('submitted','approved')) or submitted_at is not null)
);
create table if not exists bluecore_v2.team_initiatives (
  id uuid primary key default gen_random_uuid(), weekly_report_id uuid not null references bluecore_v2.team_weekly_reports(id) on delete cascade,
  project_id uuid references bluecore_v2.projects(id), name text not null, description text,
  start_date date not null, planned_end_date date, actual_end_date date,
  progress_percentage numeric(5,2) not null default 0 check(progress_percentage between 0 and 100),
  status text not null default 'planned' check(status in ('planned','in_progress','at_risk','completed','cancelled')),
  owner_id uuid references bluecore_v2.employees(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), check(planned_end_date is null or planned_end_date>=start_date),
  check(actual_end_date is null or actual_end_date>=start_date)
);
create table if not exists bluecore_v2.team_risks (
  id uuid primary key default gen_random_uuid(), weekly_report_id uuid not null references bluecore_v2.team_weekly_reports(id) on delete cascade,
  project_id uuid references bluecore_v2.projects(id), description text not null,
  impact text not null check(impact in ('low','medium','high','critical')),
  probability text check(probability in ('low','medium','high')), responsible_employee_id uuid references bluecore_v2.employees(id),
  status text not null default 'open' check(status in ('open','at_risk','monitoring','resolved','accepted','cancelled')),
  mitigation_plan text, due_date date, resolved_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), check(status<>'resolved' or resolved_at is not null)
);
create table if not exists bluecore_v2.quality_metrics (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id),
  project_id uuid references bluecore_v2.projects(id), sprint_id uuid references bluecore_v2.sprints(id),
  weekly_report_id uuid references bluecore_v2.team_weekly_reports(id) on delete cascade,
  defects_found integer not null default 0 check(defects_found>=0), production_defects integer not null default 0 check(production_defects>=0),
  critical_defects integer not null default 0 check(critical_defects>=0), resolved_defects integer not null default 0 check(resolved_defects>=0),
  recorded_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Evaluation templates
create table if not exists bluecore_v2.evaluation_templates (
  id uuid primary key default gen_random_uuid(), type text not null check(type in ('performance','one_to_one','sprint')),
  name text not null, is_active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(type,name)
);
create table if not exists bluecore_v2.evaluation_template_versions (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references bluecore_v2.evaluation_templates(id) on delete cascade,
  version integer not null check(version>0), configuration jsonb not null check(jsonb_typeof(configuration)='object'),
  published_at timestamptz, created_by uuid references bluecore_v2.employees(id), created_at timestamptz not null default now(),
  unique(template_id,version)
);

-- Performance
create table if not exists bluecore_v2.performance_cycles (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id), name text not null,
  period_start date not null, period_end date,
  status text not null default 'draft' check(status in ('draft','enabled','in_progress','completed','cancelled')),
  expected_evaluations integer not null default 0 check(expected_evaluations>=0),
  completed_evaluations integer not null default 0 check(completed_evaluations>=0),
  enabled_by uuid references bluecore_v2.employees(id), started_at timestamptz, completed_at timestamptz,
  source text not null default 'application' check(source in ('application','migration','import')),
  source_reference text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(team_id,name,period_start), check(period_end>=period_start), check(completed_evaluations<=expected_evaluations)
);
create table if not exists bluecore_v2.performance_evaluations (
  id uuid primary key default gen_random_uuid(), cycle_id uuid not null references bluecore_v2.performance_cycles(id) on delete cascade,
  team_id uuid not null references bluecore_v2.teams(id), employee_id uuid not null references bluecore_v2.employees(id),
  evaluator_id uuid not null references bluecore_v2.employees(id), template_version_id uuid references bluecore_v2.evaluation_template_versions(id),
  evaluation_number integer not null check(evaluation_number>0), period text, achievements text, growth_potential text,
  additional_observations text, feedback_confirmed boolean not null default false,
  source text not null default 'application' check(source in ('application','migration','import')),
  source_reference text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  evaluated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(cycle_id,employee_id,evaluation_number)
);
create table if not exists bluecore_v2.performance_answers (
  id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references bluecore_v2.performance_evaluations(id) on delete cascade,
  question_key text not null, score numeric(6,2) not null check(score>=0), comment text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(evaluation_id,question_key)
);

-- One-to-one
create table if not exists bluecore_v2.one_to_one_sessions (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references bluecore_v2.teams(id),
  employee_id uuid not null references bluecore_v2.employees(id), evaluator_id uuid not null references bluecore_v2.employees(id),
  template_version_id uuid references bluecore_v2.evaluation_template_versions(id),
  sprint_from_id uuid references bluecore_v2.sprints(id), sprint_to_id uuid references bluecore_v2.sprints(id),
  evaluation_number integer not null check(evaluation_number>0), period text not null,
  summary jsonb not null default '{}'::jsonb check(jsonb_typeof(summary)='object'),
  final_synthesis jsonb not null default '{}'::jsonb check(jsonb_typeof(final_synthesis)='object'),
  reflection_answers jsonb not null default '{}'::jsonb check(jsonb_typeof(reflection_answers)='object'),
  soft_skill_answers jsonb not null default '{}'::jsonb check(jsonb_typeof(soft_skill_answers)='object'),
  source text not null default 'application' check(source in ('application','migration','import')),
  source_reference text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  evaluated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(team_id,employee_id,evaluation_number)
);

-- Navigation and settings
create table if not exists bluecore_v2.sidebar_modules (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, route text not null unique,
  icon text, display_order integer not null default 0, is_visible boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists bluecore_v2.sidebar_module_roles (
  module_id uuid not null references bluecore_v2.sidebar_modules(id) on delete cascade,
  role_id uuid not null references bluecore_v2.roles(id) on delete cascade, primary key(module_id,role_id)
);
create table if not exists bluecore_v2.app_settings (
  key text primary key, value jsonb not null, description text, is_public boolean not null default false,
  updated_by uuid references bluecore_v2.employees(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_projects_client on bluecore_v2.projects(client_id);
create index if not exists idx_team_projects_team on bluecore_v2.team_projects(team_id);
create index if not exists idx_employees_auth_user on bluecore_v2.employees(auth_user_id);
create index if not exists idx_team_memberships_team_active on bluecore_v2.team_memberships(team_id,is_active);
create index if not exists idx_team_memberships_employee_active on bluecore_v2.team_memberships(employee_id,is_active);
create unique index if not exists uq_active_team_membership on bluecore_v2.team_memberships(team_id,employee_id) where is_active;
create index if not exists idx_team_project_memberships_assignment_active on bluecore_v2.team_project_memberships(team_project_id,is_active);
create index if not exists idx_team_project_memberships_employee_active on bluecore_v2.team_project_memberships(employee_id,is_active);
create index if not exists idx_employee_absences_employee_dates on bluecore_v2.employee_absences(employee_id,start_date desc,end_date desc);
create index if not exists idx_employee_absences_team_status on bluecore_v2.employee_absences(team_id,status);
create index if not exists idx_employee_absences_active on bluecore_v2.employee_absences(employee_id) where status='active';
create unique index if not exists uq_employee_absences_source_reference on bluecore_v2.employee_absences(source,source_reference) where source_reference is not null;
create unique index if not exists uq_team_rotation_events_source_reference on bluecore_v2.team_rotation_events(source,source_reference) where source_reference is not null;
create unique index if not exists uq_active_team_project_membership
  on bluecore_v2.team_project_memberships(team_project_id,employee_id,role_id) where is_active;
create index if not exists idx_rotation_employee_date on bluecore_v2.team_rotation_events(employee_id,effective_at desc);
create index if not exists idx_sprints_team_dates on bluecore_v2.sprints(team_id,start_date desc);
create index if not exists idx_sprint_metrics_employee on bluecore_v2.sprint_member_metrics(employee_id);
create index if not exists idx_weekly_reports_team_week on bluecore_v2.team_weekly_reports(team_id,week_start desc);
create index if not exists idx_weekly_reports_project_week on bluecore_v2.team_weekly_reports(project_id,week_start desc);
create index if not exists idx_initiatives_report on bluecore_v2.team_initiatives(weekly_report_id);
create index if not exists idx_risks_report on bluecore_v2.team_risks(weekly_report_id);
create index if not exists idx_risks_status on bluecore_v2.team_risks(status);
create index if not exists idx_quality_team_date on bluecore_v2.quality_metrics(team_id,recorded_at desc);
create index if not exists idx_performance_cycles_team on bluecore_v2.performance_cycles(team_id,period_start desc);
create unique index if not exists uq_performance_cycles_source_reference on bluecore_v2.performance_cycles(source,source_reference) where source_reference is not null;
create index if not exists idx_performance_evaluations_employee on bluecore_v2.performance_evaluations(employee_id,evaluated_at desc);
create index if not exists idx_performance_evaluations_team on bluecore_v2.performance_evaluations(team_id,evaluated_at desc);
create unique index if not exists uq_performance_evaluations_source_reference on bluecore_v2.performance_evaluations(source,source_reference) where source_reference is not null;
create index if not exists idx_oto_employee on bluecore_v2.one_to_one_sessions(employee_id,evaluated_at desc);
create index if not exists idx_oto_team on bluecore_v2.one_to_one_sessions(team_id,evaluated_at desc);
create unique index if not exists uq_one_to_one_sessions_source_reference on bluecore_v2.one_to_one_sessions(source,source_reference) where source_reference is not null;

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['clients','projects','teams','team_projects','roles','employees','employee_roles',
    'team_memberships','team_project_memberships','employee_absences','sprints','sprint_member_metrics','team_weekly_reports','team_initiatives','team_risks',
    'quality_metrics','evaluation_templates','performance_cycles','performance_evaluations','performance_answers',
    'one_to_one_sessions','sidebar_modules','app_settings'] loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = format('trg_%s_updated_at',t)
        and tgrelid = format('bluecore_v2.%I',t)::regclass
        and not tgisinternal
    ) then
      execute format('create trigger trg_%I_updated_at before update on bluecore_v2.%I for each row execute function bluecore_v2.set_updated_at()',t,t);
    end if;
  end loop;
end $$;

-- RLS is explicit so Supabase Security Advisor can verify every table.
alter table bluecore_v2.clients enable row level security;
alter table bluecore_v2.projects enable row level security;
alter table bluecore_v2.teams enable row level security;
alter table bluecore_v2.team_projects enable row level security;
alter table bluecore_v2.roles enable row level security;
alter table bluecore_v2.employees enable row level security;
alter table bluecore_v2.employee_roles enable row level security;
alter table bluecore_v2.team_memberships enable row level security;
alter table bluecore_v2.team_project_memberships enable row level security;
alter table bluecore_v2.employee_absences enable row level security;
alter table bluecore_v2.team_rotation_events enable row level security;
alter table bluecore_v2.sprints enable row level security;
alter table bluecore_v2.sprint_member_metrics enable row level security;
alter table bluecore_v2.team_weekly_reports enable row level security;
alter table bluecore_v2.team_initiatives enable row level security;
alter table bluecore_v2.team_risks enable row level security;
alter table bluecore_v2.quality_metrics enable row level security;
alter table bluecore_v2.evaluation_templates enable row level security;
alter table bluecore_v2.evaluation_template_versions enable row level security;
alter table bluecore_v2.performance_cycles enable row level security;
alter table bluecore_v2.performance_evaluations enable row level security;
alter table bluecore_v2.performance_answers enable row level security;
alter table bluecore_v2.one_to_one_sessions enable row level security;
alter table bluecore_v2.sidebar_modules enable row level security;
alter table bluecore_v2.sidebar_module_roles enable row level security;
alter table bluecore_v2.app_settings enable row level security;

-- Backend-only access during migration. service_role bypasses RLS.
grant select,insert,update,delete on all tables in schema bluecore_v2 to service_role;
grant execute on all functions in schema bluecore_v2 to service_role;
alter default privileges in schema bluecore_v2 grant select,insert,update,delete on tables to service_role;
alter default privileges in schema bluecore_v2 grant execute on functions to service_role;

commit;

-- Validation (run after successful execution):
-- select table_name from information_schema.tables where table_schema='bluecore_v2' order by table_name;


-- Consolidated from add-bluecore-v2-save-weekly-report-function.sql
begin;

create or replace function bluecore_v2.save_weekly_report(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_report_id uuid;
  v_team_id uuid := (p_payload->>'teamId')::uuid;
  v_project_id uuid := (p_payload->>'projectId')::uuid;
  v_sprint_id uuid := nullif(p_payload->>'sprintId', '')::uuid;
  v_scrum_master_id uuid := nullif(p_payload->>'scrumMasterId', '')::uuid;
  v_architect_id uuid := nullif(p_payload->>'architectId', '')::uuid;
  v_week_start date := (p_payload->>'weekStart')::date;
  v_week_end date := (p_payload->>'weekEnd')::date;
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'draft');
begin
  if not exists (
    select 1
    from bluecore_v2.team_projects tp
    where tp.team_id = v_team_id
      and tp.project_id = v_project_id
      and tp.started_at <= v_week_end
      and (tp.ended_at is null or tp.ended_at >= v_week_start)
  ) then
    raise exception 'The project is not assigned to the team for the selected week';
  end if;

  if v_sprint_id is not null and not exists (
    select 1
    from bluecore_v2.sprints s
    where s.id = v_sprint_id
      and s.team_id = v_team_id
      and (s.project_id is null or s.project_id = v_project_id)
  ) then
    raise exception 'The sprint does not belong to the selected team and project';
  end if;

  if v_scrum_master_id is not null and not exists (
    select 1 from bluecore_v2.employees e
    where e.id = v_scrum_master_id and e.status = 'active' and e.deleted_at is null
  ) then
    raise exception 'The Scrum Master is not an active employee';
  end if;

  if v_architect_id is not null and not exists (
    select 1 from bluecore_v2.employees e
    where e.id = v_architect_id and e.status = 'active' and e.deleted_at is null
  ) then
    raise exception 'The architect is not an active employee';
  end if;

  insert into bluecore_v2.team_weekly_reports (
    team_id,
    project_id,
    sprint_id,
    scrum_master_id,
    architect_id,
    week_number,
    week_start,
    week_end,
    committed_points,
    completed_points,
    wip_stories,
    defects_found,
    production_defects,
    status,
    submitted_at
  ) values (
    v_team_id,
    v_project_id,
    v_sprint_id,
    v_scrum_master_id,
    v_architect_id,
    (p_payload->>'weekNumber')::integer,
    v_week_start,
    v_week_end,
    coalesce((p_payload->>'committedPoints')::numeric, 0),
    coalesce((p_payload->>'completedPoints')::numeric, 0),
    coalesce((p_payload->>'wipStories')::integer, 0),
    coalesce((p_payload->'quality'->>'defectsFound')::integer, 0),
    coalesce((p_payload->'quality'->>'productionDefects')::integer, 0),
    v_status,
    case when v_status = 'submitted' then now() else null end
  )
  on conflict (team_id, project_id, week_start)
  do update set
    sprint_id = excluded.sprint_id,
    scrum_master_id = excluded.scrum_master_id,
    architect_id = excluded.architect_id,
    week_number = excluded.week_number,
    week_end = excluded.week_end,
    committed_points = excluded.committed_points,
    completed_points = excluded.completed_points,
    wip_stories = excluded.wip_stories,
    defects_found = excluded.defects_found,
    production_defects = excluded.production_defects,
    status = excluded.status,
    submitted_at = excluded.submitted_at,
    updated_at = now()
  returning id into v_report_id;

  delete from bluecore_v2.team_initiatives where weekly_report_id = v_report_id;
  delete from bluecore_v2.team_risks where weekly_report_id = v_report_id;
  delete from bluecore_v2.quality_metrics where weekly_report_id = v_report_id;

  insert into bluecore_v2.team_initiatives (
    weekly_report_id,
    project_id,
    name,
    description,
    start_date,
    planned_end_date,
    actual_end_date,
    progress_percentage,
    status,
    owner_id
  )
  select
    v_report_id,
    coalesce(nullif(item->>'projectId', '')::uuid, v_project_id),
    item->>'name',
    nullif(item->>'description', ''),
    (item->>'startDate')::date,
    nullif(item->>'plannedEndDate', '')::date,
    nullif(item->>'actualEndDate', '')::date,
    coalesce((item->>'progressPercentage')::numeric, 0),
    coalesce(nullif(item->>'status', ''), 'planned'),
    nullif(item->>'ownerId', '')::uuid
  from jsonb_array_elements(coalesce(p_payload->'initiatives', '[]'::jsonb)) item;

  insert into bluecore_v2.team_risks (
    weekly_report_id,
    project_id,
    description,
    impact,
    probability,
    responsible_employee_id,
    status,
    mitigation_plan,
    due_date,
    resolved_at
  )
  select
    v_report_id,
    coalesce(nullif(item->>'projectId', '')::uuid, v_project_id),
    item->>'description',
    item->>'impact',
    nullif(item->>'probability', ''),
    nullif(item->>'responsibleEmployeeId', '')::uuid,
    coalesce(nullif(item->>'status', ''), 'open'),
    nullif(item->>'mitigationPlan', ''),
    nullif(item->>'dueDate', '')::date,
    nullif(item->>'resolvedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(p_payload->'risks', '[]'::jsonb)) item;

  insert into bluecore_v2.quality_metrics (
    team_id,
    project_id,
    sprint_id,
    weekly_report_id,
    defects_found,
    production_defects,
    critical_defects,
    resolved_defects,
    recorded_at
  ) values (
    v_team_id,
    v_project_id,
    v_sprint_id,
    v_report_id,
    coalesce((p_payload->'quality'->>'defectsFound')::integer, 0),
    coalesce((p_payload->'quality'->>'productionDefects')::integer, 0),
    coalesce((p_payload->'quality'->>'criticalDefects')::integer, 0),
    coalesce((p_payload->'quality'->>'resolvedDefects')::integer, 0),
    coalesce(nullif(p_payload->'quality'->>'recordedAt', '')::timestamptz, now())
  );

  return v_report_id;
end;
$$;

revoke all on function bluecore_v2.save_weekly_report(jsonb) from public;
grant execute on function bluecore_v2.save_weekly_report(jsonb) to service_role;

commit;

select
  routine_schema,
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'bluecore_v2'
  and routine_name = 'save_weekly_report';


-- Consolidated from add-bluecore-v2-save-performance-evaluation-function.sql
begin;

create or replace function bluecore_v2.save_performance_evaluation(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_evaluation_id uuid;
  v_cycle_id uuid := (p_payload->>'cycleId')::uuid;
  v_team_id uuid := (p_payload->>'teamId')::uuid;
  v_evaluated_at timestamptz := coalesce(
    nullif(p_payload->>'evaluatedAt', '')::timestamptz,
    now()
  );
  v_expected integer;
  v_completed integer;
begin
  select expected_evaluations
    into v_expected
  from bluecore_v2.performance_cycles
  where id = v_cycle_id
    and team_id = v_team_id
    and status in ('enabled', 'in_progress')
  for update;

  if not found then
    raise exception 'An active performance cycle was not found for the team';
  end if;

  if jsonb_typeof(coalesce(p_payload->'answers', '{}'::jsonb)) <> 'object'
    or jsonb_object_length(coalesce(p_payload->'answers', '{}'::jsonb)) = 0 then
    raise exception 'Performance answers are required';
  end if;

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
    evaluated_at
  ) values (
    v_cycle_id,
    v_team_id,
    (p_payload->>'employeeId')::uuid,
    (p_payload->>'evaluatorId')::uuid,
    nullif(p_payload->>'templateVersionId', '')::uuid,
    (p_payload->>'evaluationNumber')::integer,
    nullif(p_payload->>'period', ''),
    nullif(p_payload->>'achievements', ''),
    nullif(p_payload->>'growthPotential', ''),
    nullif(p_payload->>'additionalObservations', ''),
    coalesce((p_payload->>'feedbackConfirmed')::boolean, false),
    v_evaluated_at
  )
  returning id into v_evaluation_id;

  insert into bluecore_v2.performance_answers (
    evaluation_id,
    question_key,
    score,
    comment
  )
  select
    v_evaluation_id,
    answer.key,
    coalesce((answer.value->>'score')::numeric, 0),
    nullif(answer.value->>'comment', '')
  from jsonb_each(p_payload->'answers') answer;

  select count(*)
    into v_completed
  from bluecore_v2.performance_evaluations
  where cycle_id = v_cycle_id;

  update bluecore_v2.performance_cycles
  set
    completed_evaluations = v_completed,
    status = case when v_completed >= v_expected then 'completed' else 'in_progress' end,
    started_at = coalesce(started_at, v_evaluated_at),
    completed_at = case when v_completed >= v_expected then v_evaluated_at else null end,
    period_end = case when v_completed >= v_expected then v_evaluated_at::date else period_end end,
    updated_at = now()
  where id = v_cycle_id;

  return v_evaluation_id;
end;
$$;

revoke all on function bluecore_v2.save_performance_evaluation(jsonb) from public;
grant execute on function bluecore_v2.save_performance_evaluation(jsonb) to service_role;

commit;

select
  routine_schema,
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'bluecore_v2'
  and routine_name = 'save_performance_evaluation';


-- Consolidated from add-bluecore-v2-manage-employee-movement-function.sql
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
  v_replacement_team_id uuid;
  v_replacement_role_id uuid;
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

  select membership.team_id, membership.role_id
    into v_current_team_id, v_current_role_id
  from bluecore_v2.team_memberships membership
  where membership.employee_id = p_employee_id
    and membership.is_active
    and (p_source_team_id is null or membership.team_id = p_source_team_id)
  order by membership.started_at desc
  limit 1
  for update;

  if p_action in ('rotate', 'vacation_start') and v_current_team_id is null then
    raise exception 'The employee does not have an active membership in the source team';
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
    where employee_id = p_employee_id and is_active;

    insert into bluecore_v2.team_memberships (
      team_id, employee_id, role_id, started_at, is_active, created_by
    ) values (
      p_destination_team_id, p_employee_id, v_current_role_id, current_date, true, p_created_by
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
  where code = 'pool-de-vacaciones' and deleted_at is null;

  if v_pool_team_id is null then
    raise exception 'Vacation pool team was not found';
  end if;

  if p_action = 'vacation_start' then
    if exists (
      select 1 from bluecore_v2.employee_absences
      where employee_id = p_employee_id and status = 'active'
    ) then
      raise exception 'The employee already has an active absence';
    end if;

    if p_replacement_id is not null then
      if p_replacement_id = p_employee_id then
        raise exception 'The replacement employee must be different from the absent employee';
      end if;

      select membership.team_id, membership.role_id
        into v_replacement_team_id, v_replacement_role_id
      from bluecore_v2.team_memberships membership
      where membership.employee_id = p_replacement_id and membership.is_active
      order by membership.started_at desc
      limit 1
      for update;

      if v_replacement_team_id is null then
        raise exception 'The replacement employee does not have an active team membership';
      end if;

      update bluecore_v2.team_memberships
      set is_active = false, ended_at = current_date, updated_at = now()
      where employee_id = p_replacement_id and is_active;

      insert into bluecore_v2.team_memberships (
        team_id, employee_id, role_id, started_at, is_active, created_by
      ) values (
        v_current_team_id, p_replacement_id, v_replacement_role_id, current_date, true, p_created_by
      )
      on conflict (team_id, employee_id, started_at) do update set
        role_id = excluded.role_id,
        ended_at = null,
        is_active = true,
        updated_at = now();

      insert into bluecore_v2.team_rotation_events (
        employee_id, from_team_id, to_team_id, event_type, effective_at, created_by,
        metadata
      ) values (
        p_replacement_id, v_replacement_team_id, v_current_team_id, 'assignment', now(), p_created_by,
        jsonb_build_object('reason', 'vacation_coverage', 'absentEmployeeId', p_employee_id)
      );
    end if;

    insert into bluecore_v2.employee_absences (
      employee_id, team_id, absence_type, start_date, status, reason,
      replacement_employee_id, created_by, metadata
    ) values (
      p_employee_id, v_current_team_id, 'vacation', current_date, 'active',
      'Vacation registered from the application', p_replacement_id, p_created_by,
      jsonb_build_object(
        'replacementOriginalTeamId', v_replacement_team_id,
        'replacementOriginalRoleId', v_replacement_role_id
      )
    ) returning id into v_result_id;

    insert into bluecore_v2.team_rotation_events (
      employee_id, from_team_id, to_team_id, event_type, effective_at, created_by,
      metadata
    ) values (
      p_employee_id, v_current_team_id, v_pool_team_id, 'vacation_start', now(), p_created_by,
      jsonb_build_object('absenceId', v_result_id)
    );

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

  v_destination_team_id := coalesce(p_destination_team_id, v_absence.team_id);
  if v_destination_team_id is null then
    raise exception 'A destination team is required to end the vacation';
  end if;

  update bluecore_v2.employee_absences
  set status = 'completed', end_date = current_date, updated_at = now()
  where id = v_absence.id;

  if v_current_team_id is distinct from v_destination_team_id then
    update bluecore_v2.team_memberships
    set is_active = false, ended_at = current_date, updated_at = now()
    where employee_id = p_employee_id and is_active;

    insert into bluecore_v2.team_memberships (
      team_id, employee_id, role_id, started_at, is_active, created_by
    ) values (
      v_destination_team_id, p_employee_id, v_current_role_id, current_date, true, p_created_by
    )
    on conflict (team_id, employee_id, started_at) do update set
      role_id = excluded.role_id, ended_at = null, is_active = true, updated_at = now();
  end if;

  if v_absence.replacement_employee_id is not null then
    v_replacement_team_id := nullif(v_absence.metadata->>'replacementOriginalTeamId', '')::uuid;
    v_replacement_role_id := nullif(v_absence.metadata->>'replacementOriginalRoleId', '')::uuid;

    if v_replacement_team_id is not null then
      update bluecore_v2.team_memberships
      set is_active = false, ended_at = current_date, updated_at = now()
      where employee_id = v_absence.replacement_employee_id and is_active;

      insert into bluecore_v2.team_memberships (
        team_id, employee_id, role_id, started_at, is_active, created_by
      ) values (
        v_replacement_team_id, v_absence.replacement_employee_id,
        v_replacement_role_id, current_date, true, p_created_by
      )
      on conflict (team_id, employee_id, started_at) do update set
        role_id = excluded.role_id, ended_at = null, is_active = true, updated_at = now();

      insert into bluecore_v2.team_rotation_events (
        employee_id, from_team_id, to_team_id, event_type, effective_at, created_by,
        metadata
      ) values (
        v_absence.replacement_employee_id, v_absence.team_id, v_replacement_team_id,
        'unassignment', now(), p_created_by,
        jsonb_build_object('reason', 'vacation_coverage_ended', 'absenceId', v_absence.id)
      );
    end if;
  end if;

  insert into bluecore_v2.team_rotation_events (
    employee_id, from_team_id, to_team_id, event_type, effective_at, created_by,
    metadata
  ) values (
    p_employee_id, v_pool_team_id, v_destination_team_id, 'vacation_end', now(), p_created_by,
    jsonb_build_object('absenceId', v_absence.id)
  ) returning id into v_result_id;

  return v_result_id;
end;
$$;

revoke all on function bluecore_v2.manage_employee_movement(text,uuid,uuid,uuid,uuid,uuid) from public;
grant execute on function bluecore_v2.manage_employee_movement(text,uuid,uuid,uuid,uuid,uuid) to service_role;

commit;

select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema = 'bluecore_v2'
  and routine_name = 'manage_employee_movement';


-- Consolidated from add-bluecore-v2-create-employee-function.sql
begin;

-- This role exists in the current personnel form but was missing from the
-- normalized role catalogue.
insert into bluecore_v2.roles (code, name, description)
values ('INTERN', 'Pasante', 'Pasante o persona en formación')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

create or replace function bluecore_v2.create_employee_with_assignments(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_employee_id uuid;
  v_role_id uuid;
  v_team_id uuid;
  v_full_name text := nullif(btrim(p_payload->>'fullName'), '');
  v_email text := lower(nullif(btrim(p_payload->>'email'), ''));
  v_role_code text := upper(nullif(btrim(p_payload->>'roleCode'), ''));
  v_team_code text := nullif(btrim(p_payload->>'teamCode'), '');
  v_auth_user_id uuid := nullif(p_payload->>'authUserId', '')::uuid;
  v_created_by uuid := nullif(p_payload->>'createdBy', '')::uuid;
  v_hired_at date := coalesce(nullif(p_payload->>'hiredAt', '')::date, current_date);
begin
  if v_full_name is null then
    raise exception 'Employee full name is required';
  end if;

  if v_email is null then
    raise exception 'Employee email is required';
  end if;

  if v_role_code is null then
    raise exception 'Employee role is required';
  end if;

  select role.id
    into v_role_id
  from bluecore_v2.roles role
  where role.code = v_role_code;

  if not found then
    raise exception 'Role code % does not exist', v_role_code;
  end if;

  if v_team_code is not null then
    select team.id
      into v_team_id
    from bluecore_v2.teams team
    where lower(team.code) = lower(v_team_code);

    if not found then
      raise exception 'Team code % does not exist', v_team_code;
    end if;
  end if;

  if v_role_code in ('SOFTWARE_ENGINEER', 'QA_ENGINEER', 'INTERN')
    and v_team_id is null then
    raise exception 'Role % requires a team', v_role_code;
  end if;

  if exists (
    select 1
    from bluecore_v2.employees employee
    where lower(employee.email) = v_email
      and employee.deleted_at is null
  ) then
    raise exception 'An active employee with email % already exists', v_email;
  end if;

  insert into bluecore_v2.employees (
    auth_user_id,
    full_name,
    email,
    status,
    hired_at
  ) values (
    v_auth_user_id,
    v_full_name,
    v_email,
    'active',
    v_hired_at
  )
  returning id into v_employee_id;

  insert into bluecore_v2.employee_roles (
    employee_id,
    role_id,
    started_at,
    is_primary
  ) values (
    v_employee_id,
    v_role_id,
    v_hired_at,
    true
  );

  if v_team_id is not null then
    insert into bluecore_v2.team_memberships (
      team_id,
      employee_id,
      role_id,
      started_at,
      is_active,
      created_by
    ) values (
      v_team_id,
      v_employee_id,
      v_role_id,
      v_hired_at,
      true,
      v_created_by
    );
  end if;

  return v_employee_id;
end;
$$;

revoke all on function bluecore_v2.create_employee_with_assignments(jsonb) from public;
grant execute on function bluecore_v2.create_employee_with_assignments(jsonb) to service_role;

commit;

select
  routine_schema,
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'bluecore_v2'
  and routine_name = 'create_employee_with_assignments';


-- Consolidated from add-bluecore-v2-update-employee-function.sql
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

    select membership.team_id into v_current_team_id
    from bluecore_v2.team_memberships membership
    where membership.employee_id = v_employee_id
      and membership.is_active = true
    order by membership.started_at desc
    limit 1;

    if v_current_team_id is distinct from v_team_id then
      update bluecore_v2.team_memberships
      set
        ended_at = v_effective_date,
        is_active = false,
        updated_at = now()
      where employee_id = v_employee_id and is_active = true;

      if v_team_id is not null then
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
  end if;

  return v_employee_id;
end;
$$;

revoke all on function bluecore_v2.update_employee_with_assignments(jsonb) from public;
grant execute on function bluecore_v2.update_employee_with_assignments(jsonb) to service_role;

commit;

select
  routine_schema,
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'bluecore_v2'
  and routine_name = 'update_employee_with_assignments';


-- Consolidated from add-bluecore-v2-save-sprint-evaluation-function.sql
begin;

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
  where lower(btrim(employee.full_name)) = lower(btrim(p_payload->>'employeeName'))
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

select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema = 'bluecore_v2'
  and routine_name = 'save_sprint_evaluation';

-- Transactional sidebar module and role configuration.
begin;

create or replace function bluecore_v2.save_sidebar_module(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = bluecore_v2, public
as $$
declare
  v_module_id uuid := nullif(p_payload->>'moduleId', '')::uuid;
  v_requested_roles integer;
  v_existing_roles integer;
begin
  if v_module_id is null then
    insert into bluecore_v2.sidebar_modules (
      code, name, route, icon, display_order, is_visible
    ) values (
      lower(btrim(p_payload->>'code')),
      btrim(p_payload->>'name'),
      btrim(p_payload->>'route'),
      nullif(btrim(p_payload->>'icon'), ''),
      coalesce((p_payload->>'displayOrder')::integer, 0),
      coalesce((p_payload->>'isVisible')::boolean, true)
    ) returning id into v_module_id;
  else
    perform 1 from bluecore_v2.sidebar_modules where id = v_module_id for update;
    if not found then raise exception 'Sidebar module % does not exist', v_module_id; end if;

    update bluecore_v2.sidebar_modules
    set
      code = case when p_payload ? 'code' then lower(btrim(p_payload->>'code')) else code end,
      name = case when p_payload ? 'name' then btrim(p_payload->>'name') else name end,
      route = case when p_payload ? 'route' then btrim(p_payload->>'route') else route end,
      icon = case when p_payload ? 'icon' then nullif(btrim(p_payload->>'icon'), '') else icon end,
      display_order = case when p_payload ? 'displayOrder' then (p_payload->>'displayOrder')::integer else display_order end,
      is_visible = case when p_payload ? 'isVisible' then (p_payload->>'isVisible')::boolean else is_visible end,
      updated_at = now()
    where id = v_module_id;
  end if;

  if p_payload ? 'roleCodes' then
    if jsonb_typeof(p_payload->'roleCodes') <> 'array' then
      raise exception 'roleCodes must be an array';
    end if;

    select count(distinct value) into v_requested_roles
    from jsonb_array_elements_text(p_payload->'roleCodes');

    select count(*) into v_existing_roles
    from bluecore_v2.roles role
    where role.code in (
      select distinct value from jsonb_array_elements_text(p_payload->'roleCodes')
    );

    if v_requested_roles <> v_existing_roles then
      raise exception 'One or more role codes do not exist';
    end if;

    delete from bluecore_v2.sidebar_module_roles where module_id = v_module_id;
    insert into bluecore_v2.sidebar_module_roles (module_id, role_id)
    select v_module_id, role.id
    from bluecore_v2.roles role
    where role.code in (
      select distinct value from jsonb_array_elements_text(p_payload->'roleCodes')
    );
  end if;

  return v_module_id;
end;
$$;

revoke all on function bluecore_v2.save_sidebar_module(jsonb) from public;
grant execute on function bluecore_v2.save_sidebar_module(jsonb) to service_role;

commit;
