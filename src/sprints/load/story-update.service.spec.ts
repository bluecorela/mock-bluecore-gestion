import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { StoryUpdateService } from './story-update.service';
import { StoryLoadRepository } from './story-load.repository';
import { LoadConfirmationService } from './load-confirmation.service';
import { OrganizationService } from '../../organization/services/organization.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';

const user = {
  personnelId: 'px4vN55npYtPR3YnEERp',
  employeeId: '11111111-1111-4111-8111-111111111111',
  role: 'Scrum Master',
} as AuthenticatedUser;
const story = () => ({
  id: 'hu',
  code: 'HU-7',
  status: 'planned',
  name: 'Antes',
  story_points: 3,
  description: null,
  estimated_work_days: null,
  assigned_employee_id: null,
  sprint_id: 's',
  sprints: {
    id: 's',
    name: 'Sprint-3',
    team_id: 't',
    status: 'in_progress',
    teams: { name: 'Equipo' },
  },
});
describe('StoryUpdateService', () => {
  let service: StoryUpdateService;
  let tokens: LoadConfirmationService;
  const repo = { findOpenStoriesByCode: jest.fn(), updateStoryById: jest.fn() };
  const org = {
    assertTeamLeader: jest.fn(),
    findTeamsForUser: jest.fn(),
    findEmployees: jest.fn(),
    findTeamLeaders: jest.fn(),
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    repo.findOpenStoriesByCode.mockResolvedValue([story()]);
    repo.updateStoryById.mockResolvedValue({ id: 'hu', story_points: 5 });
    org.findTeamsForUser.mockResolvedValue([{ id: 't' }]);
    org.findEmployees.mockResolvedValue([
      { id: 'p', email: 'person@example.com' },
    ]);
    org.findTeamLeaders.mockResolvedValue({
      architect: null,
      scrumMaster: null,
    });
    const module = await Test.createTestingModule({
      providers: [
        StoryUpdateService,
        LoadConfirmationService,
        {
          provide: ConfigService,
          useValue: { get: () => 'test-secret-abcdefghijklmnopqrstuvwxyz' },
        },
        { provide: StoryLoadRepository, useValue: repo },
        { provide: OrganizationService, useValue: org },
      ],
    }).compile();
    service = module.get(StoryUpdateService);
    tokens = module.get(LoadConfirmationService);
  });
  it('normalizes code and scopes teams', async () => {
    const preview = await service.previewByCode(' hu-7 ', user, {
      storyPoints: 5,
    });
    expect(repo.findOpenStoriesByCode).toHaveBeenCalledWith('HU-7', ['t']);
    expect(preview.changes).toEqual({ storyPoints: { from: 3, to: 5 } });
    expect(preview.story).toEqual({
      code: 'HU-7',
      sprintId: 's',
      sprintName: 'Sprint-3',
      teamId: 't',
      teamName: 'Equipo',
    });
    await service.previewByCode(
      'HU-7',
      { ...user, role: 'Admin' },
      { name: 'Nueva' },
    );
    expect(repo.findOpenStoriesByCode).toHaveBeenLastCalledWith('HU-7', null);
  });
  it.each([[[]], [[{ id: 't' }]]])(
    'returns 404 for absent or inaccessible story',
    async (teams) => {
      org.findTeamsForUser.mockResolvedValue(teams);
      repo.findOpenStoriesByCode.mockResolvedValue([]);
      await expect(
        service.previewByCode('hu-7', user, { name: 'Nueva' }),
      ).rejects.toMatchObject({
        status: 404,
        message:
          'No existe una HU con el código HU-7 en un sprint abierto de tus equipos',
      });
    },
  );
  it('rejects duplicates with sorted names', async () => {
    const other = story();
    other.sprints.name = 'Sprint-4';
    repo.findOpenStoriesByCode.mockResolvedValue([other, story()]);
    await expect(
      service.previewByCode('HU-7', user, { name: 'Nueva' }),
    ).rejects.toMatchObject({
      status: 409,
      message:
        'El código HU-7 aparece en varios sprints (Sprint-3, Sprint-4); corrígelo antes de actualizar',
    });
  });
  it.each(['completed', 'cancelled'])(
    'rejects final story %s without token',
    async (status) => {
      repo.findOpenStoriesByCode.mockResolvedValue([{ ...story(), status }]);
      expect(
        await service.previewByCode('HU-7', user, { name: 'Nueva' }),
      ).toMatchObject({
        errors: ['No se puede actualizar una HU finalizada'],
        confirmationToken: null,
        expiresAt: null,
      });
    },
  );
  it('rejects state changes in planned sprint', async () => {
    const match = story();
    match.sprints.status = 'planned';
    repo.findOpenStoriesByCode.mockResolvedValue([match]);
    expect(
      await service.previewByCode('HU-7', user, { status: 'in_progress' }),
    ).toMatchObject({
      errors: [
        'En un sprint planificado las HU solo pueden estar Planificadas',
      ],
      confirmationToken: null,
    });
  });
  it('rejects foreign assignee', async () => {
    expect(
      await service.previewByCode('HU-7', user, {
        assigneeEmail: 'x@example.com',
      }),
    ).toMatchObject({
      errors: ['El responsable x@example.com no pertenece al equipo'],
      confirmationToken: null,
    });
  });
  it.each([{}, { description: '  ' }, { confirmationToken: 'x' }])(
    'rejects empty body %j',
    async (dto) => {
      await expect(
        service.previewByCode('HU-7', user, dto),
      ).rejects.toMatchObject({
        status: 400,
        message: 'No hay cambios para aplicar',
      });
    },
  );
  it.each([' ', 'a'.repeat(61)])('rejects invalid code', async (code) => {
    await expect(
      service.previewByCode(code, user, { name: 'Nueva' }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('requires employee', async () => {
    await expect(
      service.previewByCode(
        'HU-7',
        { ...user, employeeId: null },
        { name: 'Nueva' },
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Tu usuario no tiene un empleado asociado',
    });
  });
  it('signs operation, target, sprint and normalized fields and assignees', async () => {
    const issue = jest.spyOn(tokens, 'issue');
    await service.previewByCode('HU-7', user, {
      assigneeEmail: ' PERSON@example.com ',
    });
    expect(issue).toHaveBeenCalledWith({
      operation: 'story_update',
      target: 'hu',
      employeeId: '11111111-1111-4111-8111-111111111111',
      content: {
        sprintId: 's',
        story: { assigneeEmail: 'person@example.com' },
        assignees: { 'person@example.com': 'p' },
      },
    });
  });
  it.each(['previewByCode', 'applyByCode'] as const)(
    '%s rejects absent and duplicate stories before tokens',
    async (method) => {
      repo.findOpenStoriesByCode.mockResolvedValue([]);
      await expect(
        service[method]('HU-7', user, { name: 'Nueva' }),
      ).rejects.toMatchObject({ status: 404 });
      const other = story();
      other.sprints.name = 'Sprint-4';
      repo.findOpenStoriesByCode.mockResolvedValue([other, story()]);
      await expect(
        service[method]('HU-7', user, { name: 'Nueva' }),
      ).rejects.toMatchObject({
        status: 409,
        message:
          'El código HU-7 aparece en varios sprints (Sprint-3, Sprint-4); corrígelo antes de actualizar',
      });
      expect(repo.updateStoryById).not.toHaveBeenCalled();
    },
  );
  it('requires token', async () => {
    await expect(
      service.applyByCode('HU-7', user, { name: 'Nueva' }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Falta confirmationToken; genera la vista previa primero',
    });
    expect(repo.updateStoryById).not.toHaveBeenCalled();
  });
  it.each(['content', 'sprint'])(
    'rejects token after %s changed',
    async (change) => {
      const preview = await service.previewByCode('HU-7', user, {
        name: 'Nueva',
      });
      if (change === 'sprint') {
        const moved = story();
        moved.sprint_id = 's2';
        moved.sprints.id = 's2';
        repo.findOpenStoriesByCode.mockResolvedValue([moved]);
      }
      await expect(
        service.applyByCode('HU-7', user, {
          name: change === 'content' ? 'Otra' : 'Nueva',
          confirmationToken: preview.confirmationToken!,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.updateStoryById).not.toHaveBeenCalled();
    },
  );
  it('replans before RPC', async () => {
    const preview = await service.previewByCode('HU-7', user, {
      name: 'Nueva',
    });
    repo.findOpenStoriesByCode.mockResolvedValue([
      { ...story(), status: 'completed' },
    ]);
    await expect(
      service.applyByCode('HU-7', user, {
        name: 'Nueva',
        confirmationToken: preview.confirmationToken!,
      }),
    ).rejects.toThrow('No se puede actualizar una HU finalizada');
    expect(repo.updateStoryById).not.toHaveBeenCalled();
  });
  it('applies with signed sprint and team of story, without code and maps result', async () => {
    const preview = await service.previewByCode('HU-7', user, {
      storyPoints: 5,
    });
    expect(
      await service.applyByCode('hu-7', user, {
        storyPoints: 5,
        confirmationToken: preview.confirmationToken!,
      }),
    ).toEqual({ id: 'hu', storyPoints: 5 });
    expect(repo.updateStoryById).toHaveBeenCalledWith(
      't',
      's',
      'hu',
      { story_points: 5 },
      expect.any(String),
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it.each([
    'Esta confirmación ya se usó',
    'La carga cambió desde la vista previa; genera la vista previa de nuevo',
  ])('propagates RPC conflict: %s', async (message) => {
    const preview = await service.previewByCode('HU-7', user, {
      name: 'Nueva',
    });
    repo.updateStoryById.mockRejectedValue(new ConflictException(message));
    await expect(
      service.applyByCode('HU-7', user, {
        name: 'Nueva',
        confirmationToken: preview.confirmationToken!,
      }),
    ).rejects.toMatchObject({ status: 409, message });
  });
});
