import { OtoService } from './oto.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('OtoService configuration', () => {
  it('maps the normalized v2 sections to the existing endpoint contract', async () => {
    const dataService = {
      getOtoConfig: jest.fn().mockResolvedValue({
        sections: [{
          id: 'softSkills',
          name: 'Soft skills',
          type: 'rating_with_options',
          questions: [{
            key: 'teamwork',
            label: 'Teamwork',
            options: [{ value: 3, description: 'High' }],
          }],
        }],
      }),
    };
    const service = new OtoService(dataService as unknown as SupabaseDataService);

    await expect(service.getConfig()).resolves.toEqual({
      sections: [{
        id: 'softSkills',
        name: 'Soft skills',
        type: 'rating_with_options',
        questions: [{
          key: 'teamwork',
          label: 'Teamwork',
          options: [{ value: 3, description: 'High' }],
        }],
      }],
    });
  });
});
