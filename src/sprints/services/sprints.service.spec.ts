import { SprintsService } from './sprints.service';
import { SprintsRepository } from '../repositories/sprints.repository';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import { OrganizationService } from '../../organization/services/organization.service';
import type { Sprint } from '../interfaces/sprint.interface';

describe('SprintsService initialContext', () => {
  const sprint = (
    id: string,
    sprintNumber: number,
    status: Sprint['status'],
  ): Sprint => ({
    id,
    teamId: 'team-id',
    projectId: 'project-id',
    sprintNumber,
    name: `Sprint-${sprintNumber}`,
    objective: null,
    status,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    committedPoints: 0,
    completedPoints: 0,
    wipStories: 0,
    scrumMasterId: null,
    architectId: null,
    closedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  });

  const repository = {
    findByTeam: jest.fn(),
    findActiveInitiatives: jest.fn(),
    findInitiativesForPeriod: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    hasInProgressSprint: jest.fn(),
    hasPreviousUnclosedSprint: jest.fn(),
    completeTransactional: jest.fn(),
    createWithStories: jest.fn(),
  };
  const itemsRepository = {
    findAll: jest.fn(),
  };
  const organizationService = {
    findTeamOrganization: jest.fn(),
    findEmployees: jest.fn(),
  };
  let service: SprintsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findActiveInitiatives.mockResolvedValue([{ id: 'initiative' }]);
    organizationService.findTeamOrganization.mockResolvedValue({
      team: { id: 'team-id' },
      assignments: [],
    });
    organizationService.findEmployees.mockResolvedValue([]);
    repository.update.mockResolvedValue({ id: 'sprint-id' });
    repository.completeTransactional.mockResolvedValue({ id: 'sprint-id' });
    service = new SprintsService(
      repository as unknown as SprintsRepository,
      organizationService as unknown as OrganizationService,
      itemsRepository as unknown as SprintItemsRepository,
    );
  });

  it('prioritizes an active sprint over a completed sprint covering today', async () => {
    const sprints = [
      sprint('completed', 3, 'completed'),
      sprint('active', 4, 'in_progress'),
    ];
    repository.findByTeam.mockResolvedValue(sprints);
    jest.spyOn(service, 'fullDashboard').mockResolvedValue({} as never);
    const history = jest
      .spyOn(service, 'historyDashboard')
      .mockResolvedValue([]);

    const context = await service.initialContext('team-id', '2026-09-16');

    expect(context.selectedSprint?.id).toBe('active');
    expect(history).toHaveBeenCalledWith('team-id', 3, sprints);
    expect(repository.findByTeam).toHaveBeenCalledTimes(1);
  });

  it('returns team initiatives even if the team has no sprint', async () => {
    repository.findByTeam.mockResolvedValue([]);

    const context = await service.initialContext('team-id', '2026-09-16');

    expect(context.selectedSprint).toBeNull();
    expect(context.dashboard).toBeNull();
    expect(context.activeInitiatives).toEqual([{ id: 'initiative' }]);
    expect(repository.findByTeam).toHaveBeenCalledTimes(1);
  });

  it('loads initiatives by the selected sprint date range', async () => {
    repository.findInitiativesForPeriod.mockResolvedValue([{ id: 'long-running' }]);

    await expect(
      service.findInitiativesForPeriod('team-id', '2026-09-01', '2026-09-14'),
    ).resolves.toEqual([{ id: 'long-running' }]);
    expect(repository.findInitiativesForPeriod).toHaveBeenCalledWith(
      'team-id',
      '2026-09-01',
      '2026-09-14',
    );
  });

  it('rejects invalid initiative period dates', async () => {
    expect(() =>
      service.findInitiativesForPeriod('team-id', 'invalid', '2026-09-14'),
    ).toThrow('startDate and endDate must use the YYYY-MM-DD format');
  });

  it('chooses the next planned sprint after the active sprint is closed', async () => {
    repository.findByTeam.mockResolvedValue([
      sprint('older', 2, 'completed'),
      sprint('future', 4, 'planned'),
      sprint('latest', 3, 'completed'),
    ]);
    jest.spyOn(service, 'fullDashboard').mockResolvedValue({} as never);
    jest.spyOn(service, 'historyDashboard').mockResolvedValue([]);

    const context = await service.initialContext('team-id', '2026-10-16');

    expect(context.selectedSprint?.id).toBe('future');
  });

  it('calculates committed points from stories when starting a sprint', async () => {
    repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'planned'));
    repository.hasInProgressSprint.mockResolvedValue(false);
    repository.hasPreviousUnclosedSprint.mockResolvedValue(false);
    itemsRepository.findAll.mockResolvedValue([
      { storyPoints: 5 },
      { storyPoints: 8 },
    ]);

    await service.start('team-id', 'sprint-id');

    expect(repository.update).toHaveBeenCalledWith('team-id', 'sprint-id', {
      status: 'in_progress',
      committed_points: 13,
    });
  });

  it('creates a sprint and its requested generic user stories atomically', async () => {
    organizationService.findTeamOrganization.mockResolvedValue({
      team: { id: 'team-id' },
      assignments: [{
        project: { id: 'project-id' },
        startedAt: '2026-09-01',
        endedAt: null,
      }],
    });
    repository.createWithStories.mockResolvedValue({ id: 'sprint-id' });

    await service.create('team-id', {
      projectId: 'project-id',
      startDate: '2026-09-15',
      endDate: '2026-09-28',
      userStoryCount: 8,
    });

    expect(repository.createWithStories).toHaveBeenCalledWith(
      'team-id',
      expect.objectContaining({
        project_id: 'project-id',
        start_date: '2026-09-15',
        end_date: '2026-09-28',
        status: 'planned',
      }),
      8,
    );
  });

  it('delegates sprint closure to the transactional repository operation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
    try {
      repository.findById.mockResolvedValue(
        sprint('sprint-id', 4, 'in_progress'),
      );
      await service.complete('team-id', 'sprint-id');

      expect(repository.completeTransactional).toHaveBeenCalledWith(
        'team-id',
        'sprint-id',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('allows retrying an already completed sprint closure', async () => {
    repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'completed'));

    await service.complete('team-id', 'sprint-id');

    expect(repository.completeTransactional).toHaveBeenCalledWith(
      'team-id',
      'sprint-id',
    );
  });
});
