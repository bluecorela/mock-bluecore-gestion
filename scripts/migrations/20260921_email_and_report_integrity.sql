begin;

-- Fail with an actionable message instead of silently choosing which email
-- record should survive.
do $$
begin
  if exists (
    select lower(email)
    from bluecore_v2.employees
    where deleted_at is null
    group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce case-insensitive employee email uniqueness: duplicates exist';
  end if;
end $$;

create unique index if not exists uq_active_employee_email_ci
  on bluecore_v2.employees(lower(email))
  where deleted_at is null;

create or replace function bluecore_v2.enforce_weekly_report_status_transition()
returns trigger
language plpgsql
set search_path = bluecore_v2, public
as $$
begin
  if old.status = 'submitted' and new.status not in ('submitted', 'approved', 'archived') then
    raise exception 'A submitted weekly report cannot return to draft';
  end if;
  if old.status = 'approved' and new.status not in ('approved', 'archived') then
    raise exception 'An approved weekly report can only be archived';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'An archived weekly report cannot change status';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_weekly_reports_status_transition
  on bluecore_v2.team_weekly_reports;
create trigger trg_team_weekly_reports_status_transition
before update of status on bluecore_v2.team_weekly_reports
for each row execute function bluecore_v2.enforce_weekly_report_status_transition();

commit;
