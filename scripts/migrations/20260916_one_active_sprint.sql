-- Run the preflight query first. Resolve duplicate active sprints before
-- applying this migration; PostgreSQL will reject the index if any remain.
select team_id, count(*) as active_sprints
from bluecore_v2.sprints
where status = 'in_progress'
group by team_id
having count(*) > 1;

create unique index if not exists uq_team_active_sprint
  on bluecore_v2.sprints(team_id)
  where status = 'in_progress';
