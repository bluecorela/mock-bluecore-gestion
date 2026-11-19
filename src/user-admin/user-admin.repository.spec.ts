import { Test } from '@nestjs/testing';
import { UserAdminRepository } from './user-admin.repository';
import { SupabaseClient } from '../supabase/supabase.client';
import { OrganizationRepository } from '../organization/repositories/organization.repository';
import { planDesignate, planMove } from './user-admin.planner';

// Cliente fluido y awaitable, sin acceso a la base ni a Auth reales.
function query(data: unknown[] = [], error: unknown = null) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
}

const employee = { id: 'p', full_name: 'Ana', email: ' Ana@X.COM ' };
const team = { id: 't', code: 'alfa', name: 'Alfa', status: 'active' };
const membership = { employee_id: 'p', team_id: 't', teams: team };
const role = {
  employee_id: 'p',
  roles: { code: 'ARCHITECT', name: 'Arquitecto' },
};

describe('UserAdminRepository', () => {
  let repo: UserAdminRepository;
  let tables: Record<string, ReturnType<typeof query>>;
  let from: jest.Mock;
  let listUsers: jest.Mock;
  let findTeamLeaders: jest.Mock;

  beforeEach(async () => {
    tables = {
      employees: query([employee]),
      teams: query([team]),
      team_projects: query([{ team_id: 't' }]),
      employee_roles: query([role]),
      team_memberships: query([membership]),
      employee_absences: query(),
      team_rotation_events: query(),
    };
    from = jest.fn((name: string) => tables[name]);
    listUsers = jest
      .fn()
      .mockResolvedValue({ data: { users: [] }, error: null });
    findTeamLeaders = jest.fn().mockResolvedValue({
      architect: { id: 'lider', fullName: 'Luis', email: ' Luis@X.COM ' },
      scrumMaster: null,
    });
    const module = await Test.createTestingModule({
      providers: [
        UserAdminRepository,
        {
          provide: SupabaseClient,
          useValue: {
            getV2Client: () => ({ from }),
            getClient: () => ({ auth: { admin: { listUsers } } }),
          },
        },
        { provide: OrganizationRepository, useValue: { findTeamLeaders } },
      ],
    }).compile();
    repo = module.get(UserAdminRepository);
  });

  it('relee roles vigentes del líder por UUID, incluso con correo coincidente', async () => {
    const leader = {
      id: 'lider',
      employeeCode: null,
      fullName: 'Luis',
      email: employee.email,
    };
    tables.employee_roles = query([
      { ...role, employee_id: leader.id },
      { employee_id: leader.id, roles: { code: 'ADMIN', name: 'Admin' } },
    ]);
    expect(await repo.loadLeaderPerson(leader)).toMatchObject({
      id: 'lider',
      role: 'Arquitecto',
      activeRoleCodes: ['ARCHITECT', 'ADMIN'],
    });
    expect(tables.employee_roles.in).toHaveBeenCalledWith('employee_id', [
      'lider',
    ]);
    const today = new Date().toISOString().slice(0, 10);
    expect(tables.employee_roles.lte).toHaveBeenCalledWith('started_at', today);
    expect(tables.employee_roles.or).toHaveBeenCalledWith(
      `ended_at.is.null,ended_at.gte.${today}`,
    );
    expect(tables.employee_roles.order).toHaveBeenCalledWith('is_primary', {
      ascending: false,
    });
    expect(from).not.toHaveBeenCalledWith('employees');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('propaga el error al consultar roles vigentes del líder', async () => {
    tables.employee_roles = query([], { message: 'interno' });
    await expect(
      repo.loadLeaderPerson({
        id: employee.id,
        employeeCode: null,
        fullName: employee.full_name,
        email: employee.email,
      }),
    ).rejects.toThrow('No se pudo cargar roles');
  });

  it('normaliza correos y limita las lecturas a las personas y equipos pedidos', async () => {
    const ctx = await repo.loadContext({
      emails: [' ANA@x.com ', 'ana@x.com'],
      teamIds: ['t'],
    });
    expect([...ctx.people.keys()]).toEqual(['ana@x.com']);
    expect(ctx.people.get('ana@x.com')).toMatchObject({
      id: 'p',
      email: 'ana@x.com',
      role: 'Arquitecto',
      activeRoleCodes: ['ARCHITECT'],
      teamIds: ['t'],
      authOnly: false,
    });
    expect(tables.employees.filter).toHaveBeenCalledWith(
      'email',
      'imatch',
      '^[[:space:]]*ana@x\\.com[[:space:]]*$',
    );
    expect(tables.employees.filter).toHaveBeenCalledTimes(1);
    expect(tables.teams.in).toHaveBeenCalledWith('id', ['t']);
    expect(tables.employee_roles.order).toHaveBeenCalledWith('is_primary', {
      ascending: false,
    });
    expect(tables.team_memberships.eq).toHaveBeenCalledWith('is_active', true);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'conserva el UUID del SM con correo coincidente (duplicado: %s)',
    async (duplicate) => {
      const other = { id: 'otra', full_name: 'Otra Ana', email: 'ana@x.com' };
      tables.employees = query(duplicate ? [other, employee] : [employee]);
      tables.teams = query([team, { ...team, id: 'destino' }]);
      tables.team_projects = query([{ team_id: 't' }, { team_id: 'destino' }]);
      tables.employee_roles = query([
        {
          employee_id: 'p',
          roles: { code: 'SCRUM_MASTER', name: 'Scrum Master' },
        },
      ]);
      findTeamLeaders.mockImplementation((id: string) =>
        Promise.resolve({
          architect: null,
          scrumMaster:
            id === 't'
              ? { id: other.id, fullName: other.full_name, email: other.email }
              : null,
        }),
      );
      const ctx = await repo.loadContext({
        emails: ['ana@x.com'],
        teamIds: ['t', 'destino'],
      });
      expect(ctx.teams.get('t')!.leaders.scrumMaster).toMatchObject({
        id: 'otra',
        name: 'Otra Ana',
      });
      expect(ctx.ambiguousEmails.has('ana@x.com')).toBe(duplicate);
      for (const result of [
        planMove(
          {
            correo: 'ana@x.com',
            equipo_destino_id: 'destino',
            designar_como_lider: true,
          },
          ctx,
        ),
        planDesignate(
          { correo: 'ana@x.com', equipo_id: 'destino', rol: 'Scrum Master' },
          ctx,
        ),
      ]) {
        expect(result.resolvedMove?.closeSourceLeader).toBeUndefined();
        expect(result.errors).toEqual(
          duplicate
            ? ['Hay varias personas con este correo; corrígelo desde la web']
            : [],
        );
      }
    },
  );

  it('no confunde repeticiones del mismo UUID con empleados distintos', async () => {
    tables.employees = query([employee, employee]);
    const ctx = await repo.loadContext({ emails: ['ana@x.com'], teamIds: [] });
    expect(ctx.ambiguousEmails.size).toBe(0);
  });

  it('filtra roles vigentes con la fecha UTC e incluye los que terminan hoy', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T00:30:00.000Z'));
    try {
      await repo.loadContext({ emails: ['ana@x.com'], teamIds: [] });
      expect(tables.employee_roles.lte).toHaveBeenCalledWith(
        'started_at',
        '2026-11-14',
      );
      expect(tables.employee_roles.or).toHaveBeenCalledWith(
        'ended_at.is.null,ended_at.gte.2026-11-14',
      );
      expect(tables.employee_roles.is).not.toHaveBeenCalledWith(
        'ended_at',
        null,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('incluye empleados inactivos en el contexto para detectar correos duplicados', async () => {
    tables.employees = query([{ ...employee, status: 'inactive' }]);
    const ctx = await repo.loadContext({ emails: ['ana@x.com'], teamIds: [] });
    expect(ctx.people.get('ana@x.com')).toMatchObject({
      id: 'p',
      authOnly: false,
      inactive: true,
    });
    expect(tables.employees.select).toHaveBeenCalledWith(
      'id,full_name,email,status',
    );
    expect(tables.employees.eq).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('reutiliza los líderes vigentes de OrganizationRepository y detecta proyectos abiertos', async () => {
    const ctx = await repo.loadContext({ emails: [], teamIds: ['t'] });
    expect(findTeamLeaders).toHaveBeenCalledWith('t');
    expect(ctx.teams.get('t')).toMatchObject({
      id: 't',
      code: 'alfa',
      name: 'Alfa',
      active: true,
      hasOpenProject: true,
      leaders: {
        architect: { id: 'lider', name: 'Luis', email: 'luis@x.com' },
        scrumMaster: null,
      },
    });
    expect(ctx.people.size).toBe(0);
    expect(tables.team_projects.is).toHaveBeenCalledWith('ended_at', null);
  });

  it('carga los roles vigentes del líder que no está en la petición', async () => {
    tables.employee_roles = query([
      { employee_id: 'lider', roles: { code: 'ADMIN', name: 'Admin' } },
      {
        employee_id: 'lider',
        roles: { code: 'ARCHITECT', name: 'Arquitecto' },
      },
    ]);
    const ctx = await repo.loadContext({ emails: [], teamIds: ['t'] });
    expect(ctx.teams.get('t')!.leaders.architect).toMatchObject({
      id: 'lider',
      name: 'Luis',
      role: 'Admin',
      activeRoleCodes: ['ADMIN', 'ARCHITECT'],
    });
    expect(tables.employee_roles.in).toHaveBeenCalledWith('employee_id', [
      'lider',
    ]);
    expect(from).not.toHaveBeenCalledWith('employee_absences');
    expect(ctx.people.size).toBe(0);
  });

  it('marca ausencias activas por employee_id', async () => {
    tables.employee_absences = query([
      { employee_id: 'p', replacement_employee_id: 'otra' },
    ]);
    const ctx = await repo.loadContext({ emails: ['ana@x.com'], teamIds: [] });
    expect(ctx.people.get('ana@x.com')?.onVacationOrCovering).toBe(true);
    expect(tables.employee_absences.eq).toHaveBeenCalledWith(
      'status',
      'active',
    );
    expect(tables.employee_absences.in).toHaveBeenCalledWith('employee_id', [
      'p',
    ]);
  });

  it('relee el UUID del SM vigente sin cargar el contexto ni consultar Auth', async () => {
    const teamId = '12345678-1234-4234-8234-123456789abc';
    findTeamLeaders.mockResolvedValue({
      architect: null,
      scrumMaster: { id: 'sm-vigente' },
    });
    await expect(repo.findCurrentScrumMasterId(teamId)).resolves.toBe(
      'sm-vigente',
    );
    findTeamLeaders.mockResolvedValue({ architect: null, scrumMaster: null });
    await expect(repo.findCurrentScrumMasterId(teamId)).resolves.toBeNull();
    findTeamLeaders.mockRejectedValue(new Error('Consulta no disponible'));
    await expect(repo.findCurrentScrumMasterId(teamId)).rejects.toThrow(
      'Consulta no disponible',
    );
    expect(findTeamLeaders).toHaveBeenCalledWith(teamId);
    expect(from).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it.each([
    [
      [
        {
          employee_id: 'p',
          event_type: 'assignment',
          to_team_id: 't',
          from_team_id: 'pool',
        },
      ],
      true,
    ],
    [
      [
        {
          employee_id: 'p',
          event_type: 'unassignment',
          from_team_id: 't',
          to_team_id: 'pool',
        },
        { employee_id: 'p', event_type: 'assignment', to_team_id: 't' },
      ],
      false,
    ],
    [
      [{ employee_id: 'p', event_type: 'assignment', to_team_id: 'otro' }],
      false,
    ],
  ])('resuelve cobertura vigente por equipo: %j', async (events, expected) => {
    tables.team_rotation_events = query(events);
    const ctx = await repo.loadContext({ emails: ['ana@x.com'], teamIds: [] });
    expect(ctx.people.get('ana@x.com')?.onVacationOrCovering).toBe(expected);
    expect(tables.team_rotation_events.in).toHaveBeenCalledWith('employee_id', [
      'p',
    ]);
    expect(tables.team_rotation_events.lte).toHaveBeenCalledWith(
      'effective_at',
      expect.any(String),
    );
  });

  it('busca solo correos ausentes en Auth paginado y normaliza sus cruces', async () => {
    tables.employees = query([]);
    listUsers
      .mockResolvedValueOnce({
        data: {
          users: Array.from({ length: 100 }, () => ({ email: 'otro@x.com' })),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [
            {
              email: ' AUTH@X.com ',
              user_metadata: { name: 'Solo Auth', role: 'Admin' },
            },
          ],
        },
        error: null,
      });
    const ctx = await repo.loadContext({
      emails: [' auth@x.COM '],
      teamIds: [],
    });
    expect(ctx.people.get('auth@x.com')).toEqual({
      id: null,
      name: 'Solo Auth',
      email: 'auth@x.com',
      role: 'Admin',
      activeRoleCodes: [],
      teamIds: [],
      onVacationOrCovering: false,
      authOnly: true,
    });
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 100 });
    expect(ctx.people.size).toBe(1);
  });

  it('no consulta con entradas vacías ni inventa personas o equipos', async () => {
    const ctx = await repo.loadContext({ emails: [], teamIds: [] });
    expect(ctx).toEqual({
      people: new Map(),
      teams: new Map(),
      ambiguousEmails: new Set(),
    });
    expect(from).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('lista por nombre/correo y equipo con máximo 50 y todos los equipos activos', async () => {
    tables.employees = query(
      Array.from({ length: 50 }, (_, i) => ({ ...employee, id: `p${i}` })),
    );
    tables.employee_roles = query([{ ...role, employee_id: 'p0' }]);
    tables.team_memberships = query([
      { ...membership, employee_id: 'p0' },
      {
        employee_id: 'p0',
        team_id: 'otro',
        teams: { id: 'otro', name: 'Otro' },
      },
    ]);
    const users = await repo.findUsers({ texto: ' Ana ', equipo_id: 't' });
    expect(users).toHaveLength(50);
    expect(users[0]).toEqual({
      nombre: 'Ana',
      correo: 'ana@x.com',
      rol: 'Arquitecto',
      lidera: [],
      equipos: [
        { id: 't', nombre: 'Alfa' },
        { id: 'otro', nombre: 'Otro' },
      ],
    });
    expect(tables.employees.limit).toHaveBeenCalledWith(50);
    expect(tables.employees.eq).toHaveBeenCalledWith(
      'team_memberships.team_id',
      't',
    );
    expect(tables.employees.eq).toHaveBeenCalledWith(
      'team_memberships.is_active',
      true,
    );
    expect(tables.employees.or).toHaveBeenCalledWith(
      expect.stringContaining('full_name.ilike.'),
    );
  });

  it('fija el filtro literal de búsqueda con porcentaje, comillas, coma y paréntesis', async () => {
    await repo.findUsers({ texto: ' Ana%",(QA) ' });
    expect(tables.employees.or).toHaveBeenCalledWith(
      String.raw`full_name.ilike."%Ana\\%\",(QA)%",email.ilike."%Ana\\%\",(QA)%"`,
    );
  });

  it('conserva roles históricos y todos los roles activos, respetando el primario', async () => {
    tables.employee_roles = query([
      { employee_id: 'p', roles: { code: 'INTERN', name: 'Intern' } },
      role,
    ]);
    const ctx = await repo.loadContext({ emails: ['ana@x.com'], teamIds: [] });
    expect(ctx.people.get('ana@x.com')).toMatchObject({
      role: 'Pasante',
      activeRoleCodes: ['INTERN', 'ARCHITECT'],
      onVacationOrCovering: false,
    });
  });

  it('no inventa personas ausentes ni marca equipos inactivos como activos', async () => {
    tables.employees = query([]);
    tables.teams = query([{ ...team, status: 'inactive' }]);
    tables.team_projects = query([]);
    findTeamLeaders.mockResolvedValue({ architect: null, scrumMaster: null });
    const ctx = await repo.loadContext({
      emails: ['ausente@x.com'],
      teamIds: ['t'],
    });
    expect(ctx.people.size).toBe(0);
    expect(ctx.teams.get('t')).toMatchObject({
      active: false,
      hasOpenProject: false,
    });
    expect(from).not.toHaveBeenCalledWith('employee_roles');
  });

  it('escapa metacaracteres del correo sin convertirlos en un patrón libre', async () => {
    tables.employees = query([]);
    await repo.loadContext({ emails: [' Ana+qa@X.com '], teamIds: [] });
    expect(tables.employees.filter).toHaveBeenCalledWith(
      'email',
      'imatch',
      '^[[:space:]]*ana\\+qa@x\\.com[[:space:]]*$',
    );
  });

  it('lista sin filtros y devuelve rol nulo si no hay asignaciones', async () => {
    tables.employee_roles = query([]);
    tables.team_memberships = query([]);
    await expect(repo.findUsers({})).resolves.toEqual([
      {
        nombre: 'Ana',
        correo: 'ana@x.com',
        rol: null,
        equipos: [],
        lidera: [],
      },
    ]);
    expect(tables.employees.or).not.toHaveBeenCalled();
    expect(tables.employees.eq).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith('employee_absences');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('la búsqueda vacía no consulta roles ni membresías', async () => {
    tables.employees = query([]);
    await expect(repo.findUsers({ texto: '   ' })).resolves.toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(tables.employees.or).not.toHaveBeenCalled();
  });

  it('propaga errores de base y Auth con mensajes en español', async () => {
    tables.employees = query([], { message: 'interno' });
    await expect(
      repo.loadContext({ emails: ['a@x.com'], teamIds: [] }),
    ).rejects.toThrow('No se pudo cargar');
    await expect(repo.findUsers({})).rejects.toThrow('No se pudo cargar');
    tables.employees = query([]);
    listUsers.mockResolvedValue({ data: null, error: { message: 'interno' } });
    await expect(
      repo.loadContext({ emails: ['a@x.com'], teamIds: [] }),
    ).rejects.toThrow('No se pudo consultar Auth');
  });
  it('inserta la confirmación usando el cliente de servicio', async () => {
    tables.story_load_confirmations = query();
    await repo.consumeConfirmation('id', 'leader_designate', null);
    expect(tables.story_load_confirmations.insert).toHaveBeenCalledWith({
      id: 'id',
      operation: 'leader_designate',
      employee_id: null,
    });
  });
  it.each(['23505', 'XX000'])(
    'mapea el error %s al consumir sin exponer BD',
    async (code) => {
      tables.story_load_confirmations = query([], {
        code,
        message: 'detalle privado',
      });
      try {
        await repo.consumeConfirmation('id', 'user_role', 'admin');
        throw new Error('Debió fallar');
      } catch (error) {
        expect(error).toMatchObject({
          status: code === '23505' ? 400 : 500,
          message:
            code === '23505'
              ? 'Esta confirmación ya se usó; genera la vista previa de nuevo'
              : 'No se pudo consumir la confirmación',
        });
      }
    },
  );
  it('lista liderazgos vigentes incluso sin membresía en el equipo', async () => {
    tables.team_memberships = query([]);
    findTeamLeaders.mockResolvedValue({
      architect: { id: 'p' },
      scrumMaster: { id: 'p' },
    });
    const users = await repo.findUsers({});
    expect(users[0]).toMatchObject({
      equipos: [],
      lidera: [
        { id: 't', nombre: 'Alfa', cargo: 'Arquitecto' },
        { id: 't', nombre: 'Alfa', cargo: 'Scrum Master' },
      ],
    });
    expect(findTeamLeaders).toHaveBeenCalledWith('t');
  });
});
