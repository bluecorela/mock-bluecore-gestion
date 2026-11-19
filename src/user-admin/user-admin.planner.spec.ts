import {
  normalizeEmail,
  planCreate,
  planRole,
  planMove,
  planDesignate,
  POOL_TEAM_CODE,
} from './user-admin.planner';
import type {
  CreateRow,
  DesignateRow,
  Person,
  PlanContext,
  RoleRow,
} from './user-admin.types';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const POOL = '33333333-3333-4333-8333-333333333333';
const create: CreateRow = {
  nombre: 'Ana Pérez',
  correo: 'ana@x.com',
  rol: 'Arquitecto',
  equipo_id: A,
};
const role: RoleRow = { correo: create.correo, rol: 'Ingeniero de QA' };
const move = { correo: create.correo, equipo_destino_id: B };
const designate: DesignateRow = {
  correo: create.correo,
  equipo_id: A,
  rol: 'Arquitecto',
};
const architectMemberWarning =
  'Queda como integrante; no podrá crear sprints como arquitecto del equipo hasta que lo designes';
const scrumMasterMemberWarning =
  'Queda como integrante; no figura como Scrum Master del equipo';
const replacement =
  'Reemplaza a Luis Salgado como arquitecto de SGB Evolución; sus sprints planificados pasan a Ana Pérez';
let ctx: PlanContext;
let ana: Person;
const team = (
  id: string,
  name: string,
  code = id,
): PlanContext['teams'] extends Map<string, infer T> ? T : never => ({
  id,
  code,
  name,
  active: true,
  hasOpenProject: true,
  leaders: { architect: null, scrumMaster: null },
});
const addAna = () => ctx.people.set(ana.email, ana);
const currentLeader = () => {
  ctx.teams.get(A)!.leaders.architect = ana;
};
const luis = (): Person => ({
  ...ana,
  id: 'luis',
  name: 'Luis Salgado',
  email: 'luis@x.com',
});

beforeEach(() => {
  ana = {
    id: 'ana',
    name: 'Ana Pérez',
    email: 'ana@x.com',
    role: 'Arquitecto',
    teamIds: [A],
    onVacationOrCovering: false,
    authOnly: false,
    activeRoleCodes: ['ARCHITECT'],
  };
  ctx = {
    ambiguousEmails: new Set(),
    teams: new Map([
      [A, team(A, 'SGB Evolución')],
      [B, team(B, 'B')],
      [POOL, team(POOL, 'Pool de Vacaciones', 'pool-de-vacaciones')],
    ]),
    people: new Map(),
  };
});

describe('normalizeEmail', () => {
  it('compara correos con lower(trim())', () =>
    expect(normalizeEmail(' Ana@X.com ')).toBe('ana@x.com'));
});

