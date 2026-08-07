import { PerformanceService } from './performance.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('PerformanceService configuration', () => {
  it('maps the normalized v2 configuration to the existing endpoint contract', async () => {
    const dataService = {
      getPerformanceConfig: jest.fn().mockResolvedValue({
        questions: [{ key: 'technicalKnowledge', label: 'Technical knowledge?' }],
        answers: {
          technicalKnowledge: [{ value: 7.7, description: 'High' }],
        },
      }),
    };
    const service = new PerformanceService(dataService as unknown as SupabaseDataService);

    await expect(service.getConfig()).resolves.toEqual({
      questions: [{ key: 'technicalKnowledge', label: '1. Technical knowledge?' }],
      answers: {
        technicalKnowledge: [{ value: 7.7, description: 'High' }],
      },
    });
  });
});
