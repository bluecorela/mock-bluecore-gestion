import { ForbiddenException } from '@nestjs/common';
import { WeeklyDashboardController } from './weekly-dashboard.controller';
import type { WeeklyDashboardService } from '../services/weekly-dashboard.service';
import type { OrganizationService } from '../../organization/services/organization.service';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';

describe('WeeklyDashboardController authorization', () => {
  const teamId = '00000000-0000-4000-8000-000000000001';
  const user = {
    role: 'Scrum Master',
    personnelId: 'employee-id',
  } as AuthenticatedUser;
  const service = {
    findReports: jest.fn(),
    saveReport: jest.fn(),
  } as unknown as WeeklyDashboardService;
  const organization = {
    assertTeamAccess: jest.fn(),
  } as unknown as OrganizationService;
  const controller = new WeeklyDashboardController(service, organization);

  beforeEach(() => jest.clearAllMocks());

  it('denies report reads for another team before querying data', async () => {
    jest
      .spyOn(organization, 'assertTeamAccess')
      .mockRejectedValue(new ForbiddenException());
    await expect(controller.findReports(teamId, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.findReports).not.toHaveBeenCalled();
  });

  it('denies report writes for another team before saving data', async () => {
    jest
      .spyOn(organization, 'assertTeamAccess')
      .mockRejectedValue(new ForbiddenException());
    await expect(
      controller.saveReport(teamId, {} as never, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.saveReport).not.toHaveBeenCalled();
  });
});
