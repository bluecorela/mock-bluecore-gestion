import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseClient } from '../../supabase/supabase.client';
import { SprintsRepository } from './sprints.repository';

describe('SprintsRepository.startTransactional', () => {
  const rpc = jest.fn();
  let repository: SprintsRepository;

  beforeEach(async () => {
    rpc.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        SprintsRepository,
        { provide: SupabaseClient, useValue: { getV2Client: () => ({ rpc }) } },
      ],
    }).compile();
    repository = module.get(SprintsRepository);
  });

  it('prioriza details conocido sobre el texto SQL', async () => {
    rpc.mockResolvedValue({
      error: {
        code: 'P0001',
        details: 'SPRINT_NOT_FOUND',
        message: 'Texto diferente',
      },
    });
    await expect(
      repository.startTransactional('team', 'sprint'),
    ).rejects.toMatchObject({
      status: 404,
      response: { statusCode: 404, code: 'SPRINT_NOT_FOUND' },
    });
  });
  it('elimina mediante RPC sin borrar directamente', async () => {
    rpc.mockResolvedValue({ error: null });
    await repository.deletePlanned('team', 'sprint');
    expect(rpc).toHaveBeenCalledWith('delete_planned_sprint', {
      p_team_id: 'team',
      p_sprint_id: 'sprint',
    });
  });

  it.each([
    ['P0002', NotFoundException],
    ['P0001', ConflictException],
    ['23503', ConflictException],
    ['XX000', InternalServerErrorException],
  ])('traduce error DELETE %s', async (code, exception) => {
    rpc.mockResolvedValue({ error: { code, message: 'Mensaje SQL' } });
    await expect(repository.deletePlanned('team', 'sprint')).rejects.toThrow(
      exception,
    );
  });

  it('llama la RPC y convierte el resultado a camelCase', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 'sprint',
        team_id: 'team',
        status: 'in_progress',
        committed_points: 16,
      },
      error: null,
    });
    await expect(
      repository.startTransactional('team', 'sprint'),
    ).resolves.toMatchObject({
      id: 'sprint',
      teamId: 'team',
      status: 'in_progress',
      committedPoints: 16,
    });
    expect(rpc).toHaveBeenCalledWith('start_sprint', {
      p_team_id: 'team',
      p_sprint_id: 'sprint',
    });
  });

  it.each([
    'Solo se puede iniciar un sprint planificado',
    'El equipo ya tiene un sprint en progreso',
    'Debes registrar al menos una historia de usuario antes de iniciar el sprint',
  ])('traduce P0001 a BadRequest conservando %s', async (message) => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } });
    const request = repository.startTransactional('team', 'sprint');
    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toThrow(message);
  });

  it('traduce el mensaje SQL del sprint anterior sin completar', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message:
          'No se puede iniciar un sprint mientras exista un sprint anterior sin cerrar',
      },
    });
    await expect(
      repository.startTransactional('team', 'sprint'),
    ).rejects.toMatchObject({
      status: 400,
      message:
        'No se puede iniciar un sprint mientras exista un sprint anterior sin completar',
    });
  });

  it.each(['Sprint not found', 'Sprint no encontrado'])(
    'traduce el sprint inexistente a NotFound: %s',
    async (message) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: 'P0001', message },
      });
      const request = repository.startTransactional('team', 'sprint');
      await expect(request).rejects.toBeInstanceOf(NotFoundException);
      await expect(request).rejects.toThrow('Sprint not found');
    },
  );

  it('propaga los errores inesperados como error interno', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'fallo' },
    });
    await expect(
      repository.startTransactional('team', 'sprint'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

describe('SprintsRepository cierre', () => {
  const teamId = '11111111-1111-4111-8111-111111111111';
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    then: jest.fn(),
    returns: jest.fn().mockReturnThis(),
  };
  const from = jest.fn(() => query);
  let repository: SprintsRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SprintsRepository,
        {
          provide: SupabaseClient,
          useValue: { getV2Client: () => ({ from }) },
        },
      ],
    }).compile();
    repository = module.get(SprintsRepository);
  });

  it('findTeamInitiatives filtra solo por team_id y aplica el estado calculado', async () => {
    query.then.mockImplementation((resolve: (value: unknown) => unknown) =>
      resolve({
        data: [
          {
            status: 'planned',
            progress_percentage: 100,
            start_date: '2026-10-01',
            actual_end_date: null,
            planned_end_date: '2026-10-20',
          },
        ],
        error: null,
      }),
    );
    await expect(repository.findTeamInitiatives(teamId)).resolves.toEqual([
      {
        status: 'completed',
        progressPercentage: 100,
        startDate: '2026-10-01',
        actualEndDate: null,
        plannedEndDate: '2026-10-20',
      },
    ]);
    expect(from).toHaveBeenCalledWith('team_initiatives');
    expect(query.eq.mock.calls).toEqual([['team_id', teamId]]);
  });

  it('findTransfersIn filtra por target_sprint_id y mapea source y moved_at', async () => {
    query.then.mockImplementation((resolve: (value: unknown) => unknown) =>
      resolve({
        data: [
          {
            story_id: 's1',
            source_sprint_id: 'sprint-4',
            source: { name: 'Sprint-4' },
            moved_at: '2026-11-05',
          },
        ],
        error: null,
      }),
    );
    await expect(repository.findTransfersIn('target')).resolves.toEqual([
      {
        storyId: 's1',
        sourceSprintId: 'sprint-4',
        sourceSprintName: 'Sprint-4',
        movedAt: '2026-11-05',
      },
    ]);
    expect(query.select).toHaveBeenCalledWith(
      'story_id, source_sprint_id, moved_at, source:sprints!sprint_user_story_transfers_source_sprint_id_fkey(name)',
    );
    expect(query.eq).toHaveBeenCalledWith('target_sprint_id', 'target');
  });

  it('busca el menor siguiente planned del mismo equipo y proyecto', async () => {
    query.maybeSingle.mockResolvedValue({
      data: { id: 'next', name: 'Sprint-5', sprint_number: 5 },
      error: null,
    });
    await expect(
      repository.findNextPlannedSprint(teamId, 'project', 4),
    ).resolves.toEqual({ id: 'next', name: 'Sprint-5', sprintNumber: 5 });
    expect(from).toHaveBeenCalledWith('sprints');
    expect(query.eq.mock.calls).toEqual([
      ['team_id', teamId],
      ['project_id', 'project'],
      ['status', 'planned'],
    ]);
    expect(query.gt).toHaveBeenCalledWith('sprint_number', 4);
    expect(query.order).toHaveBeenCalledWith('sprint_number', {
      ascending: true,
    });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it('no encuentra siguiente con proyecto null, como la igualdad SQL de la RPC', async () => {
    await expect(
      repository.findNextPlannedSprint(teamId, null, 4),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('devuelve null si no hay siguiente', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      repository.findNextPlannedSprint(teamId, 'project', 4),
    ).resolves.toBeNull();
  });

  it.each([true, false])(
    'lee los traslados con hint explícito (con datos=%s)',
    async (hasData) => {
      query.then.mockImplementation((resolve: (value: unknown) => unknown) =>
        resolve({
          data: hasData
            ? [
                {
                  story_id: 'hu',
                  target_sprint_id: 'next',
                  target: { name: 'Sprint-5' },
                },
              ]
            : [],
          error: null,
        }),
      );
      await expect(repository.findTransfersOut('source')).resolves.toEqual(
        hasData
          ? [
              {
                storyId: 'hu',
                targetSprintId: 'next',
                targetSprintName: 'Sprint-5',
              },
            ]
          : [],
      );
      expect(from).toHaveBeenCalledWith('sprint_user_story_transfers');
      expect(query.select).toHaveBeenCalledWith(
        'story_id, target_sprint_id, target:sprints!sprint_user_story_transfers_target_sprint_id_fkey(name)',
      );
      expect(query.eq).toHaveBeenCalledWith('source_sprint_id', 'source');
    },
  );
});
