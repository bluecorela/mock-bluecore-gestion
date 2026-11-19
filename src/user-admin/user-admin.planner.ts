import { isEmail } from 'class-validator';
import { AUTH_ROLES } from '../auth/auth.constants';
import type {
  CreateRow,
  DesignateRow,
  MoveRow,
  Person,
  PlanContext,
  PlannedRow,
  RoleRow,
} from './user-admin.types';

export const POOL_TEAM_CODE = 'pool-de-vacaciones';
type Team = PlanContext['teams'] extends Map<string, infer T> ? T : never;
function memberWarning(role: 'Arquitecto' | 'Scrum Master'): string {
  return role === 'Arquitecto'
    ? 'Queda como integrante; no podrá crear sprints como arquitecto del equipo hasta que lo designes'
    : 'Queda como integrante; no figura como Scrum Master del equipo';
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdmin(person: Person): boolean {
  return person.role === 'Admin' || person.activeRoleCodes.includes('ADMIN');
}

function planned<T extends { correo: string }>(
  input: T,
  action: PlannedRow<T>['action'],
): PlannedRow<T> {
  const result: PlannedRow<T> = {
    row: 1,
    input: { ...input, correo: normalizeEmail(input.correo) },
    action,
    noop: false,
    summary: '',
    errors: [],
    warnings: [],
  };
  if (!isEmail(result.input.correo)) result.errors.push('Correo inválido');
  return result;
}

function validateRole(role: string | null, errors: string[]): void {
  if (role === 'Admin') errors.push('El rol Admin solo se asigna desde la web');
  else if (!AUTH_ROLES.some((allowed) => allowed === role))
    errors.push('Rol desconocido');
}

function findPerson(
  email: string,
  ctx: PlanContext,
  errors: string[],
): Person | undefined {
  if (rejectAmbiguousEmail(email, ctx, errors)) return undefined;
  const person = ctx.people.get(normalizeEmail(email));
  if (!person || person.authOnly) {
    errors.push('No existe una persona con ese correo');
    return undefined;
  }
  if (isAdmin(person)) {
    errors.push('Los Admin solo se modifican desde la web');
  }
  return person;
}

function rejectInactive(person: Person, errors: string[]): void {
  if (person.inactive)
    errors.push('La persona está inactiva; actívala desde la web');
}

function rejectAmbiguousEmail(
  email: string,
  ctx: PlanContext,
  errors: string[],
): boolean {
  if (!ctx.ambiguousEmails.has(normalizeEmail(email))) return false;
  errors.push('Hay varias personas con este correo; corrígelo desde la web');
  return true;
}

function findTeam(
  id: string,
  ctx: PlanContext,
  errors: string[],
): Team | undefined {
  const team = ctx.teams.get(id);
  if (!team || !team.active) {
    errors.push('El equipo no existe o está inactivo');
    return undefined;
  }
  return team;
}

function isLeaderRole(role: string | null): role is DesignateRow['rol'] {
  return role === 'Arquitecto' || role === 'Scrum Master';
}

function leaderName(role: DesignateRow['rol']): string {
  return role === 'Arquitecto' ? 'arquitecto' : 'Scrum Master';
}

function samePerson(a: Person | null, b: Person): boolean {
  return a !== null && a.id !== null && a.id === b.id;
}

function planLeadership(
  role: string | null,
  person: Person,
  team: Team | undefined,
  errors: string[],
  warnings: string[],
  requireActiveRole: boolean,
): boolean {
  if (!isLeaderRole(role)) {
    errors.push(
      'Solo se puede designar como líder a un Arquitecto o Scrum Master',
    );
    return false;
  }
  const code = role === 'Arquitecto' ? 'ARCHITECT' : 'SCRUM_MASTER';
  if (requireActiveRole && !person.activeRoleCodes.includes(code))
    errors.push(
      `La persona no tiene el rol ${role} vigente. Cámbiale primero el rol`,
    );
  if (!team) return false;
  if (
    samePerson(
      role === 'Arquitecto' ? team.leaders.scrumMaster : team.leaders.architect,
      person,
    )
  )
    errors.push(
      'La misma persona no puede ser Arquitecto y Scrum Master del equipo',
    );
  if (!team.hasOpenProject) errors.push('El equipo no tiene proyectos activos');
  const current =
    role === 'Arquitecto' ? team.leaders.architect : team.leaders.scrumMaster;
  if (samePerson(current, person)) return true;
  if (current && isAdmin(current))
    errors.push(
      `El líder actual de ${team.name} es Admin; cámbialo desde la web`,
    );
  else if (current)
    warnings.push(
      `Reemplaza a ${current.name} como ${leaderName(role)} de ${team.name}; sus sprints planificados pasan a ${person.name}`,
    );
  return false;
}

function warnCurrentLeadership(
  person: Person,
  teams: Iterable<Team>,
  warnings: string[],
): void {
  for (const team of teams) {
    for (const role of ['Arquitecto', 'Scrum Master'] as const) {
      const current =
        role === 'Arquitecto'
          ? team.leaders.architect
          : team.leaders.scrumMaster;
      if (samePerson(current, person))
        warnings.push(
          `Sigue figurando como ${leaderName(role)} de ${team.name} hasta que lo reemplaces en Equipos`,
        );
    }
  }
}

export function planCreate(
  rows: CreateRow[],
  ctx: PlanContext,
): PlannedRow<CreateRow>[] {
  if (rows.length < 1 || rows.length > 10)
    throw new Error('El lote debe tener entre 1 y 10 usuarios');
  const seen = new Set<string>();
  const leadership = new Map<string, PlannedRow<CreateRow>[]>();
  return rows.map((input, index) => {
    const result = planned(input, 'crear');
    result.row = index + 1;
    const email = result.input.correo;
    if (seen.has(email)) result.errors.push('Correo repetido en el lote');
    seen.add(email);
    if (input.designar_como_lider && isLeaderRole(input.rol)) {
      const key = `${input.equipo_id}:${email}`;
      const prior = leadership.get(key) ?? [];
      const conflicting = prior.filter((row) => row.input.rol !== input.rol);
      if (conflicting.length) {
        const message =
          'La misma persona no puede ser Arquitecto y Scrum Master del equipo';
        for (const row of [...conflicting, result]) {
          if (!row.errors.includes(message)) row.errors.push(message);
        }
      }
      prior.push(result);
      leadership.set(key, prior);
    }
    validateRole(input.rol, result.errors);
    rejectAmbiguousEmail(email, ctx, result.errors);
    const existing = ctx.people.get(email);
    if (existing && isAdmin(existing))
      result.errors.push('Los Admin solo se modifican desde la web');
    if (existing) {
      result.action = 'omitir';
      result.noop = true;
      result.summary = `Omitir a ${existing.name || input.nombre}`;
      result.warnings.push('Ya existe; se omite');
      return result;
    }
    const team = findTeam(input.equipo_id, ctx, result.errors);
    if (team?.code === POOL_TEAM_CODE)
      result.errors.push(
        'No se puede dar de alta en el pool de vacaciones; usa Rotación en la web',
      );
    result.summary = `Crear a ${input.nombre} como ${input.rol} en ${team?.name ?? input.equipo_id}`;
    if (input.designar_como_lider) {
      planLeadership(
        input.rol,
        {
          id: null,
          name: input.nombre,
          email,
          role: input.rol,
          teamIds: [],
          onVacationOrCovering: false,
          authOnly: false,
          activeRoleCodes: [],
        },
        team,
        result.errors,
        result.warnings,
        false,
      );
      result.summary += '; designar como líder';
    } else if (isLeaderRole(input.rol))
      result.warnings.push(memberWarning(input.rol));
    return result;
  });
}

export function planRole(
  input: RoleRow,
  ctx: PlanContext,
): PlannedRow<RoleRow> {
  const result = planned(input, 'cambiar_rol');
  validateRole(input.rol, result.errors);
  const person = findPerson(input.correo, ctx, result.errors);
  if (!person) return result;
  result.noop = person.role === input.rol;
  result.summary =
    person.role === input.rol
      ? 'Sin cambios'
      : `Cambiar el rol de ${person.name} de ${person.role ?? 'sin rol'} a ${input.rol}`;
  if (person.role !== input.rol) {
    warnCurrentLeadership(person, ctx.teams.values(), result.warnings);
    if (isLeaderRole(input.rol)) {
      const key = input.rol === 'Arquitecto' ? 'architect' : 'scrumMaster';
      if (
        !person.teamIds.some((id) =>
          samePerson(ctx.teams.get(id)?.leaders[key] ?? null, person),
        )
      )
        result.warnings.push(memberWarning(input.rol));
    }
  }
  return result;
}

function resolveSource(
  person: Person,
  explicitSource: string | undefined,
  ctx: PlanContext,
  errors: string[],
  allowNoSource = false,
): string | undefined {
  let sourceId = explicitSource;
  if (!sourceId) {
    if (person.teamIds.length > 1) {
      const names = person.teamIds.map((id) => ctx.teams.get(id)?.name ?? id);
      errors.push(
        `Indica el equipo de origen: está en ${names.slice(0, -1).join(', ')} y ${names.at(-1)}`,
      );
    } else if (person.teamIds.length === 0) {
      if (!allowNoSource)
        errors.push('La persona no tiene un equipo de origen activo');
    } else sourceId = person.teamIds[0];
  }
  if (sourceId && !person.teamIds.includes(sourceId))
    errors.push('La persona no está activa en el equipo de origen');
  return sourceId;
}

function originLeadership(
  person: Person,
  source: Team | undefined,
  result: PlannedRow<unknown>,
): void {
  if (!source) return;
  if (samePerson(source.leaders.architect, person))
    result.errors.push(
      `Es el arquitecto de ${source.name}: designa primero a su reemplazo`,
    );
  if (samePerson(source.leaders.scrumMaster, person)) {
    result.warnings.push(`${source.name} queda sin Scrum Master`);
    if (result.resolvedMove && person.id)
      result.resolvedMove.closeSourceLeader = {
        teamId: source.id,
        employeeId: person.id,
      };
  }
}

export function planMove(
  input: MoveRow,
  ctx: PlanContext,
): PlannedRow<MoveRow> {
  const result = planned(input, 'mover');
  const person = findPerson(input.correo, ctx, result.errors);
  const destination = findTeam(input.equipo_destino_id, ctx, result.errors);
  if (destination?.code === POOL_TEAM_CODE)
    result.errors.push(
      'No se puede mover al pool de vacaciones; usa Rotación en la web',
    );
  if (!person) return result;
  rejectInactive(person, result.errors);
  if (person.onVacationOrCovering)
    result.errors.push(
      'Tiene vacaciones activas o está cubriendo; usa Rotación en la web',
    );
  const sourceId = resolveSource(
    person,
    input.equipo_origen_id,
    ctx,
    result.errors,
  );
  if (sourceId && person.id)
    result.resolvedMove = {
      employeeId: person.id,
      sourceTeamId: sourceId,
      designationRole: input.designar_como_lider
        ? person.role === 'Arquitecto'
          ? 'architect'
          : person.role === 'Scrum Master'
            ? 'scrum-master'
            : null
        : null,
    };
  const source = sourceId ? findTeam(sourceId, ctx, result.errors) : undefined;
  if (sourceId === input.equipo_destino_id)
    result.errors.push('El equipo de destino es igual al de origen');
  else if (person.teamIds.includes(input.equipo_destino_id))
    result.errors.push('La persona ya está activa en el equipo de destino');
  result.summary = `Mover a ${person.name} de ${source?.name ?? 'origen sin resolver'} a ${destination?.name ?? input.equipo_destino_id}`;
  if (source && !input.designar_como_lider)
    warnCurrentLeadership(person, [source], result.warnings);
  if (input.designar_como_lider) {
    planLeadership(
      person.role,
      person,
      destination,
      result.errors,
      result.warnings,
      true,
    );
    originLeadership(person, source, result);
    result.summary += '; designar como líder';
  } else if (isLeaderRole(person.role))
    result.warnings.push(memberWarning(person.role));
  return result;
}

export function planDesignate(
  input: DesignateRow,
  ctx: PlanContext,
): PlannedRow<DesignateRow> {
  const result = planned(input, 'designar');
  validateRole(input.rol, result.errors);
  const person = findPerson(input.correo, ctx, result.errors);
  const team = findTeam(input.equipo_id, ctx, result.errors);
  if (!person) return result;
  rejectInactive(person, result.errors);
  const alreadyLeader = planLeadership(
    input.rol,
    person,
    team,
    result.errors,
    result.warnings,
    true,
  );
  if (!person.teamIds.includes(input.equipo_id)) {
    const sourceId = resolveSource(
      person,
      input.equipo_origen_id,
      ctx,
      result.errors,
      true,
    );
    const source = sourceId
      ? findTeam(sourceId, ctx, result.errors)
      : undefined;
    if (person.onVacationOrCovering)
      result.errors.push(
        'Tiene vacaciones activas o está cubriendo; usa Rotación en la web',
      );
    if (team?.code === POOL_TEAM_CODE)
      result.errors.push(
        'No se puede mover al pool de vacaciones; usa Rotación en la web',
      );
    if (person.id)
      result.resolvedMove = {
        employeeId: person.id,
        sourceTeamId: sourceId ?? null,
        designationRole:
          input.rol === 'Arquitecto' ? 'architect' : 'scrum-master',
      };
    originLeadership(person, source, result);
    const movement =
      person.teamIds.length === 0
        ? `Agregar a ${person.name}`
        : `Mover a ${person.name}${source ? ` de ${source.name}` : ''}`;
    result.summary = `${movement} a ${team?.name ?? input.equipo_id} y designarlo como ${input.rol} de ${team?.name ?? input.equipo_id}`;
    return result;
  }
  result.noop = alreadyLeader;
  result.summary = alreadyLeader
    ? `Ya es el ${leaderName(input.rol)} del equipo`
    : `Designar a ${person.name} como ${isLeaderRole(input.rol) ? leaderName(input.rol) : input.rol} de ${team?.name ?? input.equipo_id}`;
  return result;
}
