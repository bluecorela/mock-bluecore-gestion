import { SupabaseClient } from '../../supabase/supabase.client';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { StoryLoadService } from './story-load.service';
import { StoryLoadRepository } from './story-load.repository';
import { LoadConfirmationService } from './load-confirmation.service';
import { SprintsRepository } from '../repositories/sprints.repository';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import { OrganizationService } from '../../organization/services/organization.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
const user = {
  personnelId: 'px4vN55npYtPR3YnEERp',
  employeeId: '11111111-1111-4111-8111-111111111111',
} as AuthenticatedUser;
const dto = { stories: [{ name: 'Historia', storyPoints: 3 }] };
describe('StoryLoadService', () => {
  let service: StoryLoadService;
  let tokens: LoadConfirmationService;
  const sprint = { findById: jest.fn(), createWithStoryLoad: jest.fn() };
  const items = { findAll: jest.fn() };
  const repo = { findStoriesByCodes: jest.fn(), apply: jest.fn() };
  const org = { findEmployees: jest.fn(), findTeamLeaders: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    sprint.findById.mockResolvedValue({
      id: 's',
      name: 'Sprint-1',
      status: 'planned',
    });
    items.findAll.mockResolvedValue([]);
    repo.findStoriesByCodes.mockResolvedValue([]);
    org.findEmployees.mockResolvedValue([]);
    org.findTeamLeaders.mockResolvedValue({
      architect: { id: 'a', email: 'arch@b.com' },
      scrumMaster: { id: 'sm', email: 'sm@b.com' },
    });
    repo.apply.mockResolvedValue({
      created: [{ id: 'new', code: 'HU-1' }],
      updated: [],
    });
    const module = await Test.createTestingModule({
      providers: [
        StoryLoadService,
        LoadConfirmationService,
        {
          provide: ConfigService,
          useValue: { get: () => 'test-secret-abcdefghijklmnopqrstuvwxyz' },
        },
        { provide: SprintsRepository, useValue: sprint },
        { provide: SprintItemsRepository, useValue: items },
        { provide: StoryLoadRepository, useValue: repo },
        { provide: OrganizationService, useValue: org },
      ],
    }).compile();
    service = module.get(StoryLoadService);
    tokens = module.get(LoadConfirmationService);
  });
  const config = {
    projectId: 'p',
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    objective: ' Objetivo ',
    committedPoints: 0,
    architectId: 'a',
    scrumMasterId: null,
  };
  it('firma sprint normalizado, equipo, responsables y destinos nulos', async () => {
    const issue = jest.spyOn(tokens, 'issue');
    const input = {
      stories: [{ ...dto.stories[0], assigneeEmail: ' ARCH@B.COM ' }],
    };
    const preview = await service.previewNewSprint('t', user, config, input);
    expect(issue).toHaveBeenCalledWith({
      operation: 'sprint_create',
      target: 't',
      employeeId: '11111111-1111-4111-8111-111111111111',
      content: {
        sprint: {
          projectId: 'p',
          startDate: '2026-11-01',
          endDate: '2026-11-10',
          objective: 'Objetivo',
          committedPoints: 0,
          architectId: 'a',
        },
        stories: [{ ...dto.stories[0], assigneeEmail: 'arch@b.com' }],
        assignees: { 'arch@b.com': 'a' },
        targets: [null],
      },
    });
    await service.applyNewSprint(
      't',
      user,
      config,
      { project_id: 'p' },
      { ...input, confirmationToken: preview.confirmationToken! },
    );
    expect(sprint.createWithStoryLoad).toHaveBeenCalledWith(
      't',
      { project_id: 'p' },
      [
        {
          name: 'Historia',
          story_points: 3,
          assigned_employee_id: 'a',
          expected_id: null,
        },
      ],
      expect.any(String),
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it('envía el UUID a ambas RPC aunque personnelId sea el código heredado', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { sprint: { id: 's' }, created: [], updated: [] },
      error: null,
    });
    const module = await Test.createTestingModule({
      providers: [
        StoryLoadRepository,
        SprintsRepository,
        { provide: SupabaseClient, useValue: { getV2Client: () => ({ rpc }) } },
      ],
    }).compile();
    const loads = module.get(StoryLoadRepository);
    const sprints = module.get(SprintsRepository);
    repo.apply.mockImplementation(loads.apply.bind(loads));
    sprint.createWithStoryLoad.mockImplementation(
      sprints.createWithStoryLoad.bind(sprints),
    );
    const preview = await service.preview('t', 's', user, dto);
    await service.apply('t', 's', user, {
      ...dto,
      confirmationToken: preview.confirmationToken!,
    });
    const newSprint = await service.previewNewSprint('t', user, config, dto);
    await service.applyNewSprint(
      't',
      user,
      config,
      {},
      {
        ...dto,
        confirmationToken: newSprint.confirmationToken!,
      },
    );
    for (const name of [
      'apply_sprint_story_load',
      'create_sprint_with_story_load',
    ]) {
      expect(rpc).toHaveBeenCalledWith(
        name,
        expect.objectContaining({
          p_employee_id: user.employeeId,
        }),
      );
    }
    expect(user.personnelId).not.toBe(user.employeeId);
  });
  it.each([
    ['t', 'HU-7 pertenece al Sprint-4'],
    ['other', 'HU-7 pertenece a otro equipo'],
  ])('rechaza código existente de equipo %s', async (teamId, message) => {
    repo.findStoriesByCodes.mockResolvedValue([
      {
        id: 'x',
        code: 'HU-7',
        sprint_id: 's',
        sprints: { name: 'Sprint-4', team_id: teamId },
      },
    ]);
    const result = await service.previewNewSprint('t', user, config, {
      stories: [{ ...dto.stories[0], code: 'HU-7' }],
    });
    expect(result.errors).toEqual([{ row: 1, code: 'HU-7', message }]);
    expect(result.confirmationToken).toBeNull();
  });
  it('rechaza contenido cambiado sin RPC', async () => {
    const preview = await service.previewNewSprint('t', user, config, dto);
    await expect(
      service.applyNewSprint(
        't',
        user,
        { ...config, objective: 'Otro' },
        {},
        { ...dto, confirmationToken: preview.confirmationToken! },
      ),
    ).rejects.toThrow('La confirmación no es válida');
    expect(sprint.createWithStoryLoad).not.toHaveBeenCalled();
  });
  it('replanifica antes de crear y rechaza error de fila sin RPC', async () => {
    const input = { stories: [{ ...dto.stories[0], code: 'HU-7' }] };
    const preview = await service.previewNewSprint('t', user, config, input);
    repo.findStoriesByCodes.mockResolvedValue([
      {
        id: 'x',
        code: 'HU-7',
        sprint_id: 's',
        sprints: { name: 'Sprint-4', team_id: 't' },
      },
    ]);
    await expect(
      service.applyNewSprint(
        't',
        user,
        config,
        {},
        { ...input, confirmationToken: preview.confirmationToken! },
      ),
    ).rejects.toThrow('Fila 1: HU-7 pertenece al Sprint-4');
    expect(sprint.createWithStoryLoad).not.toHaveBeenCalled();
  });
  it('issues a token for only codeless rows and omits dbRow', async () => {
    const preview = await service.preview('t', 's', user, dto);
    expect(preview.confirmationToken).toEqual(expect.any(String));
    expect(preview.creates).toEqual([{ row: 1, code: null, name: 'Historia' }]);
    expect(repo.findStoriesByCodes).not.toHaveBeenCalled();
  });
  it.each(['arch@b.com', 'sm@b.com'])(
    'accepts leader %s outside employees',
    async (assigneeEmail) => {
      expect(
        (
          await service.preview('t', 's', user, {
            stories: [{ ...dto.stories[0], assigneeEmail }],
          })
        ).errors,
      ).toEqual([]);
    },
  );
  it('returns null tokens with row errors', async () => {
    const issue = jest.spyOn(tokens, 'issue');
    expect(
      await service.preview('t', 's', user, {
        stories: [{ ...dto.stories[0], assigneeEmail: 'x@y.com' }],
      }),
    ).toMatchObject({ confirmationToken: null, expiresAt: null });
    expect(issue).not.toHaveBeenCalled();
  });
  it.each(['completed', 'cancelled'])(
    'blocks preview and apply on %s',
    async (status) => {
      sprint.findById.mockResolvedValue({ status });
      const issue = jest.spyOn(tokens, 'issue');
      await expect(service.preview('t', 's', user, dto)).rejects.toThrow(
        'No se puede modificar un sprint completado',
      );
      await expect(
        service.apply('t', 's', user, { ...dto, confirmationToken: 'x' }),
      ).rejects.toThrow('No se puede modificar un sprint completado');
      expect(issue).not.toHaveBeenCalled();
      expect(repo.apply).not.toHaveBeenCalled();
    },
  );
  it('rejects missing sprint', async () => {
    sprint.findById.mockResolvedValue(null);
    await expect(service.preview('t', 's', user, dto)).rejects.toMatchObject({
      status: 404,
      message: 'Sprint no encontrado',
      response: {
        statusCode: 404,
        message: 'Sprint no encontrado',
        error: 'Not Found',
        code: 'SPRINT_NOT_FOUND',
      },
    });
  });
  it.each(['preview', 'apply'] as const)(
    'rejects users without employeeId in %s',
    async (method) => {
      await expect(
        service[method]('t', 's', { ...user, employeeId: null }, dto),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Tu usuario no tiene un empleado asociado',
      });
    },
  );
  it('requires confirmation', async () => {
    await expect(service.apply('t', 's', user, dto)).rejects.toThrow(
      'Falta confirmationToken; genera la vista previa primero',
    );
    expect(repo.apply).not.toHaveBeenCalled();
  });
  it('rejects altered content before RPC', async () => {
    const preview = await service.preview('t', 's', user, dto);
    await expect(
      service.apply('t', 's', user, {
        stories: [{ name: 'Otro', storyPoints: 3 }],
        confirmationToken: preview.confirmationToken!,
      }),
    ).rejects.toThrow(
      'La confirmación no es válida o venció; genera la vista previa de nuevo',
    );
    expect(repo.apply).not.toHaveBeenCalled();
  });
  it('rejects reassigned emails with 400 before RPC', async () => {
    const input = {
      stories: [{ ...dto.stories[0], assigneeEmail: ' A@X.COM ' }],
    };
    org.findEmployees.mockResolvedValue([{ id: 'first', email: 'a@x.com' }]);
    const preview = await service.preview('t', 's', user, input);
    expect(preview.confirmationToken).toEqual(expect.any(String));
    org.findEmployees.mockResolvedValue([{ id: 'second', email: 'a@x.com' }]);
    await expect(
      service.apply('t', 's', user, {
        ...input,
        confirmationToken: preview.confirmationToken!,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message:
        'La confirmación no es válida o venció; genera la vista previa de nuevo',
    });
    expect(repo.apply).not.toHaveBeenCalled();
  });
  it('signs only used assignees and accepts reordered context', async () => {
    const input = {
      stories: [
        { ...dto.stories[0], assigneeEmail: ' A@X.COM ' },
        { ...dto.stories[0], assigneeEmail: 'sm@b.com' },
      ],
    };
    org.findEmployees.mockResolvedValue([
      { id: 'first', email: 'a@x.com' },
      { id: 'unused', email: 'unused@x.com' },
    ]);
    const issue = jest.spyOn(tokens, 'issue');
    const preview = await service.preview('t', 's', user, input);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        content: {
          stories: [
            { ...dto.stories[0], assigneeEmail: 'a@x.com' },
            { ...dto.stories[0], assigneeEmail: 'sm@b.com' },
          ],
          assignees: { 'a@x.com': 'first', 'sm@b.com': 'sm' },
          targets: [null, null],
        },
      }),
    );
    org.findEmployees.mockResolvedValue([{ id: 'first', email: 'a@x.com' }]);
    await service.apply('t', 's', user, {
      ...input,
      confirmationToken: preview.confirmationToken!,
    });
    expect(repo.apply).toHaveBeenCalled();
  });
  it.each([
    ['a', 'arch@b.com'],
    ['sm', 'sm@b.com'],
    ['member', 'member@b.com'],
    [null, null],
    ['outside', 'Fuera del equipo'],
  ])('shows current assignee %s as %s', async (assignedEmployeeId, from) => {
    org.findEmployees.mockResolvedValue([
      { id: 'member', email: ' MEMBER@B.COM ' },
    ]);
    items.findAll.mockResolvedValue([
      {
        id: 'old',
        code: 'HU-7',
        status: 'in_progress',
        name: 'Historia',
        storyPoints: 3,
        assignedEmployeeId,
      },
    ]);
    org.findEmployees.mockResolvedValue([
      { id: 'member', email: ' MEMBER@B.COM ' },
      { id: 'new', email: 'new@b.com' },
    ]);
    const valid = await service.preview('t', 's', user, {
      stories: [
        { ...dto.stories[0], code: 'HU-7', assigneeEmail: ' NEW@B.COM ' },
      ],
    });
    expect(valid.updates[0].changes).toEqual({
      assigneeEmail: { from, to: 'new@b.com' },
    });
  });
  it('verifies equal normalized content and applies db rows', async () => {
    const preview = await service.preview('t', 's', user, {
      stories: [{ name: ' Historia ', storyPoints: 3 }],
    });
    await expect(
      service.apply('t', 's', user, {
        ...dto,
        confirmationToken: preview.confirmationToken!,
      }),
    ).resolves.toEqual({ created: [{ id: 'new', code: 'HU-1' }], updated: [] });
    expect(repo.apply).toHaveBeenCalledWith(
      't',
      's',
      [{ name: 'Historia', story_points: 3, expected_id: null }],
      expect.any(String),
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it.each(['appears', 'disappears', 'is replaced'])(
    'rejects changed target when HU-7 %s before apply without calling RPC',
    async (change) => {
      const input = { stories: [{ ...dto.stories[0], code: ' HU-7 ' }] };
      const existing = {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'HU-7',
        status: 'planned',
        name: 'Historia',
        storyPoints: 3,
      };
      items.findAll.mockResolvedValue(change === 'appears' ? [] : [existing]);
      const preview = await service.preview('t', 's', user, input);
      expect(preview.confirmationToken).toEqual(expect.any(String));
      expect(
        change === 'appears' ? preview.creates : preview.updates,
      ).toHaveLength(1);
      items.findAll.mockResolvedValue(
        change === 'disappears'
          ? []
          : [
              {
                ...existing,
                id:
                  change === 'is replaced'
                    ? '22222222-2222-4222-8222-222222222222'
                    : existing.id,
              },
            ],
      );
      await expect(
        service.apply('t', 's', user, {
          ...input,
          confirmationToken: preview.confirmationToken!,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message:
          'La confirmación no es válida o venció; genera la vista previa de nuevo',
      });
      expect(repo.apply).not.toHaveBeenCalled();
    },
  );
  it('signs aligned targets and sends expected_id for mixed creates and updates', async () => {
    const existingId = '11111111-1111-4111-8111-111111111111';
    items.findAll.mockResolvedValue([
      {
        id: existingId,
        code: 'HU-7',
        status: 'planned',
        name: 'Historia',
        storyPoints: 3,
      },
    ]);
    const input = {
      stories: [
        { ...dto.stories[0], code: ' hu-7 ' },
        { ...dto.stories[0], code: 'HU-8' },
        dto.stories[0],
      ],
    };
    const issue = jest.spyOn(tokens, 'issue');
    const preview = await service.preview('t', 's', user, input);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ targets: [existingId, null, null] }),
      }),
    );
    await service.apply('t', 's', user, {
      ...input,
      confirmationToken: preview.confirmationToken!,
    });
    expect(repo.apply).toHaveBeenCalledWith(
      't',
      's',
      [
        {
          code: 'HU-7',
          name: 'Historia',
          story_points: 3,
          expected_id: existingId,
        },
        { code: 'HU-8', name: 'Historia', story_points: 3, expected_id: null },
        { name: 'Historia', story_points: 3, expected_id: null },
      ],
      expect.any(String),
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it('replans and rejects first error with row number', async () => {
    const input = { stories: [{ ...dto.stories[0], code: 'HU-7' }] };
    const preview = await service.preview('t', 's', user, input);
    repo.findStoriesByCodes.mockResolvedValue([
      {
        id: 'x',
        code: 'HU-7',
        sprint_id: 'other',
        sprints: { name: 'Sprint-4', team_id: 't', status: 'planned' },
      },
    ]);
    await expect(
      service.apply('t', 's', user, {
        ...input,
        confirmationToken: preview.confirmationToken!,
      }),
    ).rejects.toThrow('Fila 1: HU-7 pertenece al Sprint-4');
    expect(repo.apply).not.toHaveBeenCalled();
  });
  it('excludes destination matches and selects other sprints by name stably', async () => {
    const match = (id: string, name: string) => ({
      id,
      code: 'HU-7',
      sprint_id: id,
      sprints: { name, team_id: 't', status: 'planned' },
    });
    repo.findStoriesByCodes.mockResolvedValue([
      match('s', 'Sprint-0'),
      match('z', 'Sprint-9'),
      match('a', 'Sprint-4'),
    ]);
    const preview = await service.preview('t', 's', user, {
      stories: [{ ...dto.stories[0], code: 'HU-7' }],
    });
    expect(preview.errors).toEqual([
      { row: 1, code: 'HU-7', message: 'HU-7 pertenece al Sprint-4' },
    ]);
    expect(repo.findStoriesByCodes).toHaveBeenCalledWith(['HU-7']);
  });
  it('updates destination stories despite historical duplicates and exposes changed assignee emails', async () => {
    items.findAll.mockResolvedValue([
      {
        id: 'old',
        code: 'HU-7',
        status: 'in_progress',
        name: 'Historia',
        storyPoints: '3',
        assignedEmployeeId: 'old-person',
      },
    ]);
    repo.findStoriesByCodes.mockResolvedValue([
      {
        id: 'x',
        code: 'HU-7',
        sprint_id: 'other',
        sprints: { name: 'Sprint-4', team_id: 't', status: 'planned' },
      },
    ]);
    const preview = await service.preview('t', 's', user, {
      stories: [{ ...dto.stories[0], code: 'HU-7', assigneeEmail: 'sm@b.com' }],
    });
    expect(preview.errors).toEqual([]);
    expect(preview.updates[0].changes).toEqual({
      assigneeEmail: { from: 'Fuera del equipo', to: 'sm@b.com' },
    });
    expect(preview.updates[0]).not.toHaveProperty('dbRow');
  });
  it('propagates replay conflict', async () => {
    const preview = await service.preview('t', 's', user, dto);
    repo.apply.mockRejectedValue(
      new ConflictException('Esta confirmación ya se usó'),
    );
    await expect(
      service.apply('t', 's', user, {
        ...dto,
        confirmationToken: preview.confirmationToken!,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Esta confirmación ya se usó',
    });
  });
});
