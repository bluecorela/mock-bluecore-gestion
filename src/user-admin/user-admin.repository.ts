import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '../supabase/supabase.client';
import { OrganizationRepository } from '../organization/repositories/organization.repository';
import type { EmployeeSummary } from '../organization/interfaces/organization.interface';
import { normalizeEmail } from './user-admin.planner';
import type {
  Person,
  PlanContext,
  UserAdminOperation,
  UserResult,
} from './user-admin.types';

interface EmployeeRow {
  id: string;
  full_name: string;
  email: string;
  status?: string;
}
interface RoleRow {
  employee_id: string;
  roles: { code: string; name: string };
}
interface MembershipRow {
  employee_id: string;
  team_id: string;
  teams: { id: string; name: string };
}
interface AbsenceRow {
  employee_id: string;
}
interface EventRow {
  employee_id: string;
  event_type: string;
  from_team_id: string | null;
  to_team_id: string | null;
}
interface TeamRow {
  id: string;
  code: string;
  name: string;
  status: string;
}
const roleNames: Record<string, string> = {
  ADMIN: 'Admin',
  ARCHITECT: 'Arquitecto',
  SCRUM_MASTER: 'Scrum Master',
  SOFTWARE_ENGINEER: 'Ingeniero de Software',
  QA_ENGINEER: 'Ingeniero de QA',
  WELLBEING_CREATOR: 'Creador de Bienestar',
  INTERN: 'Pasante',
};

