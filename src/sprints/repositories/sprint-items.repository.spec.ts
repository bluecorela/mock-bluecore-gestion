import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseClient } from '../../supabase/supabase.client';
import { SprintItemsService } from '../services/sprint-items.service';
import { SprintItemsRepository } from './sprint-items.repository';
import { SprintsRepository } from './sprints.repository';

describe('SprintItemsService con errores de escritura del repositorio', () => {
  const message = 'No se puede modificar un sprint cerrado';
  const rpc = jest.fn();
  const from = jest.fn();
  const insert = jest.fn();
  const single = jest.fn();
  let service: SprintItemsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SprintItemsService,
        SprintItemsRepository,
        {
          provide: SupabaseClient,
          useValue: { getV2Client: () => ({ rpc, from }) },
        },
        {
          provide: SprintsRepository,
          useValue: {
            findById: jest.fn((_teamId: string, id: string) =>
              Promise.resolve({ id, status: 'in_progress' }),
            ),
          },
        },
      ],
    }).compile();
    service = module.get(SprintItemsService);
  });

  it('prioriza details conocido sobre el texto SQL', async () => {
    rpc.mockResolvedValue({
      error: {
        code: 'P0001',
        details: 'STORY_NOT_FOUND',
        message: 'Texto diferente',
      },
    });
    await expect(
      service.moveStory('team', 'source', 'story', 'target'),
    ).rejects.toMatchObject({
      status: 404,
      response: { statusCode: 404, code: 'STORY_NOT_FOUND' },
    });
  });
  it('devuelve 400 y el mensaje si el sprint se cierra después de requireWritableSprint', async () => {
    rpc.mockResolvedValue({ data: 'HU-1', error: null });
    from.mockReturnValue({ insert });
    insert.mockReturnValue({ select: () => ({ single }) });
    single.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message },
    });

    const request = service.create('team', 'sprint', 'stories', {
      name: 'HU concurrente',
      storyPoints: 3,
    });
    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toMatchObject({
      status: 400,
      message: 'No se puede modificar un sprint completado',
    });
    expect(from).toHaveBeenCalledWith('sprint_user_stories');
    expect(insert).toHaveBeenCalledWith({
      sprint_id: 'sprint',
      code: 'HU-1',
      name: 'HU concurrente',
      story_points: 3,
    });
  });

  it('devuelve 400 y el mensaje si el destino se cierra antes del movimiento', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } });

    const request = service.moveStory('team', 'source', 'story', 'target');
    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toMatchObject({
      status: 400,
      message: 'No se puede modificar un sprint completado',
    });
    expect(rpc).toHaveBeenCalledWith('move_sprint_story', {
      p_team_id: 'team',
      p_source_sprint_id: 'source',
      p_story_id: 'story',
      p_target_sprint_id: 'target',
    });
  });
});

describe('SprintItemsRepository con códigos duplicados', () => {
  const from = jest.fn();
  const rpc = jest.fn();
  const single = jest.fn();
  let repository: SprintItemsRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    const query = {
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single,
      maybeSingle: single,
    };
    from.mockReturnValue(query);
    single.mockResolvedValue({ data: null, error: { code: '23505' } });
    const module = await Test.createTestingModule({
      providers: [
        SprintItemsRepository,
        {
          provide: SupabaseClient,
          useValue: { getV2Client: () => ({ from, rpc }) },
        },
      ],
    }).compile();
    repository = module.get(SprintItemsRepository);
  });

  it('moveStory traduce 23505 a 409 con el mensaje de HU', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    const request = repository.moveStory('team', 'source', 'story', 'target');
    await expect(request).rejects.toBeInstanceOf(ConflictException);
    await expect(request).rejects.toMatchObject({
      status: 409,
      message:
        'El código de la HU ya existe en otro sprint; vuelve a intentarlo',
    });
  });

  it.each(['create', 'update'] as const)(
    '%s traduce el conflicto de código de una HU',
    async (operation) => {
      const request =
        operation === 'create'
          ? repository.create('sprint_user_stories', { code: 'HU-1' })
          : repository.update('sprint_user_stories', 'sprint', 'story', {
              name: 'Nombre actualizado',
            });

      await expect(request).rejects.toBeInstanceOf(ConflictException);
      await expect(request).rejects.toThrow(
        'El código de la HU ya existe en otro sprint; vuelve a intentarlo',
      );
    },
  );

  it.each(['create', 'update'] as const)(
    '%s conserva el mensaje de conflicto de bugs',
    async (operation) => {
      const request =
        operation === 'create'
          ? repository.create('sprint_bugs', { code: 'BUG-1' })
          : repository.update('sprint_bugs', 'sprint', 'bug', { name: 'Bug' });

      await expect(request).rejects.toBeInstanceOf(ConflictException);
      await expect(request).rejects.toThrow(
        'Conflict while saving sprint_bugs',
      );
    },
  );
});

describe('SprintItemsRepository al borrar HU con bugs asociados', () => {
  it('traduce 23503 a 400 con un mensaje en español', async () => {
    const eq = jest.fn();
    eq.mockReturnValueOnce({ eq }).mockResolvedValueOnce({
      error: {
        code: '23503',
        message: 'violates foreign key constraint sprint_bugs_story_id_fkey',
      },
      count: null,
    });
    const from = jest.fn().mockReturnValue({
      delete: jest.fn().mockReturnValue({ eq }),
    });
    const module = await Test.createTestingModule({
      providers: [
        SprintItemsRepository,
        {
          provide: SupabaseClient,
          useValue: { getV2Client: () => ({ from }) },
        },
      ],
    }).compile();

    const request = module
      .get(SprintItemsRepository)
      .remove('sprint_user_stories', 'sprint', 'story');
    await expect(request).rejects.toMatchObject({
      status: 400,
      message: 'No se puede eliminar la HU porque tiene bugs asociados',
    });
    expect(from).toHaveBeenCalledWith('sprint_user_stories');
    expect(eq.mock.calls).toEqual([
      ['id', 'story'],
      ['sprint_id', 'sprint'],
    ]);
  });
});

describe('SprintItemsRepository lista bugs con su HU', () => {
  it.each([
    ['HU movida a otro sprint', 'story-id', { code: 'HU-12', name: 'Login' }],
    ['sin HU', null, null],
    ['HU inexistente', 'missing-story', null],
  ])('incluye story para %s', async (_name, storyId, story) => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [{ id: 'bug', story_id: storyId, story }],
        error: null,
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        SprintItemsRepository,
        {
          provide: SupabaseClient,
          useValue: { getV2Client: () => ({ from: () => query }) },
        },
      ],
    }).compile();
    const repository = module.get(SprintItemsRepository);
    expect(await repository.findAll('sprint_bugs', 'source')).toEqual([
      { id: 'bug', storyId, story },
    ]);
    expect(query.select).toHaveBeenCalledWith(
      '*,story:sprint_user_stories!sprint_bugs_story_id_fkey(code,name)',
    );
    expect(query.eq.mock.calls).toEqual([['sprint_id', 'source']]);
    await repository.findAll('sprint_user_stories', 'source');
    expect(query.select).toHaveBeenLastCalledWith('*');
  });
});
