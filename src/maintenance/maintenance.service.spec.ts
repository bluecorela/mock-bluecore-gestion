import { MaintenanceService } from './maintenance.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('MaintenanceService', () => {
  it('returns the maintenance flag from app settings', async () => {
    const dataService = {
      getMaintenanceStatus: jest.fn().mockResolvedValue({ active: false }),
    };
    const service = new MaintenanceService(
      dataService as unknown as SupabaseDataService,
    );

    await expect(service.getStatus()).resolves.toEqual({ active: false });
  });
});
