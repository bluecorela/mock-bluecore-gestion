import { PerformanceService } from './performance.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('PerformanceService configuration', () => {
  it('maps the normalized v2 configuration to the existing endpoint contract', async () => {
    const dataService = {
      getPerformanceConfig: jest.fn().mockResolvedValue({
        questions: [
          { key: 'technicalKnowledge', label: 'Technical knowledge?' },
        ],
        answers: {
          technicalKnowledge: [{ value: 7.7, description: 'High' }],
        },
      }),
    };
    const service = new PerformanceService(
      dataService as unknown as SupabaseDataService,
    );

    await expect(service.getConfig()).resolves.toEqual({
      questions: [
        { key: 'technicalKnowledge', label: '1. Technical knowledge?' },
      ],
      answers: {
        technicalKnowledge: [{ value: 7.7, description: 'High' }],
      },
    });
  });

  it('returns the complete team evaluation context', async () => {
    const dataService = {
      getTeam: jest.fn().mockResolvedValue({ id: 'gb-web', name: 'GB Web' }),
      getEmployeeByTeam: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      getPerformanceConfig: jest
        .fn()
        .mockResolvedValue({ questions: [], answers: {} }),
      getActiveEnablement: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
      getPerformanceHistory: jest
        .fn()
        .mockResolvedValue([{ id: 'evaluation-1' }]),
    };
    const service = new PerformanceService(
      dataService as unknown as SupabaseDataService,
    );

    await expect(service.getContext('gb-web')).resolves.toMatchObject({
      team: { id: 'gb-web' },
      members: [{ id: 'employee-1' }],
      activeEnablement: { id: 'cycle-1' },
      history: [{ id: 'evaluation-1' }],
    });
  });
});
