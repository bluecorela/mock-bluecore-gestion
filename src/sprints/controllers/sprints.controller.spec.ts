import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsService } from '../services/sprints.service';
import { OrganizationService } from '../../organization/services/organization.service';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';

describe('SprintsController eliminar', () => {
  it('verifica equipo antes de delegar', async () => {
    const service = { remove: jest.fn() };
    const organization = { assertTeamLeader: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [SprintsController],
      providers: [
        { provide: SprintsService, useValue: service },
        { provide: OrganizationService, useValue: organization },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get(SprintsController);
    const user = { role: 'Arquitecto' } as AuthenticatedUser;
    await controller.remove('team', 'sprint', user);
    expect(organization.assertTeamLeader).toHaveBeenCalledWith('team', user, [
      'ARCHITECT',
    ]);
    expect(service.remove).toHaveBeenCalledWith('team', 'sprint');
    service.remove.mockClear();
    organization.assertTeamLeader.mockRejectedValue(new ForbiddenException());
    await expect(controller.remove('otro', 'sprint', user)).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.remove).not.toHaveBeenCalled();
  });
  it.each(['Admin', 'Arquitecto', 'Scrum Master'])(
    'permisos de DELETE: %s',
    (role) => {
      const context = {
        getHandler: () => SprintsController.prototype.remove,
        getClass: () => SprintsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as unknown as ExecutionContext;
      const guard = new RolesGuard(new Reflector());
      if (role === 'Scrum Master')
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      else expect(guard.canActivate(context)).toBe(true);
    },
  );
});
