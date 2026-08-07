import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeeklyDashboardV2Repository } from './weekly-dashboard-v2.repository';
import { WeeklyDashboardV2Service } from './weekly-dashboard-v2.service';
import { OrganizationV2Service } from '../organization/organization-v2.service';

describe('WeeklyDashboardV2Service', () => {
  let service: WeeklyDashboardV2Service;
  let repository: jest.Mocked<Pick<WeeklyDashboardV2Repository,
    'teamExists' | 'findReports' | 'findReport' | 'saveReport' | 'findSprintsForWeek'>>;
  let organizationService: jest.Mocked<Pick<OrganizationV2Service, 'findTeamOrganization'>>;

  beforeEach(() => {
    repository = {
      teamExists: jest.fn(),
      findReports: jest.fn(),
      findReport: jest.fn(),
      saveReport: jest.fn(),
      findSprintsForWeek: jest.fn(),
    };
    organizationService = { findTeamOrganization: jest.fn() };
    service = new WeeklyDashboardV2Service(
      repository as unknown as WeeklyDashboardV2Repository,
      organizationService as unknown as OrganizationV2Service,
    );
  });

  it('rejects report history for an unknown team', async () => {
    repository.teamExists.mockResolvedValue(false);

    await expect(service.findReports('team-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findReports).not.toHaveBeenCalled();
  });

  it('returns an empty history for a team without reports', async () => {
    repository.teamExists.mockResolvedValue(true);
    repository.findReports.mockResolvedValue([]);

    await expect(service.findReports('team-id')).resolves.toEqual([]);
  });

  it('rejects an unknown weekly report', async () => {
    repository.findReport.mockResolvedValue(null);

    await expect(service.findReport('team-id', 'report-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a report whose week ends before it starts', async () => {
    repository.teamExists.mockResolvedValue(true);

    await expect(service.saveReport('team-id', {
      projectId: '00000000-0000-4000-8000-000000000001',
      weekNumber: 32,
      weekStart: '2026-08-10',
      weekEnd: '2026-08-09',
      committedPoints: 10,
      completedPoints: 8,
      wipStories: 2,
      initiatives: [],
      risks: [],
      quality: { defectsFound: 0, productionDefects: 0, criticalDefects: 0, resolvedDefects: 0 },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.saveReport).not.toHaveBeenCalled();
  });

  it('returns the complete report after saving it', async () => {
    repository.teamExists.mockResolvedValue(true);
    repository.saveReport.mockResolvedValue('report-id');
    repository.findReport.mockResolvedValue({ id: 'report-id', initiatives: [], risks: [] });
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
      quality: { defectsFound: 1, productionDefects: 0, criticalDefects: 0, resolvedDefects: 1 },
    };

    await expect(service.saveReport('team-id', input)).resolves.toMatchObject({ id: 'report-id' });
    expect(repository.saveReport).toHaveBeenCalledWith({ teamId: 'team-id', ...input });
  });

  it('builds the selected week context with active assignments and matching sprints', async () => {
    organizationService.findTeamOrganization.mockResolvedValue({
      team: { id: 'team-id' },
      assignments: [
        { id: 'active', startedAt: '2026-01-01', endedAt: null },
        { id: 'ended', startedAt: '2025-01-01', endedAt: '2025-12-31' },
      ],
    } as any);
    repository.findSprintsForWeek.mockResolvedValue([{ id: 'sprint-id' }]);

    await expect(service.findContext('team-id', '2026-08-03')).resolves.toMatchObject({
      weekStart: '2026-08-03',
      weekEnd: '2026-08-09',
      assignments: [{ id: 'active' }],
      sprints: [{ id: 'sprint-id' }],
    });
  });
});
