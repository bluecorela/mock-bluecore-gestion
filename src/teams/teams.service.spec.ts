import { BadRequestException } from '@nestjs/common';
import { SprintsService } from '../sprints/services/sprints.service';
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
    findLegacyTeamsForUser: jest.fn(),
    getSprintsByTeam: jest.fn(),
    getRotationHistory: jest.fn(),
    getSprintEvaluationStatus: jest.fn(),
    getSprint: jest.fn(),
    getTeams: jest.fn(),
    getMembersBySprint: jest.fn(),
  } as unknown as SupabaseDataService;
  const sprintsService = {
    today: jest.fn().mockReturnValue('2026-11-11'),
    findByTeam: jest.fn().mockResolvedValue([]),
    dashboard: jest.fn(),
    findHomeInitiatives: jest.fn(),
  };
  const service = new TeamsService(
    operationsService,
    dataService,
    sprintsService as unknown as SprintsService,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('getDashboardData operational status', () => {
    beforeEach(() => {
      jest
        .spyOn(dataService, 'getTeam')
        .mockResolvedValue({ id: 'team', name: 'Team' });
      jest.spyOn(dataService, 'getEmployeeByTeam').mockResolvedValue([]);
      jest.spyOn(dataService, 'getRotationHistory').mockResolvedValue([]);
      operationsService.calculateLastClosedSprintPerformance = jest
        .fn()
        .mockReturnValue(null);
      operationsService.calculateSprintPerformance = jest
        .fn()
        .mockReturnValue(null);
    });
    it.each([false, true])(
      'uses operational states regardless of evaluations (evaluated=%s)',
      async (evaluated) => {
        jest
          .spyOn(dataService, 'getTeam')
          .mockResolvedValue({ id: 'team', name: 'Team' });
        jest.spyOn(dataService, 'getEmployeeByTeam').mockResolvedValue([
          {
            id: 'engineer',
            name: 'Ana',
            role: 'Ingeniero de Software',
            onVacation: false,
          } as Personnel,
        ]);
        jest.spyOn(dataService, 'getRotationHistory').mockResolvedValue([]);
        const states = [
          'planned',
          'in_progress',
          'cancelled',
          'completed',
          'completed',
        ] as const;
        jest.spyOn(dataService, 'getSprintsByTeam').mockResolvedValue(
          states.map((status, index) => ({
            id: `id-${index}`,
            code: `sprint-${index}`,
            team_id: 'team',
            start_date: `2026-11-${20 - index}`,
            end_date: null,
            sprint_closed: false,
            status,
          })),
        );
        jest.spyOn(dataService, 'getMembersBySprint').mockResolvedValue(
          evaluated
            ? [
                {
                  id: 'engineer',
                  name: 'Ana',
                  rating: 'Bueno',
                  total_final: 80,
                } as never,
              ]
            : [],
        );
        operationsService.calculateLastClosedSprintPerformance = jest
          .fn()
          .mockReturnValue(null);
        operationsService.calculateSprintPerformance = jest
          .fn()
          .mockReturnValue(null);

        const dashboard = await service.getDashboardData('team');

        expect(
          dashboard?.sprints.map(({ id, status }) => ({ id, status })),
        ).toEqual([
          { id: 'sprint-0', status: 'Planificado' },
          { id: 'sprint-1', status: 'En curso' },
          { id: 'sprint-2', status: 'Cancelado' },
          { id: 'sprint-3', status: 'Completado' },
          { id: 'sprint-4', status: 'Completado' },
        ]);
        expect(dashboard?.stats.totalSprints).toBe(2);
      },
    );

    it('returns zero completed sprints for an empty team', async () => {
      jest.spyOn(dataService, 'getSprintsByTeam').mockResolvedValue([]);
      const dashboard = await service.getDashboardData('team');
      expect(dashboard?.sprints).toEqual([]);
      expect(dashboard?.stats.totalSprints).toBe(0);
    });
  });

  describe('getHomeDashboard', () => {
    beforeEach(() => {
      sprintsService.today.mockReturnValue('2026-11-11');
      jest
        .spyOn(service, 'getTeam')
        .mockResolvedValue({ id: 'team-a', name: 'Team A' } as never);
      jest.spyOn(service, 'getDashboardData').mockResolvedValue(null as never);
    });
    afterEach(() => jest.restoreAllMocks());

    it.each([
      ['2026-11-11', 'in-progress'],
      ['2026-11-12', 'planned'],
    ])('selecciona el sprint actual con fecha local %s', async (today, id) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-12T02:00:00Z'));
      sprintsService.today.mockReturnValue(today);
      sprintsService.findByTeam.mockResolvedValueOnce([
        {
          id: 'in-progress',
          status: 'in_progress',
          startDate: '2026-10-29',
          endDate: '2026-11-11',
        },
        {
          id: 'planned',
          status: 'planned',
          startDate: '2026-11-12',
          endDate: '2026-11-25',
        },
      ]);

      try {
        const result = await service.getHomeDashboard('team-a');
        expect(result?.currentSprint?.id).toBe(id);
        expect(sprintsService.today).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('incluye las iniciativas del equipo', async () => {
      const initiatives = { active: [{ id: 'initiative' }], finished: [] };
      sprintsService.findHomeInitiatives.mockResolvedValue(initiatives);
      expect(await service.getHomeDashboard('team-a')).toMatchObject({
        initiatives,
      });
      expect(sprintsService.findHomeInitiatives).toHaveBeenCalledWith('team-a');
    });

    it('devuelve initiatives null si falla la consulta', async () => {
      const error = new Error('fallo');
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      sprintsService.findHomeInitiatives.mockRejectedValue(error);
      expect(await service.getHomeDashboard('team-a')).toMatchObject({
        team: { id: 'team-a' },
        initiatives: null,
      });
      expect(warn).toHaveBeenCalledWith(
        'Team initiatives unavailable for Home:',
        error,
      );
    });
  });

  it('returns every active team membership for a non-admin user', async () => {
    jest.spyOn(dataService, 'findLegacyTeamsForUser').mockResolvedValue([
      { id: 'team-a', name: 'Team A' },
      { id: 'team-b', name: 'Team B' },
    ]);

    await expect(
      service.findAllForUser({
        role: 'Arquitecto',
        personnelId: 'employee-id',
        employeeId: 'employee-id',
      } as never),
    ).resolves.toEqual([
      { id: 'team-a', name: 'Team A' },
      { id: 'team-b', name: 'Team B' },
    ]);
  });

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
    jest.spyOn(dataService, 'getSprint').mockResolvedValue({
      id: 'sprint-id',
      code: 'sprint-17',
      team_id: 'sgb-evolucion',
      start_date: '2026-08-03',
      end_date: '2026-08-14',
      sprint_closed: false,
      status: 'in_progress',
    });
    jest.spyOn(dataService, 'getEmployeeByTeam').mockResolvedValue([
      {
        id: 'employee-id',
        name: 'Ana Pérez',
        email: null,
        role: null,
        teamId: 'sgb-evolucion',
        status: 'activo',
        onVacation: false,
        replacementStartSprintId: null,
      },
    ]);

    await expect(service.saveEvaluation(evaluation)).resolves.toMatchObject({
      ok: true,
    });
    expect(dataService.saveEvaluation).toHaveBeenCalledWith({
      ...evaluation,
      employeeId: 'employee-id',
    });
  });

  it('rejects an incomplete sprint evaluation', async () => {
    await expect(
      service.saveEvaluation({ teamId: 'sgb-evolucion' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataService.saveEvaluation).not.toHaveBeenCalled();
  });

  it('rejects a sprint evaluation for someone outside the team', async () => {
    jest.spyOn(dataService, 'getSprint').mockResolvedValue(null);
    jest.spyOn(dataService, 'getEmployeeByTeam').mockResolvedValue([]);
    await expect(
      service.saveEvaluation({
        teamId: 'sgb-evolucion',
        sprintId: 'sprint-17',
        startDate: '2026-08-03',
        endDate: '2026-08-14',
        engineer: 'Otro empleado',
        metrics: {},
        finalScore: 80,
        ratingLabel: 'Bueno',
        evaluatorEmail: 'architect@example.com',
      }),
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
        status: 'in_progress',
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
