import { RotationHistoryService } from './rotation-history.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('RotationHistoryService', () => {
  it('maps stored dates to Date instances', async () => {
    const dataService = {
      getRotationHistory: jest.fn().mockResolvedValue([{
        id: 'event-id', date: '2026-08-07T12:00:00.000Z', type: 'rotacion',
      }]),
    } as unknown as SupabaseDataService;
    const service = new RotationHistoryService(dataService);

    const result = await service.findAll();

    expect(result[0].date).toBeInstanceOf(Date);
    expect(dataService.getRotationHistory).toHaveBeenCalled();
  });
});
