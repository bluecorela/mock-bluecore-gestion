import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';
import {
  Client,
  Project,
  SaveClientData,
  SaveProjectData,
  SaveTeamProjectMembershipData,
  TeamProjectMember,
  TeamOrganization,
  Team,
  EmployeeSummary,
  Role,
} from './interfaces/organization.interface';

interface TeamProjectAssignmentRow {
  id: string;
  team_id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  is_primary: boolean;
}

interface EmployeeRow {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string;
}

interface RoleRow {
  id: string;
  code: string;
  name: string;
}

interface TeamProjectMembershipRow {
  id: string;
  team_project_id: string;
  employee_id: string;
  role_id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
}

@Injectable()
export class OrganizationRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findClients(): Promise<Client[]> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('clients')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) this.throwDatabaseError('clients', error);
    return (data ?? []).map((row) => this.mapClient(row));
  }

  async findProjects(clientId?: string): Promise<Project[]> {
    let query = this.supabaseClient
      .getV2Client()
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (clientId) query = query.eq('client_id', clientId);

    const { data, error } = await query;
    if (error) this.throwDatabaseError('projects', error);
    return (data ?? []).map((row) => this.mapProject(row));
  }

  async findClientById(clientId: string): Promise<Client | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) this.throwDatabaseError('client', error);
    return data ? this.mapClient(data) : null;
  }

  async createClient(input: SaveClientData): Promise<Client> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('clients')
      .insert({
        code: input.code,
        name: input.name,
        status: input.status ?? 'active',
      })
      .select('*')
      .single();

    if (error) this.throwMutationError('client', error);
    return this.mapClient(data);
  }

  async updateClient(
    clientId: string,
    input: Partial<SaveClientData>,
  ): Promise<Client | null> {
    const updates: Record<string, unknown> = {};
    if (input.code !== undefined) updates.code = input.code;
    if (input.name !== undefined) updates.name = input.name;
    if (input.status !== undefined) updates.status = input.status;

    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('clients')
      .update(updates)
      .eq('id', clientId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) this.throwMutationError('client', error);
    return data ? this.mapClient(data) : null;
  }

  async findProjectById(projectId: string): Promise<Project | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) this.throwDatabaseError('project', error);
    return data ? this.mapProject(data) : null;
  }

  async createProject(input: SaveProjectData): Promise<Project> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('projects')
      .insert({
        client_id: input.clientId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        status: input.status ?? 'planned',
        start_date: input.startDate ?? null,
        planned_end_date: input.plannedEndDate ?? null,
        actual_end_date: input.actualEndDate ?? null,
      })
      .select('*')
      .single();
    if (error) this.throwMutationError('project', error);
    return this.mapProject(data);
  }

  async updateProject(
    projectId: string,
    input: Partial<SaveProjectData>,
  ): Promise<Project | null> {
    const updates: Record<string, unknown> = {};
    if (input.clientId !== undefined) updates.client_id = input.clientId;
    if (input.code !== undefined) updates.code = input.code;
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.startDate !== undefined) updates.start_date = input.startDate;
    if (input.plannedEndDate !== undefined)
      updates.planned_end_date = input.plannedEndDate;
    if (input.actualEndDate !== undefined)
      updates.actual_end_date = input.actualEndDate;

    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) this.throwMutationError('project', error);
    return data ? this.mapProject(data) : null;
  }

  async findTeams(): Promise<Team[]> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('teams')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) this.throwDatabaseError('teams', error);
    return (data ?? []).map((row) => this.mapTeam(row));
  }

  async findEmployees(teamId?: string): Promise<EmployeeSummary[]> {
    const database = this.supabaseClient.getV2Client();
    let employeeIds: string[] | undefined;
    if (teamId) {
      const { data: memberships, error: membershipsError } = await database
        .from('team_memberships')
        .select('employee_id')
        .eq('team_id', teamId)
        .eq('is_active', true);
      if (membershipsError)
        this.throwDatabaseError('team memberships', membershipsError);
      employeeIds = [
        ...new Set((memberships ?? []).map((row) => row.employee_id)),
      ];
      if (!employeeIds.length) return [];
    }

    let query = database
      .from('employees')
      .select('id,employee_code,full_name,email')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('full_name');
    if (employeeIds) query = query.in('id', employeeIds);
    const { data, error } = await query;
    if (error) this.throwDatabaseError('employees', error);
    return (data ?? []).map((row) => this.mapEmployee(row));
  }

  async findRoles(): Promise<Role[]> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('roles')
      .select('id,code,name')
      .order('name');
    if (error) this.throwDatabaseError('roles', error);
    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
    }));
  }

  async findTeamOrganization(teamId: string): Promise<TeamOrganization | null> {
    const database = this.supabaseClient.getV2Client();
    const { data: teamRow, error: teamError } = await database
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .is('deleted_at', null)
      .maybeSingle();

    if (teamError) this.throwDatabaseError('team', teamError);
    if (!teamRow) return null;

    const { data: assignmentRows, error: assignmentError } = await database
      .from('team_projects')
      .select('id,project_id,is_primary,started_at,ended_at')
      .eq('team_id', teamId)
      .order('is_primary', { ascending: false });
    if (assignmentError)
      this.throwDatabaseError('team project assignments', assignmentError);

    const assignments = (assignmentRows ?? []) as TeamProjectAssignmentRow[];
    const projectIds = assignments.map((row) => row.project_id);
    if (!projectIds.length)
      return { team: this.mapTeam(teamRow), assignments: [] };

    const { data: projectRows, error: projectsError } = await database
      .from('projects')
      .select('*')
      .in('id', projectIds)
      .is('deleted_at', null);
    if (projectsError) this.throwDatabaseError('projects', projectsError);

    const clientIds = [
      ...new Set((projectRows ?? []).map((row) => row.client_id)),
    ];
    const { data: clientRows, error: clientsError } = await database
      .from('clients')
      .select('*')
      .in('id', clientIds)
      .is('deleted_at', null);
    if (clientsError) this.throwDatabaseError('clients', clientsError);

    const projectsById = new Map(
      (projectRows ?? []).map((row) => [row.id, this.mapProject(row)]),
    );
    const clientsById = new Map(
      (clientRows ?? []).map((row) => [row.id, this.mapClient(row)]),
    );
    const assignmentIds = assignments.map((row) => row.id);
    const { data: memberRows, error: membersError } = await database
      .from('team_project_memberships')
      .select('*')
      .in('team_project_id', assignmentIds)
      .order('started_at', { ascending: false });
    if (membersError)
      this.throwDatabaseError('team project members', membersError);

    const employeeIds = [
      ...new Set((memberRows ?? []).map((row) => row.employee_id)),
    ];
    const roleIds = [...new Set((memberRows ?? []).map((row) => row.role_id))];
    const employeesResult = employeeIds.length
      ? await database
          .from('employees')
          .select('id,employee_code,full_name,email')
          .in('id', employeeIds)
      : { data: [], error: null };
    if (employeesResult.error)
      this.throwDatabaseError('employees', employeesResult.error);
    const rolesResult = roleIds.length
      ? await database.from('roles').select('id,code,name').in('id', roleIds)
      : { data: [], error: null };
    if (rolesResult.error) this.throwDatabaseError('roles', rolesResult.error);
    const employeeRows = (employeesResult.data ?? []) as EmployeeRow[];
    const roleRows = (rolesResult.data ?? []) as RoleRow[];
    const memberships = (memberRows ?? []) as TeamProjectMembershipRow[];
    const employeesById = new Map(
      employeeRows.map((row) => [row.id, row] as const),
    );
    const rolesById = new Map(roleRows.map((row) => [row.id, row] as const));
    const membersByAssignment = new Map<string, TeamProjectMember[]>();
    for (const row of memberships) {
      const employee = employeesById.get(row.employee_id);
      const role = rolesById.get(row.role_id);
      if (!employee || !role) continue;
      const members = membersByAssignment.get(row.team_project_id) ?? [];
      members.push(this.mapTeamProjectMember(row, employee, role));
      membersByAssignment.set(row.team_project_id, members);
    }

    return {
      team: this.mapTeam(teamRow),
      assignments: assignments.flatMap((assignment) => {
        const project = projectsById.get(assignment.project_id);
        const client = project ? clientsById.get(project.clientId) : null;
        if (!project || !client) return [];
        return [
          {
            id: assignment.id,
            isPrimary: assignment.is_primary,
            startedAt: assignment.started_at,
            endedAt: assignment.ended_at,
            project: { ...project, client },
            members: membersByAssignment.get(assignment.id) ?? [],
          },
        ];
      }),
    };
  }

  async findTeamProjectAssignment(
    teamId: string,
    assignmentId: string,
  ): Promise<TeamProjectAssignmentRow | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('team_projects')
      .select('*')
      .eq('id', assignmentId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) this.throwDatabaseError('team project assignment', error);
    return data as TeamProjectAssignmentRow | null;
  }

  async findEmployeeById(employeeId: string): Promise<EmployeeRow | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) this.throwDatabaseError('employee', error);
    return data as EmployeeRow | null;
  }

  async findRoleById(roleId: string): Promise<RoleRow | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .maybeSingle();
    if (error) this.throwDatabaseError('role', error);
    return data as RoleRow | null;
  }

  async createTeamProjectMembership(
    input: SaveTeamProjectMembershipData,
  ): Promise<TeamProjectMember> {
    const database = this.supabaseClient.getV2Client();
    const { data, error } = await database
      .from('team_project_memberships')
      .insert({
        team_project_id: input.teamProjectId,
        employee_id: input.employeeId,
        role_id: input.roleId,
        started_at: input.startedAt,
        created_by: input.createdBy,
      })
      .select('*')
      .single();
    if (error) this.throwMutationError('team project membership', error);
    const [employee, role] = await Promise.all([
      this.findEmployeeById(input.employeeId),
      this.findRoleById(input.roleId),
    ]);
    if (!employee || !role) {
      throw new InternalServerErrorException(
        'Could not load the employee or role for the new membership',
      );
    }
    return this.mapTeamProjectMember(
      data as TeamProjectMembershipRow,
      employee,
      role,
    );
  }

  async findTeamProjectMembership(
    assignmentId: string,
    membershipId: string,
  ): Promise<TeamProjectMembershipRow | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('team_project_memberships')
      .select('*')
      .eq('id', membershipId)
      .eq('team_project_id', assignmentId)
      .maybeSingle();
    if (error) this.throwDatabaseError('team project membership', error);
    return data as TeamProjectMembershipRow | null;
  }

  async endTeamProjectMembership(
    membershipId: string,
    endedAt: string,
  ): Promise<void> {
    const { error } = await this.supabaseClient
      .getV2Client()
      .from('team_project_memberships')
      .update({ ended_at: endedAt, is_active: false })
      .eq('id', membershipId);
    if (error) this.throwMutationError('team project membership', error);
  }

  private mapClient(row: any): Client {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapProject(row: any): Project {
    return {
      id: row.id,
      clientId: row.client_id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      startDate: row.start_date,
      plannedEndDate: row.planned_end_date,
      actualEndDate: row.actual_end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapTeam(row: any): Team {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapTeamProjectMember(
    row: TeamProjectMembershipRow,
    employee: EmployeeRow,
    role: RoleRow,
  ): TeamProjectMember {
    return {
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      isActive: row.is_active,
      employee: {
        ...this.mapEmployee(employee),
      },
      role: { id: role.id, code: role.code, name: role.name },
    };
  }

  private mapEmployee(row: EmployeeRow): EmployeeSummary {
    return {
      id: row.id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      email: row.email,
    };
  }

  private throwDatabaseError(
    resource: string,
    error: { message?: string },
  ): never {
    throw new InternalServerErrorException(
      `Could not read ${resource} from the v2 database: ${error.message || 'unknown error'}`,
    );
  }

  private throwMutationError(
    resource: string,
    error: { code?: string; message?: string },
  ): never {
    if (error.code === '23505') {
      throw new ConflictException(
        `A ${resource} with the same unique value already exists`,
      );
    }
    this.throwDatabaseError(resource, error);
  }
}
