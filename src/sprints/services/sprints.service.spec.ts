import { StoryLoadService } from '../load/story-load.service';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateSprintDto, UpdateSprintDto } from '../dto/sprint.dto';
import { SprintsService } from './sprints.service';
import { SprintsRepository } from '../repositories/sprints.repository';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import { OrganizationService } from '../../organization/services/organization.service';
import type { Sprint } from '../interfaces/sprint.interface';

const user = {
  personnelId: 'px4vN55npYtPR3YnEERp',
  employeeId: 'employee',
} as AuthenticatedUser;

describe('SprintsService initialContext', () => {
  const sprint = (
    id: string,
    sprintNumber: number,
    status: Sprint['status'],
  ): Sprint => ({
    id,
    teamId: 'team-id',
    projectId: 'project-id',
    sprintNumber,
    name: `Sprint-${sprintNumber}`,
    objective: null,
    status,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    committedPoints: 0,
    completedPoints: 0,
    closedScopePoints: null,
    wipStories: 0,
    scrumMasterId: null,
    architectId: null,
    closedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  });

  const repository = {
    findDashboard: jest.fn(),
    findNextPlannedSprint: jest.fn(),
    findTransfersOut: jest.fn(),
    findTransfersIn: jest.fn(),
    findTeamInitiatives: jest.fn(),
    findByTeam: jest.fn(),
    findActiveInitiatives: jest.fn(),
    findInitiativesForPeriod: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    hasInProgressSprint: jest.fn(),
    hasPreviousUnclosedSprint: jest.fn(),
    deletePlanned: jest.fn(),
    completeTransactional: jest.fn(),
    startTransactional: jest.fn(),
    createWithStories: jest.fn(),
    updateTeamInitiative: jest.fn(),
  };
  const itemsRepository = {
    countBySprint: jest.fn(),
    findAll: jest.fn(),
  };
  const organizationService = {
    findTeamOrganization: jest.fn(),
    findEmployees: jest.fn(),
    findTeamLeaders: jest.fn(),
  };
  const storyLoad = {
    previewNewSprint: jest.fn(),
    applyNewSprint: jest.fn(),
  };
  let service: SprintsService;

  it('delegación atómica de eliminar y propagación del conflicto', async () => {
    repository.deletePlanned.mockResolvedValue(undefined);
    await service.remove('team', 'sprint');
    expect(repository.deletePlanned).toHaveBeenCalledWith('team', 'sprint');
    repository.deletePlanned.mockRejectedValue(
      new Error('Solo se puede eliminar un sprint planificado sin historias'),
    );
    await expect(service.remove('team', 'sprint')).rejects.toThrow(
      'Solo se puede eliminar',
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findNextPlannedSprint.mockResolvedValue(null);
    repository.findTransfersOut.mockResolvedValue([]);
    repository.findTransfersIn.mockResolvedValue([]);
    repository.findById.mockResolvedValue({ closedScopePoints: null });
    organizationService.findTeamLeaders.mockResolvedValue({
      architect: { id: 'architect-id' },
      scrumMaster: { id: 'sm-id' },
    });
    repository.findActiveInitiatives.mockResolvedValue([{ id: 'initiative' }]);
    organizationService.findTeamOrganization.mockResolvedValue({
      team: { id: 'team-id' },
      assignments: [],
    });
    organizationService.findEmployees.mockResolvedValue([]);
    repository.update.mockResolvedValue({ id: 'sprint-id' });
    repository.completeTransactional.mockResolvedValue({ id: 'sprint-id' });
    repository.startTransactional.mockResolvedValue({
      id: 'sprint-id',
      committedPoints: 16,
    });
    service = new SprintsService(
      repository as unknown as SprintsRepository,
      organizationService as unknown as OrganizationService,
      itemsRepository as unknown as SprintItemsRepository,
      storyLoad as unknown as StoryLoadService,
    );
  });

  describe('findHomeInitiatives', () => {
    const today = '2026-11-11';
    const run = (rows: Record<string, unknown>[]) => {
      repository.findTeamInitiatives.mockResolvedValue(rows);
      return service.findHomeInitiatives('team-a', today);
    };

    it('separa activas y finalizadas por estado calculado', async () => {
      const active = [{ status: 'in_progress' }, { status: 'at_risk' }];
      const finished = [{ status: 'completed', actualEndDate: '2026-11-01' }];
      expect(
        await run([...active, ...finished, { status: 'cancelled' }]),
      ).toEqual({ active, finished });
      expect(repository.findTeamInitiatives).toHaveBeenCalledWith('team-a');
    });

    it('usa plannedEndDate si no hay fecha real', async () => {
      const row = {
        status: 'completed',
        actualEndDate: null,
        plannedEndDate: '2026-10-20',
      };
      expect((await run([row])).finished).toEqual([row]);
    });

    it('incluye el límite de 30 días y excluye el 31', async () => {
      const row = { status: 'completed', actualEndDate: '2026-10-12' };
      expect(
        (await run([row, { status: 'completed', actualEndDate: '2026-10-11' }]))
          .finished,
      ).toEqual([row]);
    });

    it('excluye finalizadas sin fechas', async () => {
      expect(
        await run([
          { status: 'completed', actualEndDate: null, plannedEndDate: null },
        ]),
      ).toEqual({ active: [], finished: [] });
    });

    it('ordena activas por fin planificado y finalizadas por fin descendente', async () => {
      const active = ['2026-12-01', null, '2026-11-20'].map(
        (plannedEndDate) => ({ status: 'in_progress', plannedEndDate }),
      );
      const finished = ['2026-10-20', '2026-11-05'].map((actualEndDate) => ({
        status: 'completed',
        actualEndDate,
      }));
      expect(await run([...active, ...finished])).toEqual({
        active: [active[2], active[0], active[1]],
        finished: [finished[1], finished[0]],
      });
    });
  });

  it.each([
    [
      true,
      true,
      false,
      'Las HU pendientes se moverán al Sprint-5 con su mismo código y estado.',
    ],
    [
      true,
      false,
      true,
      'Hay HU pendientes y no hay un siguiente sprint planificado del mismo proyecto. Créalo para poder completar.',
    ],
    [false, false, false, 'No hay HU pendientes por mover.'],
  ])(
    'closure summary pending=%s next=%s',
    async (pending, next, requiresNextSprint, carryOverMessage) => {
      repository.findById.mockResolvedValue(
        sprint('sprint-id', 4, 'in_progress'),
      );
      repository.findNextPlannedSprint.mockResolvedValue(
        next ? { id: 'next', name: 'Sprint-5', sprintNumber: 5 } : null,
      );
      itemsRepository.findAll.mockImplementation(async (table: string) =>
        table === 'sprint_user_stories'
          ? pending
            ? [{ status: 'planned' }, { status: 'blocked' }]
            : [{ status: 'completed' }, { status: 'cancelled' }]
          : [],
      );
      const result = await service.closureSummary('team-id', 'sprint-id');
      expect(result).toMatchObject({
        nextSprint: next ? { id: 'next', name: 'Sprint-5' } : null,
        requiresNextSprint,
        carryOverMessage,
      });
      expect(repository.findNextPlannedSprint).toHaveBeenCalledWith(
        'team-id',
        'project-id',
        4,
      );
    },
  );

  it('impide iniciar si hay un sprint anterior sin completar', async () => {
    repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'planned'));
    repository.hasInProgressSprint.mockResolvedValue(false);
    repository.hasPreviousUnclosedSprint.mockResolvedValue(true);
    await expect(service.start('team-id', 'sprint-id')).rejects.toThrow(
      'No se puede iniciar un sprint mientras exista un sprint anterior sin completar',
    );
  });

  it('indica la fecha a partir de la cual se puede completar', async () => {
    repository.findById.mockResolvedValue({
      ...sprint('sprint-id', 4, 'in_progress'),
      endDate: '2099-12-31',
    });
    await expect(service.complete('team-id', 'sprint-id')).rejects.toThrow(
      'El sprint solo se puede completar a partir del 2099-12-31',
    );
  });

  describe('dashboard scope', () => {
    const addedStories = [
      ...Array.from({ length: 4 }, (_, index) => ({
        addedAfterStart: false,
        storyPoints: index < 2 ? 2.5 : 0,
        status: index < 2 ? 'completed' : 'planned',
      })),
      { addedAfterStart: true, storyPoints: 3, status: 'completed' },
      { addedAfterStart: true, storyPoints: 3, status: 'planned' },
    ];

    beforeEach(() => {
      repository.findDashboard.mockResolvedValue({
        sprint: { status: 'in_progress', committedPoints: 10 },
        stories: {
          planned: 3,
          inProgress: 0,
          blocked: 0,
          completed: 3,
          total: 6,
          pointsTotal: 16,
          pointsCompleted: 8,
        },
        completionPercentage: 0,
      });
      itemsRepository.countBySprint.mockResolvedValue(0);
      itemsRepository.findAll.mockResolvedValue(addedStories);
    });

    it.each([
      [
        ['story-b'],
        [{ sprintId: 'sprint-2', sprintName: 'Sprint-2', count: 1 }],
      ],
      [['story-a', 'story-b'], []],
    ])(
      'transferredOut excluye HU devueltas: %s',
      async (currentIds, expected) => {
        itemsRepository.findAll.mockResolvedValue(
          currentIds.map((id) => ({ id })),
        );
        repository.findTransfersOut.mockResolvedValue(
          ['story-a', 'story-b'].map((storyId) => ({
            storyId,
            targetSprintId: 'sprint-2',
            targetSprintName: 'Sprint-2',
          })),
        );
        const result = await service.dashboard('team-id', 'sprint-id');
        expect(result.stories.transferredOut).toEqual(expected);
      },
    );

    const transfer = (
      storyId: string,
      source: number,
      movedAt = '2026-11-05',
    ) => ({
      storyId,
      sourceSprintId: 'sprint-' + source,
      sourceSprintName: 'Sprint-' + source,
      movedAt,
    });

    it.each([
      [
        'cuenta recibidas distintas que siguen en el sprint',
        [transfer('s1', 4), transfer('s1', 4), transfer('s2', 4)],
        [{ sprintId: 'sprint-4', sprintName: 'Sprint-4', count: 2 }],
      ],
      [
        'cuenta cada HU solo en su último origen',
        [transfer('s1', 4, '2026-11-05'), transfer('s1', 3, '2026-11-01')],
        [{ sprintId: 'sprint-4', sprintName: 'Sprint-4', count: 1 }],
      ],
      [
        'cuenta cada HU solo en su último origen aunque llegue al final',
        [transfer('s1', 3, '2026-11-01'), transfer('s1', 4, '2026-11-05')],
        [{ sprintId: 'sprint-4', sprintName: 'Sprint-4', count: 1 }],
      ],
      ['excluye recibidas que ya salieron del sprint', [transfer('s3', 4)], []],
      [
        'ordena recibidas numéricamente',
        [transfer('s1', 10), transfer('s2', 5)],
        [
          { sprintId: 'sprint-5', sprintName: 'Sprint-5', count: 1 },
          { sprintId: 'sprint-10', sprintName: 'Sprint-10', count: 1 },
        ],
      ],
    ])('%s', async (_name, transfers, expected) => {
      itemsRepository.findAll.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      repository.findTransfersIn.mockResolvedValue(transfers);
      const result = await service.dashboard('team-id', 'sprint-id');
      expect(result.stories.transferredIn).toEqual(expected);
      expect(repository.findTransfersIn).toHaveBeenCalledWith('sprint-id');
    });

    it.each([
      [20, 20, 40],
      [null, 15, 53.33],
      [0, 0, 0],
    ])(
      'uses frozen scope %s and distinct transfers',
      async (closedScopePoints, scopePoints, percentage) => {
        repository.findById.mockResolvedValue({
          status: 'completed',
          closedScopePoints,
        });
        repository.findDashboard.mockResolvedValue({
          sprint: { status: 'completed', committedPoints: 15 },
          stories: { pointsCompleted: 8 },
        });
        itemsRepository.findAll.mockResolvedValue([]);
        repository.findTransfersOut.mockResolvedValue([
          { storyId: '4', targetSprintId: 'six', targetSprintName: 'Sprint-6' },
          ...['1', '2', '3', '1'].map((storyId) => ({
            storyId,
            targetSprintId: 'five',
            targetSprintName: 'Sprint-5',
          })),
        ]);
        const result = await service.dashboard('team-id', 'sprint-id');
        expect(result.sprint).toMatchObject({ closedScopePoints });
        expect(result.stories.scopePoints).toBe(scopePoints);
        expect(result.completionPercentage).toBe(percentage);
        expect(result.stories).toMatchObject({
          transferredOut: [
            { sprintId: 'five', sprintName: 'Sprint-5', count: 3 },
            { sprintId: 'six', sprintName: 'Sprint-6', count: 1 },
          ],
        });
        expect(repository.findById).toHaveBeenCalledWith(
          'team-id',
          'sprint-id',
        );
        expect(repository.findTransfersOut).toHaveBeenCalledWith('sprint-id');
      },
    );

    it('includes added stories and uses scope for completion and delivery', async () => {
      const result = await service.dashboard('team-id', 'sprint-id');
      expect(result.stories).toMatchObject({
        transferredOut: [],
        addedAfterStart: { count: 2, points: 6 },
        scopePoints: 16,
        pointsTotal: 16,
        pointsCompleted: 8,
        total: 6,
      });
      expect(result.completionPercentage).toBe(50);
      // Delivery 50 * .5 + quality 100 * .25 + stories 50 * .15 + risks 100 * .1.
      expect(result.performanceScore).toBe(67.5);
    });

    it.each([
      ['in_progress', 10, 16, 20, 10, 100],
      ['completed', 10, 10, 8, 10, 80],
      ['planned', 0, 12, 3, 12, 25],
      ['cancelled', 0, 0, 8, 0, 0],
      ['in_progress', 3, 3, 1, 3, 33.33],
    ])(
      'calculates %s scope and completion',
      async (
        status,
        committedPoints,
        pointsTotal,
        pointsCompleted,
        scopePoints,
        percentage,
      ) => {
        itemsRepository.findAll.mockResolvedValue([]);
        repository.findDashboard.mockResolvedValue({
          sprint: { status, committedPoints, completedPoints: pointsCompleted },
          stories: { pointsTotal, pointsCompleted },
          completionPercentage: status === 'completed' ? 80 : 0,
        });
        const result = await service.dashboard('team-id', 'sprint-id');
        expect(result.stories.scopePoints).toBe(scopePoints);
        expect(result.stories.addedAfterStart).toEqual({ count: 0, points: 0 });
        expect(result.completionPercentage).toBe(percentage);
      },
    );
  });

  describe('dashboard performanceScore delivery', () => {
    it.each([
      // scopePoints 10 (committedPoints) frente a pointsTotal 16: debe usar el alcance.
      [8, 75],
      // Entrega por encima del alcance: se limita a 100.
      [20, 85],
    ])(
      'uses scopePoints for delivery (completed %s -> score %s)',
      async (pointsCompleted, score) => {
        itemsRepository.countBySprint.mockResolvedValue(0);
        itemsRepository.findAll.mockResolvedValue([]);
        repository.findDashboard.mockResolvedValue({
          sprint: { status: 'in_progress', committedPoints: 10 },
          stories: { pointsTotal: 16, pointsCompleted },
          completionPercentage: 0,
        });
        const result = await service.dashboard('team-id', 'sprint-id');
        expect(result.stories.scopePoints).toBe(10);
        // delivery * .5 + quality 100 * .25 + stories 0 + risks 100 * .1
        expect(result.performanceScore).toBe(score);
      },
    );
  });

  it('prioritizes an active sprint over a completed sprint covering today', async () => {
    const sprints = [
      sprint('completed', 3, 'completed'),
      sprint('active', 4, 'in_progress'),
    ];
    repository.findByTeam.mockResolvedValue(sprints);
    jest.spyOn(service, 'fullDashboard').mockResolvedValue({} as never);
    const history = jest
      .spyOn(service, 'historyDashboard')
      .mockResolvedValue([]);

    const context = await service.initialContext('team-id', '2026-09-16');

    expect(context.selectedSprint?.id).toBe('active');
    expect(history).toHaveBeenCalledWith('team-id', 3, sprints);
    expect(repository.findByTeam).toHaveBeenCalledTimes(1);
  });

  it('returns team initiatives even if the team has no sprint', async () => {
    repository.findByTeam.mockResolvedValue([]);

    const context = await service.initialContext('team-id', '2026-09-16');

    expect(context.selectedSprint).toBeNull();
    expect(context.dashboard).toBeNull();
    expect(context.activeInitiatives).toEqual([{ id: 'initiative' }]);
    expect(repository.findByTeam).toHaveBeenCalledTimes(1);
  });

  it('loads initiatives by the selected sprint date range', async () => {
    repository.findInitiativesForPeriod.mockResolvedValue([
      { id: 'long-running' },
    ]);

    await expect(
      service.findInitiativesForPeriod('team-id', '2026-09-01', '2026-09-14'),
    ).resolves.toEqual([{ id: 'long-running' }]);
    expect(repository.findInitiativesForPeriod).toHaveBeenCalledWith(
      'team-id',
      '2026-09-01',
      '2026-09-14',
    );
  });

  it('rejects invalid initiative period dates', async () => {
    expect(() =>
      service.findInitiativesForPeriod('team-id', 'invalid', '2026-09-14'),
    ).toThrow('startDate and endDate must use the YYYY-MM-DD format');
  });

  it('updates a team initiative using database field names', async () => {
    repository.updateTeamInitiative.mockResolvedValue({ id: 'initiative-id' });

    await service.updateTeamInitiative('team-id', 'initiative-id', {
      name: 'Nueva iniciativa',
      progressPercentage: 45,
      plannedEndDate: '2026-12-31',
    });

    expect(repository.updateTeamInitiative).toHaveBeenCalledWith(
      'team-id',
      'initiative-id',
      {
        name: 'Nueva iniciativa',
        progress_percentage: 45,
        planned_end_date: '2026-12-31',
      },
    );
  });

  it('chooses the next planned sprint after the active sprint is closed', async () => {
    repository.findByTeam.mockResolvedValue([
      sprint('older', 2, 'completed'),
      sprint('future', 4, 'planned'),
      sprint('latest', 3, 'completed'),
    ]);
    jest.spyOn(service, 'fullDashboard').mockResolvedValue({} as never);
    jest.spyOn(service, 'historyDashboard').mockResolvedValue([]);

    const context = await service.initialContext('team-id', '2026-10-16');

    expect(context.selectedSprint?.id).toBe('future');
  });

  it('delega el inicio y el cálculo de puntos comprometidos a la RPC', async () => {
    repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'planned'));
    repository.hasInProgressSprint.mockResolvedValue(false);
    repository.hasPreviousUnclosedSprint.mockResolvedValue(false);
    itemsRepository.findAll.mockResolvedValue([
      { storyPoints: 5 },
      { storyPoints: 8 },
    ]);

    await expect(service.start('team-id', 'sprint-id')).resolves.toEqual({
      id: 'sprint-id',
      committedPoints: 16,
    });
    expect(repository.startTransactional).toHaveBeenCalledWith(
      'team-id',
      'sprint-id',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('propaga el rechazo transaccional si cambió el estado tras las lecturas previas', async () => {
    repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'planned'));
    repository.hasInProgressSprint.mockResolvedValue(false);
    repository.hasPreviousUnclosedSprint.mockResolvedValue(false);
    itemsRepository.findAll.mockResolvedValue([{ storyPoints: 3 }]);
    const error = new BadRequestException(
      'Solo se puede iniciar un sprint planificado',
    );
    repository.startTransactional.mockRejectedValueOnce(error);

    await expect(service.start('team-id', 'sprint-id')).rejects.toBe(error);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('creates a sprint and its requested generic user stories atomically', async () => {
    organizationService.findTeamOrganization.mockResolvedValue({
      team: { id: 'team-id' },
      assignments: [
        {
          project: { id: 'project-id' },
          startedAt: '2026-09-01',
          endedAt: null,
        },
      ],
    });
    repository.createWithStories.mockResolvedValue({ id: 'sprint-id' });

    await service.create(
      'team-id',
      {
        projectId: 'project-id',
        startDate: '2026-09-15',
        endDate: '2026-09-28',
        userStoryCount: 8,
      },
      user,
    );

    expect(repository.createWithStories).toHaveBeenCalledWith(
      'team-id',
      expect.objectContaining({
        project_id: 'project-id',
        start_date: '2026-09-15',
        end_date: '2026-09-28',
        status: 'planned',
      }),
      8,
    );
  });

  describe('líderes derivados del equipo', () => {
    const input = {
      projectId: 'project-id',
      startDate: '2026-09-15',
      endDate: '2026-09-28',
      userStoryCount: 8,
    };

    beforeEach(() => {
      organizationService.findTeamOrganization.mockResolvedValue({
        team: { id: 'team-id' },
        assignments: [
          {
            project: { id: 'project-id' },
            startedAt: '2026-09-01',
            endedAt: null,
          },
        ],
      });
      repository.createWithStories.mockResolvedValue({ id: 'sprint-id' });
    });

    it('conserva solo arquitecto cuando los líderes heredados coinciden', async () => {
      organizationService.findTeamLeaders.mockResolvedValue({
        architect: { id: 'misma-persona', fullName: 'Persona' },
        scrumMaster: { id: 'misma-persona', fullName: 'Persona' },
      });
      const preview = await service.preview('team-id', input, user);
      expect(preview.sprint.scrumMaster).toBeNull();
      await service.create('team-id', input, user);
      expect(repository.createWithStories).toHaveBeenCalledWith(
        'team-id',
        expect.objectContaining({
          architect_id: 'misma-persona',
          scrum_master_id: null,
        }),
        8,
      );
    });

    it('cablea preview y create con el mismo sprint firmado y los líderes del equipo', async () => {
      const stories = [{ name: 'Historia', storyPoints: 3 }];
      const confirmationToken = 'token-confirmado';
      const request = {
        ...input,
        userStoryCount: 0,
        objective: '  Objetivo del sprint  ',
        committedPoints: 3,
        stories,
      };
      const signedSprint = {
        projectId: input.projectId,
        startDate: input.startDate,
        endDate: input.endDate,
        objective: request.objective,
        committedPoints: 3,
        architectId: 'architect-id',
        scrumMasterId: 'sm-id',
      };

      await service.preview('team-id', request, user);
      await service.create('team-id', { ...request, confirmationToken }, user);

      expect(storyLoad.previewNewSprint).toHaveBeenCalledWith(
        'team-id',
        user,
        signedSprint,
        { stories },
      );
      expect(storyLoad.applyNewSprint).toHaveBeenCalledWith(
        'team-id',
        user,
        signedSprint,
        {
          project_id: input.projectId,
          start_date: input.startDate,
          end_date: input.endDate,
          objective: 'Objetivo del sprint',
          committed_points: 3,
          architect_id: 'architect-id',
          scrum_master_id: 'sm-id',
          status: 'planned',
        },
        { stories, confirmationToken },
      );
      expect(storyLoad.previewNewSprint.mock.calls[0][2]).toEqual(
        storyLoad.applyNewSprint.mock.calls[0][2],
      );
      expect(repository.createWithStories).not.toHaveBeenCalled();
    });

    it.each(['', '   ', undefined])(
      'guarda el objetivo vacío %p como null y los puntos omitidos como cero',
      async (objective) => {
        await service.create('team-id', { ...input, objective }, user);
        expect(repository.createWithStories).toHaveBeenCalledWith(
          'team-id',
          expect.objectContaining({ objective: null, committed_points: 0 }),
          8,
        );
      },
    );

    it('crea el sprint con los ids de los líderes del equipo', async () => {
      await service.create('team-id', input, user);

      expect(organizationService.findTeamLeaders).toHaveBeenCalledWith(
        'team-id',
      );
      expect(repository.createWithStories).toHaveBeenCalledWith(
        'team-id',
        expect.objectContaining({
          architect_id: 'architect-id',
          scrum_master_id: 'sm-id',
        }),
        8,
      );
    });

    it('crea el sprint sin Scrum Master con su id nulo', async () => {
      organizationService.findTeamLeaders.mockResolvedValue({
        architect: { id: 'architect-id' },
        scrumMaster: null,
      });

      await expect(service.create('team-id', input, user)).resolves.toEqual({
        id: 'sprint-id',
      });
      expect(repository.createWithStories).toHaveBeenCalledWith(
        'team-id',
        expect.objectContaining({
          architect_id: 'architect-id',
          scrum_master_id: null,
        }),
        8,
      );
    });

    it('rechaza un equipo sin arquitecto antes de crear el sprint', async () => {
      organizationService.findTeamLeaders.mockResolvedValue({
        architect: null,
        scrumMaster: { id: 'sm-id' },
      });

      await expect(service.create('team-id', input, user)).rejects.toEqual(
        new BadRequestException(
          'El equipo no tiene arquitecto asignado. Corrígelo en Equipos.',
        ),
      );
      expect(repository.createWithStories).not.toHaveBeenCalled();
    });

    it.each(['create', 'preview'] as const)(
      'rechaza cantidad y lista en %s',
      async (method) => {
        await expect(
          service[method](
            'team-id',
            { ...input, stories: [{ name: 'Historia', storyPoints: 1 }] },
            user,
          ),
        ).rejects.toThrow(
          'Usa la cantidad de HU o la lista de historias, no ambas',
        );
      },
    );
    it('exige token para crear con historias', async () => {
      await expect(
        service.create(
          'team-id',
          {
            ...input,
            userStoryCount: 0,
            stories: [{ name: 'Historia', storyPoints: 1 }],
          },
          user,
        ),
      ).rejects.toThrow(
        'Falta confirmationToken; genera la vista previa primero',
      );
    });
    it('preview sin historias no emite token', async () => {
      await expect(
        service.preview('team-id', input, user),
      ).resolves.toMatchObject({
        creates: [],
        updates: [],
        errors: [],
        confirmationToken: null,
        expiresAt: null,
      });
    });
    it('preview exige arquitecto', async () => {
      organizationService.findTeamLeaders.mockResolvedValue({
        architect: null,
        scrumMaster: null,
      });
      await expect(service.preview('team-id', input, user)).rejects.toThrow(
        'El equipo no tiene arquitecto asignado. Corrígelo en Equipos.',
      );
    });
    it.each(['create', 'preview'] as const)(
      'valida asignación en %s',
      async (method) => {
        organizationService.findTeamOrganization.mockResolvedValue({
          assignments: [],
        });
        await expect(service[method]('team-id', input, user)).rejects.toThrow(
          'El proyecto no está asignado al equipo para las fechas del sprint',
        );
      },
    );
    it('no inicia sin historias', async () => {
      repository.findById.mockResolvedValue(sprint('sprint-id', 1, 'planned'));
      repository.hasInProgressSprint.mockResolvedValue(false);
      repository.hasPreviousUnclosedSprint.mockResolvedValue(false);
      itemsRepository.findAll.mockResolvedValue([]);
      await expect(service.start('team-id', 'sprint-id')).rejects.toThrow(
        'Debes registrar al menos una historia de usuario antes de iniciar el sprint',
      );
      expect(repository.startTransactional).not.toHaveBeenCalled();
    });

    it('actualiza el objetivo sin consultar ni enviar líderes', async () => {
      repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'planned'));

      await service.update('team-id', 'sprint-id', {
        objective: 'Nuevo objetivo',
      });

      expect(organizationService.findTeamLeaders).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith('team-id', 'sprint-id', {
        objective: 'Nuevo objetivo',
      });
    });
  });

  it('includes initiatives requiring attention in closure pending counts and excludes completed ones', async () => {
    repository.findById.mockResolvedValue(
      sprint('sprint-id', 4, 'in_progress'),
    );
    const requiringAttention = {
      id: 'attention-id',
      status: 'requires_attention',
    };
    const completed = { id: 'completed-id', status: 'completed' };
    itemsRepository.findAll.mockImplementation(async (table: string) =>
      table === 'sprint_initiatives' ? [requiringAttention, completed] : [],
    );

    const summary = await service.closureSummary('team-id', 'sprint-id');

    expect(summary.pending.initiatives).toEqual([requiringAttention]);
    expect(summary.counts.initiatives).toBe(1);
    expect(itemsRepository.findAll).toHaveBeenCalledWith(
      'sprint_initiatives',
      'sprint-id',
    );
  });

  it('delegates sprint closure to the transactional repository operation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
    try {
      repository.findById.mockResolvedValue(
        sprint('sprint-id', 4, 'in_progress'),
      );
      await service.complete('team-id', 'sprint-id');

      expect(repository.completeTransactional).toHaveBeenCalledWith(
        'team-id',
        'sprint-id',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('allows retrying an already completed sprint closure', async () => {
    repository.findById.mockResolvedValue(sprint('sprint-id', 4, 'completed'));

    await service.complete('team-id', 'sprint-id');

    expect(repository.completeTransactional).toHaveBeenCalledWith(
      'team-id',
      'sprint-id',
    );
  });
});

describe('validación de líderes en DTO de sprint', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validCreate = {
    projectId: '123e4567-e89b-42d3-a456-426614174000',
    startDate: '2026-09-15',
    endDate: '2026-09-28',
    userStoryCount: 8,
  };

  describe.each([CreateSprintDto, UpdateSprintDto])('%p', (metatype) => {
    it('acepta y transforma un cuerpo válido', async () => {
      const body =
        metatype === CreateSprintDto ? validCreate : { objective: 'Objetivo' };
      await expect(
        pipe.transform(body, { type: 'body', metatype }),
      ).resolves.toBeInstanceOf(metatype);
    });

    it.each(['architectId', 'scrumMasterId'])(
      'rechaza %s con 400',
      async (field) => {
        const body =
          metatype === CreateSprintDto
            ? validCreate
            : { objective: 'Objetivo' };
        await expect(
          pipe.transform(
            { ...body, [field]: '123e4567-e89b-42d3-a456-426614174001' },
            { type: 'body', metatype },
          ),
        ).rejects.toMatchObject({
          status: 400,
          response: { message: [`property ${field} should not exist`] },
        });
      },
    );
  });
});
