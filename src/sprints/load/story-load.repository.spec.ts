import { Logger } from '@nestjs/common';
import { StoryLoadRepository } from './story-load.repository';
import { SupabaseClient } from '../../supabase/supabase.client';
describe('StoryLoadRepository', () => {
  const rpc = jest.fn();
  const repo = new StoryLoadRepository({
    getV2Client: () => ({ rpc }),
  } as unknown as SupabaseClient);
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  it.each([
    [
      'P0001',
      'Esta confirmación ya se usó',
      409,
      'Esta confirmación ya se usó',
    ],
    [
      'P0001',
      'La carga cambió desde la vista previa; genera la vista previa de nuevo',
      409,
      'La carga cambió desde la vista previa; genera la vista previa de nuevo',
    ],
    ['P0001', 'Sprint no encontrado', 404, 'Sprint no encontrado'],
    [
      'P0001',
      'No se puede modificar un sprint cerrado',
      400,
      'No se puede modificar un sprint completado',
    ],
    ...['22P02', '22003', '23502', '23503', '23514'].map((code) => [
      code,
      'secret',
      400,
      'Los datos de la carga no son válidos',
    ]),
    ...['40P01', '55P03'].map((code) => [
      code,
      'secret',
      409,
      'Hay otra operación en curso sobre este sprint; inténtalo de nuevo',
    ]),
    ['23505', 'secret', 409, 'Conflicto al guardar la carga'],
    ['XX000', 'secret', 500, 'No se pudo guardar la carga'],
  ])('translates %s %s', async (code, message, status, expected) => {
    rpc.mockResolvedValue({ error: { code, message } });
    await expect(repo.apply('t', 's', [], 'c', 'e')).rejects.toMatchObject({
      status,
      message: expected,
    });
    if (status === 500) expect(Logger.prototype.error).toHaveBeenCalled();
  });
  it('prioriza details conocido sobre el texto SQL', async () => {
    rpc.mockResolvedValue({
      error: {
        code: 'P0001',
        details: 'LOAD_CONFIRMATION_USED',
        message: 'Texto diferente',
      },
    });
    await expect(repo.apply('t', 's', [], 'c', 'e')).rejects.toMatchObject({
      status: 409,
      response: { statusCode: 409, code: 'LOAD_CONFIRMATION_USED' },
    });
  });
  it('queries codes with the required joined sprint fields', async () => {
    const matches = [
      {
        id: 'id',
        code: 'HU-1',
        sprint_id: 's',
        sprints: { name: 'Sprint-1', team_id: 't', status: 'planned' },
      },
    ];
    const query = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: matches, error: null }),
    };
    const from = jest.fn().mockReturnValue(query);
    const repository = new StoryLoadRepository({
      getV2Client: () => ({ from }),
    } as unknown as SupabaseClient);
    await expect(repository.findStoriesByCodes(['HU-1'])).resolves.toEqual(
      matches,
    );
    expect(from).toHaveBeenCalledWith('sprint_user_stories');
    expect(query.select).toHaveBeenCalledWith(
      // sprint_user_stories tiene dos FK a sprints (sprint_id y carried_from_sprint_id):
      // sin el hint PostgREST responde PGRST201 (embed ambiguo) y la API da 500.
      'id, code, sprint_id, sprints!sprint_user_stories_sprint_id_fkey!inner(name, team_id, status)',
    );
    expect(query.in).toHaveBeenCalledWith('code', ['HU-1']);
    from.mockClear();
    await expect(repository.findStoriesByCodes([])).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it('passes snake case rows and confirmation to the RPC', async () => {
    const result = { created: [{ id: 'id', code: 'HU-1' }], updated: [] };
    rpc.mockResolvedValue({ data: result, error: null });
    await expect(
      repo.apply('t', 's', [{ name: 'HU', story_points: 2 }], 'c', 'e'),
    ).resolves.toEqual(result);
    expect(rpc).toHaveBeenLastCalledWith('apply_sprint_story_load', {
      p_team_id: 't',
      p_sprint_id: 's',
      p_stories: [{ name: 'HU', story_points: 2 }],
      p_confirmation_id: 'c',
      p_employee_id: 'e',
    });
  });
});

describe('Story updates repository', () => {
  it.each([[null], [['t']]] as const)(
    'filters open sprints and scopes teams %j',
    async (teams) => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      const repo = new StoryLoadRepository({
        getV2Client: () => ({ from: () => query }),
      } as unknown as SupabaseClient);
      await repo.findOpenStoriesByCode(
        'HU-7',
        teams === null ? null : [...teams],
      );
      expect(query.eq).toHaveBeenCalledWith('code', 'HU-7');
      expect(query.in).toHaveBeenCalledWith('sprints.status', [
        'planned',
        'in_progress',
      ]);
      expect(query.select).toHaveBeenCalledWith(
        expect.stringContaining(
          'sprints!sprint_user_stories_sprint_id_fkey!inner',
        ),
      );
      expect(query.select).toHaveBeenCalledWith(
        expect.stringContaining('teams!sprints_team_id_fkey(name)'),
      );
      if (teams)
        expect(query.in).toHaveBeenCalledWith('sprints.team_id', ['t']);
      else expect(query.in).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    'Esta confirmación ya se usó',
    'La carga cambió desde la vista previa; genera la vista previa de nuevo',
  ])('calls update RPC and translates conflict: %s', async (message) => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: { id: 'hu' }, error: null });
    const repo = new StoryLoadRepository({
      getV2Client: () => ({ rpc }),
    } as unknown as SupabaseClient);
    await expect(
      repo.updateStoryById('t', 's', 'hu', { name: 'Nueva' }, 'c', 'e'),
    ).resolves.toEqual({ id: 'hu' });
    expect(rpc).toHaveBeenCalledWith('update_story_by_id', {
      p_team_id: 't',
      p_sprint_id: 's',
      p_story_id: 'hu',
      p_payload: { name: 'Nueva' },
      p_confirmation_id: 'c',
      p_employee_id: 'e',
    });
    rpc.mockResolvedValue({
      error: { code: 'P0001', message },
    });
    await expect(
      repo.updateStoryById('t', 's', 'hu', {}, 'c', 'e'),
    ).rejects.toMatchObject({ status: 409, message });
  });
});
