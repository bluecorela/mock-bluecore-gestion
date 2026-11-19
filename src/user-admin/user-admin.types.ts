export type AssignableRole =
  | 'Arquitecto'
  | 'Scrum Master'
  | 'Ingeniero de Software'
  | 'Ingeniero de QA';
export type UserAdminOperation =
  | 'user_create'
  | 'user_role'
  | 'user_move'
  | 'leader_designate';
export interface CreateRow {
  nombre: string;
  correo: string;
  rol: AssignableRole;
  equipo_id: string;
  designar_como_lider?: boolean;
}
export interface RoleRow {
  correo: string;
  rol: AssignableRole;
}
export interface MoveRow {
  correo: string;
  equipo_destino_id: string;
  equipo_origen_id?: string;
  designar_como_lider?: boolean;
}
export interface DesignateRow {
  equipo_origen_id?: string;
  correo: string;
  equipo_id: string;
  rol: 'Arquitecto' | 'Scrum Master';
}
export interface PlannedRow<T> {
  row: number;
  input: T;
  action: 'crear' | 'omitir' | 'cambiar_rol' | 'mover' | 'designar';
  noop: boolean;
  resolvedMove?: {
    employeeId: string;
    sourceTeamId: string | null;
    closeSourceLeader?: { teamId: string; employeeId: string };
    designationRole: 'architect' | 'scrum-master' | null;
  };
  summary: string;
  errors: string[];
  warnings: string[];
}
export interface PlanContext {
  ambiguousEmails: Set<string>;
  teams: Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      active: boolean;
      hasOpenProject: boolean;
      leaders: { architect: Person | null; scrumMaster: Person | null };
    }
  >;
  people: Map<string, Person>;
}
export interface Person {
  id: string | null;
  name: string;
  email: string;
  role: string | null;
  teamIds: string[];
  onVacationOrCovering: boolean;
  authOnly: boolean;
  activeRoleCodes: string[];
  inactive?: boolean;
}

export interface PreviewResponse {
  rows: (PlannedRow<unknown> & {
    confirmationToken: string | null;
    expiresAt: string | null;
  })[];
  errors: number;
}
export interface RowResult {
  row: number;
  correo: string;
  estado:
    | 'creada'
    | 'creada, correo no enviado'
    | 'creada, designación fallida'
    | 'omitida'
    | 'aplicado, cargo de origen sin cerrar'
    | 'aplicado, designación fallida'
    | 'aplicado'
    | 'falló';
  detalle?: string;
  pendientes?: ('reenviar_correo' | 'designar_lider' | 'quitar_sm_origen')[];
}
export interface UserResult {
  nombre: string;
  correo: string;
  rol: string | null;
  equipos: { id: string; nombre: string }[];
  lidera: {
    id: string;
    nombre: string;
    cargo: 'Arquitecto' | 'Scrum Master';
  }[];
}
