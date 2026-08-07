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
});
