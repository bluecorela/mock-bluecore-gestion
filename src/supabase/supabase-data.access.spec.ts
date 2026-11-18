import { ForbiddenException } from '@nestjs/common';
import { SupabaseDataService } from './supabase-data.service';
import { SupabaseClient } from './supabase.client';
import { TeamDirectoryRepository } from './repositories/team-directory.repository';
import { NavigationRepository } from './repositories/navigation.repository';
import { OrganizationRepository } from '../organization/repositories/organization.repository';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

describe('Autorización heredada', () => {
  it('propaga errores de resolución sin conceder acceso', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      maybeSingle: async () => ({ data: null, error: new Error('database') }),
    };
    const service = new SupabaseDataService(
      {
        getV2Client: () => ({ from: () => query }),
      } as unknown as SupabaseClient,
      {} as TeamDirectoryRepository,
      {} as NavigationRepository,
      {} as OrganizationRepository,
    );
    await expect(
      service.assertLegacyTeamAccess('code', {
        employeeId: 'id',
      } as AuthenticatedUser),
    ).rejects.toThrow('database');
  });
});
