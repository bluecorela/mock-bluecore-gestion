import { mapDashboard, mapSprint, mapTeamInitiative } from './sprint.mapper';

describe('sprint mappers', () => {
  it('maps a sprint database row to the domain contract', () => {
    const sprint = mapSprint({
      id: 'sprint-id',
      team_id: 'team-id',
      project_id: 'project-id',
      sprint_number: 4,
      name: 'Sprint-4',
      objective: null,
      status: 'in_progress',
      start_date: '2026-09-01',
      end_date: '2026-09-14',
      committed_points: 21,
      completed_points: 13,
      wip_stories: 4,
      scrum_master_id: null,
      architect_id: null,
      closed_at: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    });

    expect(sprint).toMatchObject({
      id: 'sprint-id',
      teamId: 'team-id',
      projectId: 'project-id',
      sprintNumber: 4,
      committedPoints: 21,
      completedPoints: 13,
    });
  });

  it('maps dashboard aggregate fields', () => {
    const dashboard = mapDashboard({
      sprint_id: 'sprint-id',
      stories_total: 4,
      stories_completed: 2,
      story_points_total: 21,
      story_points_completed: 13,
      completion_percentage: 62,
    });

    expect(dashboard.stories).toMatchObject({
      total: 4,
      completed: 2,
      pointsTotal: 21,
      pointsCompleted: 13,
    });
    expect(dashboard.completionPercentage).toBe(62);
  });

  it('preserves a cancelled team initiative status', () => {
    expect(
      mapTeamInitiative({
        status: 'cancelled',
        start_date: '2026-08-01',
        planned_end_date: '2026-08-31',
        progress_percentage: 100,
      }).status,
    ).toBe('cancelled');
  });
});
