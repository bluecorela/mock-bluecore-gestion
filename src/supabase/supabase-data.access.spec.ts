import { ForbiddenException } from '@nestjs/common';
import { SupabaseDataService } from './supabase-data.service';
import type { SupabaseClient } from './supabase.client';
import type { TeamDirectoryRepository } from './repositories/team-directory.repository';
import type { NavigationRepository } from './repositories/navigation.repository';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

describe('SupabaseDataService team access', () => {
  const service = new SupabaseDataService(
    {} as SupabaseClient,
    {} as TeamDirectoryRepository,
    {} as NavigationRepository,
  );
  const user = {
    role: 'Arquitecto',
    personnelId: 'employee-1',
  } as AuthenticatedUser;

  it('denies access when the user is not an active team member', async () => {
    jest.spyOn(service, 'getEmployeeByTeam').mockResolvedValue([]);
    await expect(
      service.assertLegacyTeamAccess('another-team', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows access for an active team member', async () => {
    jest.spyOn(service, 'getEmployeeByTeam').mockResolvedValue([
      {
        id: 'employee-1',
        name: 'Ana',
        email: null,
        role: 'Arquitecto',
        teamId: 'team-1',
        status: 'activo',
        onVacation: false,
        replacementStartSprintId: null,
      },
    ]);
    await expect(
      service.assertLegacyTeamAccess('team-1', user),
    ).resolves.toBeUndefined();
  });
});
