import { BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { OperationsService } from '../operations/operations.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('TeamsService', () => {
  const operationsService = {} as OperationsService;
  const dataService = { saveEvaluation: jest.fn() } as unknown as SupabaseDataService;
  const service = new TeamsService(operationsService, dataService);

  beforeEach(() => jest.clearAllMocks());

  it('sends a complete sprint evaluation to the data service', async () => {
    const evaluation = {
      teamId: 'sgb-evolucion', sprintId: 'sprint-17',
      startDate: '2026-08-03', endDate: '2026-08-14', engineer: 'Ana Pérez',
      metrics: { total1: 90 }, finalScore: 90, ratingLabel: 'Excelente',
      evaluatorEmail: 'architect@bluecorela.com',
    };
    jest.spyOn(dataService, 'saveEvaluation').mockResolvedValue({ ok: true } as any);

    await expect(service.saveEvaluation(evaluation)).resolves.toEqual({ ok: true });
    expect(dataService.saveEvaluation).toHaveBeenCalledWith(evaluation);
  });

  it('rejects an incomplete sprint evaluation', async () => {
    await expect(service.saveEvaluation({ teamId: 'sgb-evolucion' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(dataService.saveEvaluation).not.toHaveBeenCalled();
  });
});
