import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { ForbiddenException } from '@nestjs/common';

describe('PersonnelController', () => {
  it('passes the authenticated Supabase user to the service', async () => {
    const personnelService = {
      create: jest.fn().mockResolvedValue({ id: 'employee-id' }),
    } as unknown as PersonnelService;
    const controller = new PersonnelController(personnelService);
    const dto = {
      name: 'Ana Pérez',
      email: 'ana@bluecorela.com',
      role: 'Pasante',
      teamId: 'gb-web',
    };
    const user = { supabaseUserId: 'auth-user-id' } as AuthenticatedUser;

    await expect(controller.create(dto, user)).resolves.toEqual({
      id: 'employee-id',
    });
    expect(personnelService.create).toHaveBeenCalledWith(dto, 'auth-user-id');
  });

  it('allows a user to list personnel from any active team', async () => {
    const personnelService = {
      findByTeam: jest.fn().mockResolvedValue([{ id: 'employee-id' }]),
    } as unknown as PersonnelService;
    const controller = new PersonnelController(personnelService);
    const user = {
      role: 'Arquitecto',
      teamId: 'team-a',
      teamIds: ['team-a', 'team-b'],
    } as AuthenticatedUser;

    await expect(controller.findByTeam('TEAM-B', user)).resolves.toEqual([
      { id: 'employee-id' },
    ]);
    expect(personnelService.findByTeam).toHaveBeenCalledWith('TEAM-B');
  });

  it('rejects personnel queries for teams outside the active memberships', async () => {
    const personnelService = {
      findByTeam: jest.fn(),
    } as unknown as PersonnelService;
    const controller = new PersonnelController(personnelService);
    const user = {
      role: 'Arquitecto',
      teamId: 'team-a',
      teamIds: ['team-a', 'team-b'],
    } as AuthenticatedUser;

    await expect(controller.findByTeam('team-c', user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(personnelService.findByTeam).not.toHaveBeenCalled();
  });
});
