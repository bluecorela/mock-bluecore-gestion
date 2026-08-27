import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeeklyDashboardRepository } from './weekly-dashboard.repository';
import { WeeklyDashboardService } from './weekly-dashboard.service';
import { OrganizationService } from '../organization/organization.service';
import type { TeamOrganization } from '../organization/interfaces/organization.interface';

describe('WeeklyDashboardService', () => {
  let service: WeeklyDashboardService;
  let repository: jest.Mocked<
    Pick<
      WeeklyDashboardRepository,
      | 'teamExists'
      | 'findReports'
      | 'findReport'
      | 'saveReport'
      | 'findSprintsForWeek'
    >
  >;
  let organizationService: jest.Mocked<
    Pick<OrganizationService, 'findTeamOrganization'>
  >;

  beforeEach(() => {
    repository = {
      teamExists: jest.fn(),
      findReports: jest.fn(),
      findReport: jest.fn(),
      saveReport: jest.fn(),
      findSprintsForWeek: jest.fn(),
    };
    organizationService = { findTeamOrganization: jest.fn() };
    service = new WeeklyDashboardService(
      repository as unknown as WeeklyDashboardRepository,
      organizationService as unknown as OrganizationService,
    );
  });

  it('rejects report history for an unknown team', async () => {
    repository.teamExists.mockResolvedValue(false);

    await expect(service.findReports('team-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.findReports).not.toHaveBeenCalled();
  });

  it('returns an empty history for a team without reports', async () => {
    repository.teamExists.mockResolvedValue(true);
    repository.findReports.mockResolvedValue([]);

    await expect(service.findReports('team-id')).resolves.toEqual([]);
  });

  it('rejects an unknown weekly report', async () => {
    repository.findReport.mockResolvedValue(null);

    await expect(
      service.findReport('team-id', 'report-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a report whose week ends before it starts', async () => {
    repository.teamExists.mockResolvedValue(true);

    await expect(
      service.saveReport('team-id', {
        projectId: '00000000-0000-4000-8000-000000000001',
        weekNumber: 32,
        weekStart: '2026-08-10',
        weekEnd: '2026-08-09',
        committedPoints: 10,
        completedPoints: 8,
        wipStories: 2,
        initiatives: [],
        risks: [],
        quality: {
          defectsFound: 0,
          productionDefects: 0,
          criticalDefects: 0,
          resolvedDefects: 0,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.saveReport).not.toHaveBeenCalled();
  });

  it('returns the complete report after saving it', async () => {
    repository.teamExists.mockResolvedValue(true);
    repository.saveReport.mockResolvedValue('report-id');
    repository.findReport.mockResolvedValue({
      id: 'report-id',
      teamId: 'team-id',
      projectId: '00000000-0000-4000-8000-000000000001',
      sprintId: null,
      scrumMasterId: null,
      architectId: null,
      weekNumber: 32,
      weekStart: '2026-08-03',
      weekEnd: '2026-08-09',
      committedPoints: 10,
      completedPoints: 8,
      wipStories: 2,
      defectsFound: 1,
      productionDefects: 0,
      status: 'submitted',
      submittedBy: null,
      submittedAt: null,
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
      initiatives: [],
      risks: [],
      qualityMetrics: [],
    });
    const input = {
      projectId: '00000000-0000-4000-8000-000000000001',
      weekNumber: 32,
      weekStart: '2026-08-03',
      weekEnd: '2026-08-09',
      committedPoints: 10,
      completedPoints: 8,
      wipStories: 2,
      initiatives: [],
      risks: [],
      quality: {
        defectsFound: 1,
        productionDefects: 0,
        criticalDefects: 0,
        resolvedDefects: 1,
      },
    };

    await expect(service.saveReport('team-id', input)).resolves.toMatchObject({
      id: 'report-id',
    });
    expect(repository.saveReport).toHaveBeenCalledWith({
      teamId: 'team-id',
      ...input,
    });
  });

  it('builds the selected week context with active assignments and matching sprints', async () => {
    const organization: TeamOrganization = {
      team: {
        id: 'team-id',
        code: 'team-code',
        name: 'Example Team',
        description: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      },
      assignments: [
        {
          id: 'active',
          isPrimary: true,
          startedAt: '2026-01-01',
          endedAt: null,
          project: {
            id: 'project-id',
            clientId: 'client-id',
            code: 'project-code',
            name: 'Example Project',
            description: null,
            status: 'active',
            startDate: '2026-01-01',
            plannedEndDate: null,
            actualEndDate: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
            client: {
              id: 'client-id',
              code: 'client-code',
              name: 'Example Client',
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              deletedAt: null,
            },
          },
          members: [],
        },
        {
          id: 'ended',
          isPrimary: false,
          startedAt: '2025-01-01',
          endedAt: '2025-12-31',
          project: {
            id: 'old-project-id',
            clientId: 'client-id',
            code: 'old-project',
            name: 'Old Project',
            description: null,
            status: 'completed',
            startDate: '2025-01-01',
            plannedEndDate: '2025-12-31',
            actualEndDate: '2025-12-31',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-12-31T00:00:00.000Z',
            deletedAt: null,
            client: {
              id: 'client-id',
              code: 'client-code',
              name: 'Example Client',
              status: 'active',
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
              deletedAt: null,
            },
          },
          members: [],
        },
      ],
    };
    organizationService.findTeamOrganization.mockResolvedValue(organization);
    repository.findSprintsForWeek.mockResolvedValue([
      {
        id: 'sprint-id',
        projectId: 'project-id',
        sprintNumber: 17,
        name: 'Sprint 17',
        startDate: '2026-08-03',
        endDate: '2026-08-14',
        status: 'active',
        committedPoints: 10,
        completedPoints: 8,
        wipStories: 2,
      },
    ]);

    await expect(
      service.findContext('team-id', '2026-08-03'),
    ).resolves.toMatchObject({
      weekStart: '2026-08-03',
      weekEnd: '2026-08-09',
      assignments: [{ id: 'active' }],
      sprints: [{ id: 'sprint-id' }],
    });
  });
});