describe('planCreate', () => {
  it('rechaza correo inválido', () =>
    expect(
      planCreate([{ ...create, correo: 'invalido' }], ctx)[0].errors,
    ).toContain('Correo inválido'));
  it('rechaza solo la segunda aparición normalizada del lote', () => {
    const rows = planCreate([{ ...create, correo: 'Ana@X.com ' }, create], ctx);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toContain('Correo repetido en el lote');
    expect(rows.map((r) => r.row)).toEqual([1, 2]);
  });
  it('omite empleados existentes comparando el correo normalizado', () => {
    addAna();
    expect(
      planCreate([{ ...create, correo: ' Ana@X.com ' }], ctx)[0],
    ).toMatchObject({
      action: 'omitir',
      errors: [],
      warnings: ['Ya existe; se omite'],
    });
  });
  it('omite correos que solo existen en Auth', () => {
    ana.authOnly = true;
    ana.id = null;
    addAna();
    expect(
      planCreate([{ ...create, correo: ' Ana@X.com ' }], ctx)[0],
    ).toMatchObject({
      action: 'omitir',
      errors: [],
      warnings: ['Ya existe; se omite'],
    });
  });
  it('rechaza rol destino Admin', () =>
    expect(
      planCreate([{ ...create, rol: 'Admin' as CreateRow['rol'] }], ctx)[0]
        .errors,
    ).toContain('El rol Admin solo se asigna desde la web'));
  it('rechaza rol desconocido', () =>
    expect(
      planCreate([{ ...create, rol: 'Otro' as CreateRow['rol'] }], ctx)[0]
        .errors,
    ).toContain('Rol desconocido'));
  it('rechaza persona Admin aunque ya exista', () => {
    ana.role = 'Admin';
    addAna();
    expect(planCreate([create], ctx)[0].errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza persona con ADMIN secundario aunque ya exista', () => {
    ana.activeRoleCodes = ['ARCHITECT', 'ADMIN'];
    addAna();
    expect(planCreate([create], ctx)[0].errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza equipo inexistente', () =>
    expect(
      planCreate([{ ...create, equipo_id: 'ausente' }], ctx)[0].errors,
    ).toContain('El equipo no existe o está inactivo'));
  it('rechaza equipo inactivo', () => {
    ctx.teams.get(A)!.active = false;
    expect(planCreate([create], ctx)[0].errors).toContain(
      'El equipo no existe o está inactivo',
    );
  });
  it('reconoce el pool por code y no por UUID', () => {
    expect(POOL_TEAM_CODE).toBe('pool-de-vacaciones');
    expect(
      planCreate([{ ...create, equipo_id: POOL }], ctx)[0].errors,
    ).toContain(
      'No se puede dar de alta en el pool de vacaciones; usa Rotación en la web',
    );
  });
  it('rechaza designar QA como líder', () =>
    expect(
      planCreate(
        [{ ...create, rol: 'Ingeniero de QA', designar_como_lider: true }],
        ctx,
      )[0].errors,
    ).toContain(
      'Solo se puede designar como líder a un Arquitecto o Scrum Master',
    ));
  it('rechaza designar sin proyecto abierto', () => {
    ctx.teams.get(A)!.hasOpenProject = false;
    expect(
      planCreate([{ ...create, designar_como_lider: true }], ctx)[0].errors,
    ).toContain('El equipo no tiene proyectos activos');
  });
  it('avisa el reemplazo con nombres del contexto', () => {
    ctx.teams.get(A)!.leaders.architect = luis();
    expect(
      planCreate([{ ...create, designar_como_lider: true }], ctx)[0].warnings,
    ).toEqual([replacement]);
  });
  it('avisa que Arquitecto sin designar queda como integrante', () =>
    expect(planCreate([create], ctx)[0].warnings).toEqual([
      architectMemberWarning,
    ]));
  it('avisa que Scrum Master sin designar queda como integrante', () =>
    expect(
      planCreate([{ ...create, rol: 'Scrum Master' }], ctx)[0].warnings,
    ).toEqual([scrumMasterMemberWarning]));
  it('permite altas sin designación en equipos sin proyecto', () => {
    ctx.teams.get(A)!.hasOpenProject = false;
    expect(planCreate([create], ctx)[0]).toMatchObject({
      action: 'crear',
      errors: [],
      summary: expect.stringContaining('SGB Evolución'),
    });
  });
  it('rechaza lotes vacíos', () =>
    expect(() => planCreate([], ctx)).toThrow(
      'El lote debe tener entre 1 y 10 usuarios',
    ));
  it('rechaza lotes de más de diez', () =>
    expect(() =>
      planCreate(
        Array.from({ length: 11 }, () => create),
        ctx,
      ),
    ).toThrow('El lote debe tener entre 1 y 10 usuarios'));
});

describe('planRole', () => {
  beforeEach(addAna);
  it('rechaza persona inexistente', () => {
    ctx.people.clear();
    expect(planRole(role, ctx).errors).toContain(
      'No existe una persona con ese correo',
    );
  });
  it('rechaza persona authOnly', () => {
    ana.authOnly = true;
    expect(planRole(role, ctx).errors).toContain(
      'No existe una persona con ese correo',
    );
  });
  it('rechaza persona Admin', () => {
    ana.role = 'Admin';
    expect(planRole(role, ctx).errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza persona con ADMIN secundario', () => {
    ana.activeRoleCodes = ['ARCHITECT', 'ADMIN'];
    expect(planRole(role, ctx).errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza rol destino Admin', () =>
    expect(
      planRole({ ...role, rol: 'Admin' as RoleRow['rol'] }, ctx).errors,
    ).toContain('El rol Admin solo se asigna desde la web'));
  it('rechaza rol destino desconocido', () =>
    expect(
      planRole({ ...role, rol: 'Otro' as RoleRow['rol'] }, ctx).errors,
    ).toContain('Rol desconocido'));
  it('avisa si sigue figurando como arquitecto', () => {
    currentLeader();
    expect(planRole(role, ctx).warnings).toEqual([
      'Sigue figurando como arquitecto de SGB Evolución hasta que lo reemplaces en Equipos',
    ]);
  });
  it('avisa si sigue figurando como Scrum Master', () => {
    ctx.teams.get(A)!.leaders.scrumMaster = ana;
    expect(planRole(role, ctx).warnings).toEqual([
      'Sigue figurando como Scrum Master de SGB Evolución hasta que lo reemplaces en Equipos',
    ]);
  });
  it('resume Sin cambios si ya tiene el rol', () =>
    expect(planRole({ ...role, rol: 'Arquitecto' }, ctx)).toMatchObject({
      action: 'cambiar_rol',
      summary: 'Sin cambios',
      errors: [],
    }));
  it('resuelve correo normalizado y nombre', () =>
    expect(planRole({ ...role, correo: ' Ana@X.com ' }, ctx)).toMatchObject({
      errors: [],
      summary: expect.stringContaining('Ana Pérez'),
    }));
});

describe('planMove', () => {
  beforeEach(addAna);
  it('pide origen si tiene dos equipos usando sus nombres', () => {
    ctx.teams.get(A)!.name = 'A';
    ana.teamIds = [A, B];
    expect(planMove(move, ctx).errors).toContain(
      'Indica el equipo de origen: está en A y B',
    );
  });
  it('rechaza origen igual al destino', () =>
    expect(planMove({ ...move, equipo_destino_id: A }, ctx).errors).toContain(
      'El equipo de destino es igual al de origen',
    ));
  it('rechaza persona ya activa en destino', () => {
    ana.teamIds = [A, B];
    expect(planMove({ ...move, equipo_origen_id: A }, ctx).errors).toContain(
      'La persona ya está activa en el equipo de destino',
    );
  });
  it('rechaza vacaciones o cobertura', () => {
    ana.onVacationOrCovering = true;
    expect(planMove(move, ctx).errors).toContain(
      'Tiene vacaciones activas o está cubriendo; usa Rotación en la web',
    );
  });
  it('rechaza destino pool por code', () =>
    expect(
      planMove({ ...move, equipo_destino_id: POOL }, ctx).errors,
    ).toContain(
      'No se puede mover al pool de vacaciones; usa Rotación en la web',
    ));
  it('avisa si es líder del origen', () => {
    currentLeader();
    expect(planMove(move, ctx).warnings).toContain(
      'Sigue figurando como arquitecto de SGB Evolución hasta que lo reemplaces en Equipos',
    );
  });
  it('rechaza persona Admin', () => {
    ana.role = 'Admin';
    expect(planMove(move, ctx).errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza persona con ADMIN secundario', () => {
    ana.activeRoleCodes = ['ARCHITECT', 'ADMIN'];
    expect(planMove(move, ctx).errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza persona inexistente', () => {
    ctx.people.clear();
    expect(planMove(move, ctx).errors).toContain(
      'No existe una persona con ese correo',
    );
  });
  it('rechaza persona authOnly', () => {
    ana.authOnly = true;
    expect(planMove(move, ctx).errors).toContain(
      'No existe una persona con ese correo',
    );
  });
  it('rechaza origen que no es equipo de la persona', () =>
    expect(planMove({ ...move, equipo_origen_id: B }, ctx).errors).toContain(
      'La persona no está activa en el equipo de origen',
    ));
  it('rechaza ausencia de origen', () => {
    ana.teamIds = [];
    expect(planMove(move, ctx).errors).toContain(
      'La persona no tiene un equipo de origen activo',
    );
  });
  it('rechaza destino inexistente', () =>
    expect(
      planMove({ ...move, equipo_destino_id: 'ausente' }, ctx).errors,
    ).toContain('El equipo no existe o está inactivo'));
  it('rechaza destino inactivo', () => {
    ctx.teams.get(B)!.active = false;
    expect(planMove(move, ctx).errors).toContain(
      'El equipo no existe o está inactivo',
    );
  });
  it('rechaza designación de rol que no es líder', () => {
    ana.role = 'Ingeniero de Software';
    expect(
      planMove({ ...move, designar_como_lider: true }, ctx).errors,
    ).toContain(
      'Solo se puede designar como líder a un Arquitecto o Scrum Master',
    );
  });
  it('rechaza designación sin proyecto', () => {
    ctx.teams.get(B)!.hasOpenProject = false;
    expect(
      planMove({ ...move, designar_como_lider: true }, ctx).errors,
    ).toContain('El equipo no tiene proyectos activos');
  });
  it('exige rol vigente al designar tras mover', () => {
    ana.activeRoleCodes = [];
    expect(
      planMove({ ...move, designar_como_lider: true }, ctx).errors,
    ).toContain(
      'La persona no tiene el rol Arquitecto vigente. Cámbiale primero el rol',
    );
  });
  it('avisa reemplazo en el destino', () => {
    ctx.teams.get(B)!.leaders.architect = luis();
    expect(
      planMove({ ...move, designar_como_lider: true }, ctx).warnings,
    ).toEqual([
      'Reemplaza a Luis Salgado como arquitecto de B; sus sprints planificados pasan a Ana Pérez',
    ]);
  });
  it('resuelve el único origen y normaliza correo sin mutar la entrada', () => {
    const input = { ...move, correo: ' Ana@X.com ' };
    expect(planMove(input, ctx)).toMatchObject({
      action: 'mover',
      errors: [],
      summary: expect.stringContaining('SGB Evolución'),
    });
    expect(input.correo).toBe(' Ana@X.com ');
  });
});

describe('planDesignate', () => {
  beforeEach(addAna);
  it('exige ARCHITECT vigente aunque role sea Arquitecto', () => {
    ana.activeRoleCodes = [];
    expect(planDesignate(designate, ctx).errors).toContain(
      'La persona no tiene el rol Arquitecto vigente. Cámbiale primero el rol',
    );
  });
  it('exige SCRUM_MASTER vigente', () =>
    expect(
      planDesignate({ ...designate, rol: 'Scrum Master' }, ctx).errors,
    ).toContain(
      'La persona no tiene el rol Scrum Master vigente. Cámbiale primero el rol',
    ));
  it('acepta el código vigente aunque difiera de role', () => {
    ana.role = 'Ingeniero de QA';
    expect(planDesignate(designate, ctx).errors).toEqual([]);
  });
  it('reconoce al arquitecto actual sin errores ni avisos', () => {
    currentLeader();
    expect(planDesignate(designate, ctx)).toMatchObject({
      action: 'designar',
      summary: 'Ya es el arquitecto del equipo',
      errors: [],
      warnings: [],
    });
  });
  it('reconoce al Scrum Master actual sin errores ni avisos', () => {
    ana.activeRoleCodes = ['SCRUM_MASTER'];
    ctx.teams.get(A)!.leaders.scrumMaster = ana;
    expect(
      planDesignate({ ...designate, rol: 'Scrum Master' }, ctx),
    ).toMatchObject({
      action: 'designar',
      summary: 'Ya es el Scrum Master del equipo',
      errors: [],
      warnings: [],
    });
  });
  it('avisa reemplazo de arquitecto', () => {
    ctx.teams.get(A)!.leaders.architect = luis();
    expect(planDesignate(designate, ctx).warnings).toEqual([replacement]);
  });
  it('avisa reemplazo de Scrum Master con nombres del contexto', () => {
    ana.activeRoleCodes = ['SCRUM_MASTER'];
    ctx.teams.get(A)!.leaders.scrumMaster = luis();
    expect(
      planDesignate({ ...designate, rol: 'Scrum Master' }, ctx).warnings,
    ).toEqual([
      'Reemplaza a Luis Salgado como Scrum Master de SGB Evolución; sus sprints planificados pasan a Ana Pérez',
    ]);
  });
  it('rechaza persona inexistente', () => {
    ctx.people.clear();
    expect(planDesignate(designate, ctx).errors).toContain(
      'No existe una persona con ese correo',
    );
  });
  it('rechaza persona authOnly', () => {
    ana.authOnly = true;
    expect(planDesignate(designate, ctx).errors).toContain(
      'No existe una persona con ese correo',
    );
  });
  it('rechaza persona Admin', () => {
    ana.role = 'Admin';
    expect(planDesignate(designate, ctx).errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza persona con ADMIN secundario', () => {
    ana.activeRoleCodes = ['ARCHITECT', 'ADMIN'];
    expect(planDesignate(designate, ctx).errors).toContain(
      'Los Admin solo se modifican desde la web',
    );
  });
  it('rechaza rol Admin', () =>
    expect(
      planDesignate({ ...designate, rol: 'Admin' as DesignateRow['rol'] }, ctx)
        .errors,
    ).toContain('El rol Admin solo se asigna desde la web'));
  it('rechaza roles sin liderazgo', () =>
    expect(
      planDesignate(
        { ...designate, rol: 'Ingeniero de QA' as DesignateRow['rol'] },
        ctx,
      ).errors,
    ).toContain(
      'Solo se puede designar como líder a un Arquitecto o Scrum Master',
    ));
  it('rechaza equipo inexistente', () =>
    expect(
      planDesignate({ ...designate, equipo_id: 'ausente' }, ctx).errors,
    ).toContain('El equipo no existe o está inactivo'));
  it('rechaza equipo inactivo', () => {
    ctx.teams.get(A)!.active = false;
    expect(planDesignate(designate, ctx).errors).toContain(
      'El equipo no existe o está inactivo',
    );
  });
  it('rechaza equipo sin proyecto abierto', () => {
    ctx.teams.get(A)!.hasOpenProject = false;
    expect(planDesignate(designate, ctx).errors).toContain(
      'El equipo no tiene proyectos activos',
    );
  });
  it('resuelve correo normalizado', () =>
    expect(
      planDesignate({ ...designate, correo: ' Ana@X.com ' }, ctx).errors,
    ).toEqual([]));
});

describe('pureza', () => {
  it('conserva entradas y contexto y produce el mismo resultado al repetir', () => {
    addAna();
    currentLeader();
    const rows = [{ ...create, correo: ' Nueva@X.com ' }];
    const beforeContext = structuredClone(ctx);
    const beforeRows = structuredClone(rows);
    const run = () => [
      planCreate(rows, ctx),
      planRole(role, ctx),
      planMove(move, ctx),
      planDesignate(designate, ctx),
    ];
    expect(run()).toEqual(run());
    expect(ctx).toEqual(beforeContext);
    expect(rows).toEqual(beforeRows);
  });
});

describe('correos ambiguos', () => {
  beforeEach(() => {
    addAna();
    ctx.ambiguousEmails.add(ana.email);
    ctx.teams.get(A)!.leaders.scrumMaster = {
      ...ana,
      id: 'otra',
      name: 'Otra Ana',
    };
  });
  it('bloquea todas las operaciones sin planificar cierres del origen', () => {
    const results = [
      planCreate([create], ctx)[0],
      planRole(role, ctx),
      planMove(
        { ...move, correo: ' Ana@X.com ', designar_como_lider: true },
        ctx,
      ),
      planDesignate({ ...designate, equipo_id: B }, ctx),
    ];
    for (const result of results) {
      expect(result.errors).toContain(
        'Hay varias personas con este correo; corrígelo desde la web',
      );
      expect(result.resolvedMove).toBeUndefined();
    }
    expect(results[0]).toMatchObject({ action: 'omitir', noop: true });
  });
});

describe('identidad de líderes por UUID', () => {
  beforeEach(addAna);
  it('no confunde otro UUID con el objetivo aunque compartan correo normalizado', () => {
    const other = { ...ana, id: 'otra', name: 'Otra Ana' };
    ctx.teams.get(A)!.leaders.architect = other;
    ctx.teams.get(A)!.leaders.scrumMaster = other;
    expect(planRole(role, ctx).warnings).toEqual([]);
    expect(planDesignate(designate, ctx)).toMatchObject({
      noop: false,
      warnings: [
        'Reemplaza a Otra Ana como arquitecto de SGB Evolución; sus sprints planificados pasan a Ana Pérez',
      ],
    });
    for (const result of [
      planMove({ ...move, designar_como_lider: true }, ctx),
      planDesignate({ ...designate, equipo_id: B }, ctx),
    ]) {
      expect(result.errors).toEqual([]);
      expect(result.resolvedMove?.closeSourceLeader).toBeUndefined();
      expect(result.warnings).toEqual([]);
    }
  });
});

describe('Observaciones de revisión', () => {
  it('identifica no-op y no avisa de liderazgo si el rol no cambia', () => {
    addAna();
    currentLeader();
    const row = planRole({ correo: ana.email, rol: 'Arquitecto' }, ctx);
    expect(row.noop).toBe(true);
    expect(row.noop).toBe(true);
    expect(row.warnings).toEqual([]);
    expect(planDesignate(designate, ctx).noop).toBe(true);
    expect(planRole(role, ctx).noop).toBe(false);
  });
  it('no duplica errores si destino es el único equipo', () => {
    addAna();
    expect(
      planMove({ ...move, equipo_destino_id: A }, ctx).errors,
    ).toHaveLength(1);
  });
  it('avisa al cambiar a líder sin designación, como en altas y movimientos', () => {
    ana.role = 'Ingeniero de QA';
    addAna();
    expect(
      planRole({ correo: ana.email, rol: 'Arquitecto' }, ctx).warnings,
    ).toContain(architectMemberWarning);
    expect(
      planRole({ correo: ana.email, rol: 'Scrum Master' }, ctx).warnings,
    ).toContain(scrumMasterMemberWarning);
  });
});

describe('designar también mueve (13 nov)', () => {
  beforeEach(addAna);
  const row = { ...designate, equipo_id: B };
  it('mueve al no integrante y lo dice en la acción', () => {
    const result = planDesignate(row, ctx);
    expect(result.errors).toEqual([]);
    expect(result.summary).toBe(
      'Mover a Ana Pérez de SGB Evolución a B y designarlo como Arquitecto de B',
    );
    expect(result.resolvedMove).toMatchObject({
      sourceTeamId: A,
      employeeId: 'ana',
    });
  });
  it('pide origen entre varios y permite uno explícito', () => {
    ana.teamIds = [A, POOL];
    const result = planDesignate(row, ctx);
    expect(result.errors).toContain(
      'Indica el equipo de origen: está en SGB Evolución y Pool de Vacaciones',
    );
    expect(result.summary).toBe(
      'Mover a Ana Pérez a B y designarlo como Arquitecto de B',
    );
    expect(planDesignate({ ...row, equipo_origen_id: A }, ctx).errors).toEqual(
      [],
    );
  });
  it.each(['designar', 'mover'])('%s cierra el SM del origen', (op) => {
    ana.role = 'Scrum Master';
    ana.activeRoleCodes = ['SCRUM_MASTER'];
    ctx.teams.get(A)!.leaders.scrumMaster = ana;
    const result =
      op === 'designar'
        ? planDesignate({ ...row, rol: 'Scrum Master' }, ctx)
        : planMove({ ...move, designar_como_lider: true }, ctx);
    expect(result.warnings).toContain('SGB Evolución queda sin Scrum Master');
    expect(result.resolvedMove).toMatchObject({
      closeSourceLeader: { employeeId: 'ana', teamId: A },
    });
    expect(result.warnings.join()).not.toContain('Sigue figurando');
  });
  it.each(['designar', 'mover'])(
    '%s impide dejar el origen sin arquitecto',
    (op) => {
      currentLeader();
      const result =
        op === 'designar'
          ? planDesignate(row, ctx)
          : planMove({ ...move, designar_como_lider: true }, ctx);
      expect(result.errors).toContain(
        'Es el arquitecto de SGB Evolución: designa primero a su reemplazo',
      );
      expect(planMove(move, ctx).warnings.join()).toContain(
        'Sigue figurando como arquitecto',
      );
    },
  );
  it('si ya es integrante solo designa', () => {
    expect(planDesignate(designate, ctx).resolvedMove).toBeUndefined();
  });
  it('sin equipos permite incorporación sin origen', () => {
    ana.teamIds = [];
    expect(planDesignate(row, ctx)).toMatchObject({
      errors: [],
      summary: 'Agregar a Ana Pérez a B y designarlo como Arquitecto de B',
      resolvedMove: { sourceTeamId: null },
    });
  });
});

describe.each(['designar', 'mover'] as const)(
  '%s revisa ambos liderazgos del origen',
  (op) => {
    beforeEach(() => {
      ana.activeRoleCodes = ['ARCHITECT', 'SCRUM_MASTER'];
      addAna();
    });
    const plan = (rol: DesignateRow['rol']) => {
      ana.role = rol;
      return op === 'designar'
        ? planDesignate({ ...designate, equipo_id: B, rol }, ctx)
        : planMove({ ...move, designar_como_lider: true }, ctx);
    };
    it('bloquea al arquitecto de origen aunque designe como SM', () => {
      currentLeader();
      expect(plan('Scrum Master').errors).toContain(
        'Es el arquitecto de SGB Evolución: designa primero a su reemplazo',
      );
    });
    it('cierra el SM de origen aunque designe como arquitecto', () => {
      ctx.teams.get(A)!.leaders.scrumMaster = ana;
      const result = plan('Arquitecto');
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain('SGB Evolución queda sin Scrum Master');
      expect(result.resolvedMove?.closeSourceLeader).toEqual({
        teamId: A,
        employeeId: 'ana',
      });
    });
    it.each(['Arquitecto', 'Scrum Master'] as const)(
      'evalúa los dos cargos vigentes al designar como %s',
      (rol) => {
        currentLeader();
        ctx.teams.get(A)!.leaders.scrumMaster = ana;
        const result = plan(rol);
        expect(result.errors).toContain(
          'Es el arquitecto de SGB Evolución: designa primero a su reemplazo',
        );
        expect(result.warnings).toContain(
          'SGB Evolución queda sin Scrum Master',
        );
        expect(result.resolvedMove?.closeSourceLeader).toEqual({
          teamId: A,
          employeeId: 'ana',
        });
        const withoutDesignation = planMove(move, ctx);
        expect(withoutDesignation.errors).toEqual([]);
        expect(
          withoutDesignation.resolvedMove?.closeSourceLeader,
        ).toBeUndefined();
        expect(withoutDesignation.warnings).toEqual(
          expect.arrayContaining([
            'Sigue figurando como arquitecto de SGB Evolución hasta que lo reemplaces en Equipos',
            'Sigue figurando como Scrum Master de SGB Evolución hasta que lo reemplaces en Equipos',
          ]),
        );
      },
    );
  },
);

describe('persona inactiva y líderes Admin', () => {
  beforeEach(addAna);
  const inactive = 'La persona está inactiva; actívala desde la web';
  const adminLeader = (name: string) =>
    `El líder actual de ${name} es Admin; cámbialo desde la web`;
  it.each(['designar', 'mover'] as const)('%s rechaza a un inactivo', (op) => {
    ana.inactive = true;
    const result =
      op === 'designar'
        ? planDesignate(designate, ctx)
        : planMove({ ...move, designar_como_lider: true }, ctx);
    expect(result.errors).toContain(inactive);
  });
  it('mover sin designación también rechaza a un inactivo', () => {
    ana.inactive = true;
    expect(planMove(move, ctx).errors).toContain(inactive);
  });
  it('un alta con el correo de un inactivo sigue omitiéndose', () => {
    ana.inactive = true;
    expect(planCreate([create], ctx)[0]).toMatchObject({
      action: 'omitir',
      errors: [],
    });
  });
  it.each([
    ['rol primario', { role: 'Admin' }],
    ['rol vigente', { activeRoleCodes: ['ARCHITECT', 'ADMIN'] }],
  ])('no reemplaza a un líder Admin por %s', (_kind, admin) => {
    ctx.teams.get(B)!.leaders.architect = { ...luis(), ...admin };
    const results = [
      planDesignate({ ...designate, equipo_id: B }, ctx),
      planMove({ ...move, designar_como_lider: true }, ctx),
      planCreate([{ ...create, equipo_id: B, designar_como_lider: true }], {
        ...ctx,
        people: new Map(),
      })[0],
    ];
    for (const result of results) {
      expect(result.errors).toContain(adminLeader('B'));
      expect(result.warnings.join()).not.toContain('Reemplaza a');
    }
  });
  it('no cierra al SM de origen si es Admin', () => {
    ana.role = 'Scrum Master';
    ana.activeRoleCodes = ['SCRUM_MASTER', 'ADMIN'];
    ctx.teams.get(A)!.leaders.scrumMaster = ana;
    expect(
      planDesignate({ ...designate, equipo_id: B, rol: 'Scrum Master' }, ctx)
        .errors,
    ).toContain('Los Admin solo se modifican desde la web');
  });
});

it.each(['Arquitecto', 'Scrum Master'] as const)(
  'vista previa rechaza doble liderazgo: %s',
  (rol) => {
    addAna();
    ana.activeRoleCodes = ['ARCHITECT', 'SCRUM_MASTER'];
    ctx.teams.get(A)!.leaders[
      rol === 'Arquitecto' ? 'scrumMaster' : 'architect'
    ] = ana;
    expect(planDesignate({ ...designate, rol }, ctx).errors).toContain(
      'La misma persona no puede ser Arquitecto y Scrum Master del equipo',
    );
  },
);

it('marca ambas filas con designaciones incompatibles dentro del lote', () => {
  const rows = planCreate(
    [
      { ...create, designar_como_lider: true },
      {
        ...create,
        correo: ' ANA@x.com ',
        rol: 'Scrum Master',
        designar_como_lider: true,
      },
    ],
    ctx,
  );
  for (const row of rows)
    expect(row.errors).toContain(
      'La misma persona no puede ser Arquitecto y Scrum Master del equipo',
    );
  expect(ctx.teams.get(A)!.leaders).toEqual({
    architect: null,
    scrumMaster: null,
  });
});
