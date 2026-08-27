import { BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { OperationsService } from '../operations/operations.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';
import type {
  Personnel,
  RotationHistory,
  Sprint,
} from '../supabase/interfaces/supabase-interface';

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
      teamId: 'sgb-evolucion',
      sprintId: 'sprint-17',
      startDate: '2026-08-03',
      endDate: '2026-08-14',
      engineer: 'Ana Pérez',
      metrics: { total1: 90 },
      finalScore: 90,
      ratingLabel: 'Excelente',
      evaluatorEmail: 'architect@bluecorela.com',
    };
    jest.spyOn(dataService, 'saveEvaluation').mockResolvedValue({
      ok: true,
      sprintClosed: false,
      evaluatedMembers: 1,
      expectedMembers: 1,
      nextState: {
        sprintId: 'sprint-18',
        sprintNumber: 18,
        teamMembers: [],
        dates: { startDate: '2026-08-17', endDate: '2026-08-21' },
        datesSaved: false,
        sprintClosed: false,
      },
    });

    await expect(service.saveEvaluation(evaluation)).resolves.toMatchObject({
      ok: true,
    });
    expect(dataService.saveEvaluation).toHaveBeenCalledWith(evaluation);
  });

  it('rejects an incomplete sprint evaluation', async () => {
    await expect(
      service.saveEvaluation({ teamId: 'sgb-evolucion' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataService.saveEvaluation).not.toHaveBeenCalled();
  });

  it('returns the sprint board context and filters unrelated rotations', async () => {
    jest
      .spyOn(dataService, 'getTeam')
      .mockResolvedValue({ id: 'gb-web', name: 'GB Web' });
    jest.spyOn(dataService, 'getEmployeeByTeam').mockResolvedValue([
      {
        id: 'employee-1',
        name: 'Example Employee',
        role: 'Ingeniero de Software',
        email: 'employee@example.com',
        teamId: 'gb-web',
        status: 'activo',
        onVacation: false,
        replacementStartSprintId: null,
      } satisfies Personnel,
    ]);
    jest.spyOn(dataService, 'getSprintsByTeam').mockResolvedValue([
      {
        id: 'sprint-id',
        code: 'sprint-1',
        team_id: 'gb-web',
        start_date: '2026-08-03',
        end_date: '2026-08-14',
        sprint_closed: false,
      } satisfies Sprint,
    ]);
    jest.spyOn(dataService, 'getRotationHistory').mockResolvedValue([
      { id: 'rotation-1', fromTeam: 'gb-web', toTeam: 'pool-de-vacaciones' },
      {
        id: 'rotation-2',
        fromTeam: 'sgb-evolucion',
        toTeam: 'sgb-laboratorio',
      },
    ] satisfies RotationHistory[]);
    jest.spyOn(dataService, 'getSprintEvaluationStatus').mockResolvedValue({
      sprintId: 'sprint-1',
      sprintNumber: 1,
      teamMembers: [],
      dates: { startDate: '2026-08-03', endDate: '2026-08-14' },
      datesSaved: true,
      sprintClosed: false,
    });

    await expect(
      service.getSprintBoardContext('gb-web'),
    ).resolves.toMatchObject({
      team: { id: 'gb-web' },
      rotationHistory: [{ id: 'rotation-1' }],
      evaluationStatus: { sprintId: 'sprint-1' },
    });
  });
});
