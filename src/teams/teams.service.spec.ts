import { BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { OperationsService } from '../operations/operations.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('TeamsService', () => {
  const operationsService = {} as OperationsService;
  const dataService = {
    saveEvaluation: jest.fn(),
    getTeam: jest.fn(),
    getEmployeeByTeam: jest.fn(),
    getSprintsByTeam: jest.fn(),
    getRotationHistory: jest.fn(),
    getSprintEvaluationStatus: jest.fn(),
  } as unknown as SupabaseDataService;
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

  it('returns the sprint board context and filters unrelated rotations', async () => {
    jest.spyOn(dataService, 'getTeam').mockResolvedValue({ id: 'gb-web', name: 'GB Web' });
    jest.spyOn(dataService, 'getEmployeeByTeam').mockResolvedValue([{ id: 'employee-1' }] as any);
    jest.spyOn(dataService, 'getSprintsByTeam').mockResolvedValue([{ code: 'sprint-1' }] as any);
    jest.spyOn(dataService, 'getRotationHistory').mockResolvedValue([
      { id: 'rotation-1', fromTeam: 'gb-web', toTeam: 'pool-de-vacaciones' },
      { id: 'rotation-2', fromTeam: 'sgb-evolucion', toTeam: 'sgb-laboratorio' },
    ] as any);
    jest.spyOn(dataService, 'getSprintEvaluationStatus').mockResolvedValue({ sprintId: 'sprint-1' } as any);

    await expect(service.getSprintBoardContext('gb-web')).resolves.toMatchObject({
      team: { id: 'gb-web' },
      rotationHistory: [{ id: 'rotation-1' }],
      evaluationStatus: { sprintId: 'sprint-1' },
    });
  });
});
