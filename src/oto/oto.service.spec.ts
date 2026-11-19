import { OtoService } from './oto.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('OtoService configuration', () => {
  it('maps the normalized v2 sections to the existing endpoint contract', async () => {
    const dataService = {
      getOtoConfig: jest.fn().mockResolvedValue({
        sections: [
          {
            id: 'softSkills',
            name: 'Soft skills',
            type: 'rating_with_options',
            questions: [
              {
                key: 'teamwork',
                label: 'Teamwork',
                options: [{ value: 3, description: 'High' }],
              },
            ],
          },
        ],
      }),
    };
    const service = new OtoService(
      dataService as unknown as SupabaseDataService,
    );

    await expect(service.getConfig()).resolves.toEqual({
      sections: [
        {
          id: 'softSkills',
          name: 'Soft skills',
          type: 'rating_with_options',
          questions: [
            {
              key: 'teamwork',
              label: 'Teamwork',
              options: [{ value: 3, description: 'High' }],
            },
          ],
        },
      ],
    });
  });

  it('returns the complete One to One team context', async () => {
    const dataService = {
      getTeam: jest.fn().mockResolvedValue({ id: 'gb-web', name: 'GB Web' }),
      getEmployeeByTeam: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      getSprintsByTeam: jest.fn().mockResolvedValue([{ code: 'sprint-1' }]),
      getOtoConfig: jest.fn().mockResolvedValue({ sections: [] }),
      getOtoHistory: jest.fn().mockResolvedValue([{ id: 'session-1' }]),
    };
    const service = new OtoService(
      dataService as unknown as SupabaseDataService,
    );

    await expect(service.getContext('gb-web')).resolves.toMatchObject({
      team: { id: 'gb-web' },
      members: [{ id: 'employee-1' }],
      sprints: [{ id: 'sprint-1', name: 'sprint-1', sprintClosed: null }],
      history: [{ id: 'session-1' }],
    });
  });
});