@Injectable()
export class UserAdminRepository {
  constructor(
    private readonly supabaseClient: SupabaseClient,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async consumeConfirmation(
    id: string,
    operation: UserAdminOperation,
    employeeId: string | null,
  ): Promise<void> {
    const { error } = await this.supabaseClient
      .getV2Client()
      .from('story_load_confirmations')
      .insert({ id, operation, employee_id: employeeId });
    if (error?.code === '23505')
      throw new BadRequestException(
        'Esta confirmación ya se usó; genera la vista previa de nuevo',
      );
    if (error)
      throw new InternalServerErrorException(
        'No se pudo consumir la confirmación',
      );
  }

  async loadContext(input: {
    emails: string[];
    teamIds: string[];
  }): Promise<PlanContext> {
    const emails = [...new Set(input.emails.map(normalizeEmail))];
    const teamIds = [...new Set(input.teamIds)];
    const database = this.supabaseClient.getV2Client();
    const people = new Map<string, Person>();
    const teams: PlanContext['teams'] = new Map();
    // imatch anclado permite comparar lower(trim()) incluso con datos históricos.
    // El patrón escapa metacaracteres: el correo nunca es una expresión libre.
    const employeeGroups = await Promise.all(
      emails.map(async (email) =>
        this.rows<EmployeeRow>(
          await database
            .from('employees')
            .select('id,full_name,email,status')
            .is('deleted_at', null)
            .filter(
              'email',
              'imatch',
              `^[[:space:]]*${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[[:space:]]*$`,
            ),
          'personas',
        ),
      ),
    );
    const employees = employeeGroups
      .flat()
      .filter((row) => emails.includes(normalizeEmail(row.email)));
    const { persons } = await this.loadPeople(employees);
    const peopleById = new Map(persons.map((person) => [person.id, person]));
    const ambiguousEmails = new Set<string>();
    for (const person of peopleById.values()) {
      if (people.has(person.email)) ambiguousEmails.add(person.email);
      people.set(person.email, person);
    }
    await this.addAuthOnly(
      emails.filter((email) => !people.has(email)),
      people,
    );

    if (teamIds.length) {
      const [teamResult, projectResult] = await Promise.all([
        database
          .from('teams')
          .select('id,code,name,status')
          .in('id', teamIds)
          .is('deleted_at', null),
        database
          .from('team_projects')
          .select('team_id')
          .in('team_id', teamIds)
          .is('ended_at', null),
      ]);
      const teamRows = this.rows<TeamRow>(teamResult, 'equipos');
      const openTeams = new Set(
        this.rows<{ team_id: string }>(
          projectResult,
          'proyectos de equipo',
        ).map((row) => row.team_id),
      );
      // OrganizationModule exporta el repositorio; conserva todos sus filtros de vigencia.
      const teamLeaders = await Promise.all(
        teamRows.map(async (team) => ({
          team,
          leaders: await this.organizationRepository.findTeamLeaders(team.id),
        })),
      );
      // Roles vigentes de los líderes ajenos a la petición, para detectar Admin.
      const others = new Map<string, EmployeeRow>();
      for (const { leaders } of teamLeaders)
        for (const leader of [leaders.architect, leaders.scrumMaster])
          if (leader && !peopleById.has(leader.id))
            others.set(leader.id, {
              id: leader.id,
              full_name: leader.fullName,
              email: leader.email,
            });
      const { persons: leaderPersons } = await this.loadPeople(
        [...others.values()],
        false,
      );
      for (const leader of leaderPersons) peopleById.set(leader.id, leader);
      const leaderPerson = (leader: EmployeeSummary | null) =>
        leader ? (peopleById.get(leader.id) ?? null) : null;
      for (const { team, leaders } of teamLeaders)
        teams.set(team.id, {
          id: team.id,
          code: team.code,
          name: team.name,
          active: team.status === 'active',
          hasOpenProject: openTeams.has(team.id),
          leaders: {
            architect: leaderPerson(leaders.architect),
            scrumMaster: leaderPerson(leaders.scrumMaster),
          },
        });
    }
    return { people, teams, ambiguousEmails };
  }

  async findCurrentScrumMasterId(teamId: string): Promise<string | null> {
    const leaders = await this.organizationRepository.findTeamLeaders(teamId);
    return leaders.scrumMaster?.id ?? null;
  }

  async findUsers(q: {
    texto?: string;
    equipo_id?: string;
  }): Promise<UserResult[]> {
    const database = this.supabaseClient.getV2Client();
    let query = database
      .from('employees')
      .select(
        q.equipo_id
          ? 'id,full_name,email,team_memberships!inner(team_id,is_active)'
          : 'id,full_name,email',
      )
      .is('deleted_at', null);
    if (q.equipo_id)
      query = query
        .eq('team_memberships.team_id', q.equipo_id)
        .eq('team_memberships.is_active', true);
    if (q.texto?.trim()) {
      // Valores entre comillas para no interpolar sintaxis de filtros PostgREST.
      const text = q.texto.trim().replace(/[\\%_*]/g, '\\$&');
      const pattern = JSON.stringify(`%${text}%`);
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    const employees = this.rows<EmployeeRow>(
      await query.order('full_name').order('id').limit(50),
      'personas',
    );
    const { persons, memberships } = await this.loadPeople(employees, false);
    if (!persons.length) return [];
    // Incluye equipos que lidera aunque no sea integrante. La consulta compartida
    // conserva la vigencia de cargos y proyectos abiertos.
    const teams = this.rows<TeamRow>(
      await database
        .from('teams')
        .select('id,code,name,status')
        .is('deleted_at', null),
      'equipos',
    );
    const leaderships = await Promise.all(
      teams.map(async (team) => ({
        team,
        leaders: await this.organizationRepository.findTeamLeaders(team.id),
      })),
    );
    return persons.map((person) => ({
      nombre: person.name,
      correo: person.email,
      rol: person.role,
      lidera: leaderships.flatMap(({ team, leaders }) =>
        (['Arquitecto', 'Scrum Master'] as const).flatMap((cargo) =>
          (cargo === 'Arquitecto' ? leaders.architect : leaders.scrumMaster)
            ?.id === person.id
            ? [{ id: team.id, nombre: team.name, cargo }]
            : [],
        ),
      ),
      equipos: person.teamIds.map((id) => ({
        id,
        nombre: memberships.find((row) => row.team_id === id)?.teams.name ?? id,
      })),
    }));
  }

  async loadLeaderPerson(leader: EmployeeSummary): Promise<Person> {
    const { persons } = await this.loadPeople(
      [{ id: leader.id, full_name: leader.fullName, email: leader.email }],
      false,
    );
    return persons[0];
  }

  private async loadPeople(employees: EmployeeRow[], withMovements = true) {
    if (!employees.length)
      return { persons: [] as Person[], memberships: [] as MembershipRow[] };
    const ids = [...new Set(employees.map((row) => row.id))];
    const database = this.supabaseClient.getV2Client();
    const today = new Date().toISOString().slice(0, 10);
    const [roleResult, membershipResult] = await Promise.all([
      database
        .from('employee_roles')
        .select('employee_id,roles!inner(code,name)')
        .in('employee_id', ids)
        .lte('started_at', today)
        .or(`ended_at.is.null,ended_at.gte.${today}`)
        .order('is_primary', { ascending: false }),
      database
        .from('team_memberships')
        .select('employee_id,team_id,teams!inner(id,name)')
        .in('employee_id', ids)
        .eq('is_active', true)
        .order('started_at', { ascending: false }),
    ]);
    const roles = this.rows<RoleRow>(roleResult, 'roles');
    const memberships = this.rows<MembershipRow>(
      membershipResult,
      'membresías',
    );
    let absences: AbsenceRow[] = [];
    let events: EventRow[] = [];
    if (withMovements) {
      const [absenceResult, eventResult] = await Promise.all([
        database
          .from('employee_absences')
          .select('employee_id')
          .in('employee_id', ids)
          .eq('status', 'active'),
        database
          .from('team_rotation_events')
          .select('employee_id,event_type,from_team_id,to_team_id')
          .in('employee_id', ids)
          .in('event_type', ['assignment', 'unassignment'])
          .lte('effective_at', new Date().toISOString())
          .order('effective_at', { ascending: false })
          .order('id', { ascending: false }),
      ]);
      absences = this.rows<AbsenceRow>(absenceResult, 'ausencias');
      events = this.rows<EventRow>(eventResult, 'coberturas');
    }
    const persons: Person[] = employees.map((employee) => {
      const employeeRoles = roles
        .filter((row) => row.employee_id === employee.id)
        .map((row) => row.roles);
      const primary = employeeRoles[0];
      const teamIds = [
        ...new Set(
          memberships
            .filter((row) => row.employee_id === employee.id)
            .map((row) => row.team_id),
        ),
      ];
      const latestByTeam = new Map<string, string>();
      for (const event of events.filter(
        (row) => row.employee_id === employee.id,
      )) {
        const teamId =
          event.event_type === 'assignment'
            ? event.to_team_id
            : event.from_team_id;
        if (teamId && !latestByTeam.has(teamId))
          latestByTeam.set(teamId, event.event_type);
      }
      return {
        id: employee.id,
        name: employee.full_name,
        email: normalizeEmail(employee.email),
        role: primary ? (roleNames[primary.code] ?? primary.name) : null,
        activeRoleCodes: [...new Set(employeeRoles.map((role) => role.code))],
        teamIds,
        authOnly: false,
        inactive: employee.status !== undefined && employee.status !== 'active',
        onVacationOrCovering:
          absences.some((row) => row.employee_id === employee.id) ||
          teamIds.some((id) => latestByTeam.get(id) === 'assignment'),
      };
    });
    return { persons, memberships };
  }

  private async addAuthOnly(emails: string[], people: Map<string, Person>) {
    const remaining = new Set(emails);
    // shortcut: recorre todo Auth secuencialmente por cada loadContext con correos nuevos;
    // si supera unos miles de usuarios, buscar por correo directo o cachear por petición.
    // Mismo mecanismo que AuthService.findAuthUserByEmail, sin el límite de
    // diez páginas: un alta no debe ignorar duplicados en directorios grandes.
    for (let page = 1; remaining.size; page++) {
      const { data, error } = await this.supabaseClient
        .getClient()
        .auth.admin.listUsers({ page, perPage: 100 });
      if (error)
        throw new InternalServerErrorException('No se pudo consultar Auth');
      for (const user of data.users) {
        if (!user.email) continue;
        const email = normalizeEmail(user.email);
        if (!remaining.delete(email)) continue;
        const metadata: Record<string, unknown> = user.user_metadata;
        people.set(email, {
          id: null,
          email,
          name: typeof metadata.name === 'string' ? metadata.name : email,
          role: typeof metadata.role === 'string' ? metadata.role : null,
          teamIds: [],
          activeRoleCodes: [],
          authOnly: true,
          onVacationOrCovering: false,
        });
      }
      if (data.users.length < 100) break;
    }
  }

  private rows<T>(
    result: { data: unknown; error: unknown },
    entity: string,
  ): T[] {
    if (result.error)
      throw new InternalServerErrorException(`No se pudo cargar ${entity}`);
    return (result.data ?? []) as T[];
  }
}
