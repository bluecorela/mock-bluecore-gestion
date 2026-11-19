import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../../auth/admin.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { OrganizationController } from './organization.controller';

describe('OrganizationController: rutas de líderes', () => {
  it.each(['findTeamLeaders', 'findLeaderCandidates', 'replaceTeamLeader'])(
    '%s exige AuthGuard y AdminGuard',
    (method) => {
      const handler = (
        OrganizationController.prototype as unknown as Record<string, object>
      )[method];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toEqual(expect.arrayContaining([AuthGuard, AdminGuard]));
    },
  );
});
