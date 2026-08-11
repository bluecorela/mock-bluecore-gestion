import { SidebarModulesService } from './sidebar-modules.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('SidebarModulesService', () => {
  it('returns the v2 navigation modules for the requested role', async () => {
    const modules = [{ id: 'module-id', name: 'Dashboard', route: '/dashboard' }];
    const dataService = { getModulesByRole: jest.fn().mockResolvedValue(modules) };
    const service = new SidebarModulesService(dataService as unknown as SupabaseDataService);

    await expect(service.getModulesByRole('Admin')).resolves.toEqual(modules);
    expect(dataService.getModulesByRole).toHaveBeenCalledWith('Admin');
  });

  it('saves module configuration through the transactional repository method', async () => {
    const saved = { id: 'module-id', code: 'performance', roleCodes: ['ADMIN'] };
    const dataService = { saveSidebarModule: jest.fn().mockResolvedValue(saved) };
    const service = new SidebarModulesService(dataService as unknown as SupabaseDataService);
    const input = { code: 'performance', name: 'Performance', route: '/performance', roleCodes: ['ADMIN'] };

    await expect(service.createModule(input)).resolves.toEqual(saved);
    expect(dataService.saveSidebarModule).toHaveBeenCalledWith(input);
  });
});
