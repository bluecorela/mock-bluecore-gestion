import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

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

    await expect(controller.create(dto, user)).resolves.toEqual({ id: 'employee-id' });
    expect(personnelService.create).toHaveBeenCalledWith(dto, 'auth-user-id');
  });
});
