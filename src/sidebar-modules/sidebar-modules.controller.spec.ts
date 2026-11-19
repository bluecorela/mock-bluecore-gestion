import { SidebarModulesController } from './sidebar-modules.controller';
import { SidebarModulesService } from './sidebar-modules.service';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

describe('SidebarModulesController', () => {
  it('returns modules provided by the service', async () => {
    const modules = [{ id: 'dashboard', name: 'Dashboard' }];
    const service = {
      getModulesByRole: jest.fn().mockResolvedValue(modules),
    } as unknown as SidebarModulesService;
    const controller = new SidebarModulesController(service);

    const user = { role: 'Admin' } as AuthenticatedUser;
    await expect(controller.getModulesByRole('Admin', user)).resolves.toEqual(
      modules,
    );
    expect(service.getModulesByRole).toHaveBeenCalledWith('Admin');
  });

  it('passes the module ID when updating sidebar configuration', async () => {
    const updated = { id: 'module-id', name: 'New name' };
    const service = {
      updateModule: jest.fn().mockResolvedValue(updated),
    } as unknown as SidebarModulesService;
    const controller = new SidebarModulesController(service);

    await expect(
      controller.updateModule('module-id', { name: 'New name' }),
    ).resolves.toEqual(updated);
    expect(service.updateModule).toHaveBeenCalledWith('module-id', {
      name: 'New name',
    });
  });
});
