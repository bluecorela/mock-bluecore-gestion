import { Injectable } from '@nestjs/common';
import { SupabaseClient } from './supabase.client';
import {
  CreatePersonnelData,
  Team,
  SaveEvaluationRequest,
  MaintenanceStatus,
  SidebarModule,
  Personnel,
  Sprint,
  SprintMember,
  UpdatePersonnelData,
} from './interfaces/supabase-interface';
import { CreatePerformanceEvaluationDto } from '../performance/dto/performance-evaluation.dto';
import { CreateOtoEvaluationDto } from '../oto/dto/create-oto-evaluation.dto';

@Injectable()
export class SupabaseDataService {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');
  }

  private getSprintNumero(sprintId: string): number {
    const parts = String(sprintId).split('-');
    return parts.length > 1 ? parseInt(parts[1], 10) : 0;
  }

  async getTeams(onlyWithEvaluations = false): Promise<Team[]> {
    const database = this.supabaseClient.getV2Client();
    if (onlyWithEvaluations) {
      const { data: metrics, error: metricsError } = await database
        .from('sprint_member_metrics').select('sprint_id');
      if (metricsError) throw metricsError;
      const sprintIds = [...new Set((metrics ?? []).map((metric) => metric.sprint_id))];
      if (!sprintIds.length) return [];
      const { data: sprints, error: sprintsError } = await database
        .from('sprints').select('team_id').in('id', sprintIds);
      if (sprintsError) throw sprintsError;
      const teamIds = [...new Set((sprints ?? []).map((sprint) => sprint.team_id))];
      if (!teamIds.length) return [];
      const { data, error } = await database
        .from('teams')
        .select('code,name')
        .in('id', teamIds)
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((team) => ({ id: team.code, name: team.name }));
    }

    const query = database
      .from('teams')
      .select('code,name')
      .is('deleted_at', null);
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((team) => ({ id: team.code, name: team.name }));
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const { data, error } = await this.supabaseClient.getV2Client()
      .from('teams')
      .select('code,name')
      .ilike('code', teamId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.code, name: data.name } : null;
  }

  async findTeamByName(name: string): Promise<Team | null> {
    const { data, error } = await this.supabaseClient.getV2Client()
      .from('teams')
      .select('code,name')
      .ilike('name', name)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.code, name: data.name } : null;
  }

  async createTeam(name: string): Promise<{ id: string; name: string }> {
    const teamId = this.slug(name);
    const [existingCode, existingName] = await Promise.all([
      this.getTeam(teamId),
      this.findTeamByName(name),
    ]);
    if (existingCode || existingName) throw new Error('Ya existe un equipo con ese nombre');
    const { data, error } = await this.supabaseClient.getV2Client()
      .from('teams')
      .insert({
        code: teamId,
        name,
        status: 'active',
      })
      .select('code,name')
      .single();
    if (error) throw error;
    return { id: data.code, name: data.name };
  }

  async getPersonnel(): Promise<Personnel[]> {
    return this.getV2Personnel();
  }

  async getPersonnelByEmail(email: string) {
    const { data, error } = await this.supabaseClient.getV2Client().from('employees')
      .select('id').ilike('email', email).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return (await this.getV2Personnel([data.id]))[0] ?? null;
  }

  async getPersonnelByAuthUserId(authUserId: string) {
    const { data, error } = await this.supabaseClient.getV2Client().from('employees')
      .select('id').eq('auth_user_id', authUserId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return (await this.getV2Personnel([data.id]))[0] ?? null;
  }

  async getPersonnelAuthUserId(personnelId: string): Promise<string | null> {
    const employee = await this.resolveV2Employee(personnelId);
    const { data, error } = await this.supabaseClient.getV2Client().from('employees')
      .select('auth_user_id').eq('id', employee.id).maybeSingle();
    if (error) throw error;
    return data?.auth_user_id ?? null;
  }

  async getPersonnelById(id: string) {
    try {
      const employee = await this.resolveV2Employee(id);
      return (await this.getV2Personnel([employee.id]))[0] ?? null;
    } catch (error: any) {
      if (String(error?.message ?? '').startsWith('Employee not found:')) return null;
      throw error;
    }
  }

  async getEmployeeByTeam(teamId: string): Promise<Personnel[]> {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const { data: memberships, error } = await database.from('team_memberships')
      .select('employee_id').eq('team_id', team.id).eq('is_active', true);
    if (error) throw error;
    return this.getV2Personnel([...new Set((memberships ?? []).map((row) => row.employee_id))]);
  }

  private async getV2Personnel(employeeIds?: string[]): Promise<Personnel[]> {
    if (employeeIds && !employeeIds.length) return [];
    const database = this.supabaseClient.getV2Client();
    let employeeQuery = database.from('employees').select('*').is('deleted_at', null).order('full_name');
    if (employeeIds) employeeQuery = employeeQuery.in('id', employeeIds);
    const { data: employees, error: employeeError } = await employeeQuery;
    if (employeeError) throw employeeError;
    if (!employees?.length) return [];
    const ids = employees.map((employee) => employee.id);
    const [roleAssignments, memberships, absences] = await Promise.all([
      database.from('employee_roles').select('employee_id,role_id,is_primary,started_at')
        .in('employee_id', ids).is('ended_at', null).order('is_primary', { ascending: false }),
      database.from('team_memberships').select('employee_id,team_id,started_at')
        .in('employee_id', ids).eq('is_active', true).order('started_at', { ascending: false }),
      database.from('employee_absences').select('employee_id,replacement_employee_id')
        .in('employee_id', ids).eq('status', 'active'),
    ]);
    if (roleAssignments.error) throw roleAssignments.error;
    if (memberships.error) throw memberships.error;
    if (absences.error) throw absences.error;
    const roleIds = [...new Set((roleAssignments.data ?? []).map((row) => row.role_id))];
    const teamIds = [...new Set((memberships.data ?? []).map((row) => row.team_id))];
    const [roles, teams] = await Promise.all([
      roleIds.length ? database.from('roles').select('id,code,name').in('id', roleIds) : Promise.resolve({ data: [], error: null }),
      teamIds.length ? database.from('teams').select('id,code,name').in('id', teamIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (roles.error) throw roles.error;
    if (teams.error) throw teams.error;
    const rolesById = new Map((roles.data ?? []).map((role) => [role.id, role] as const));
    const teamsById = new Map((teams.data ?? []).map((team) => [team.id, team] as const));
    const primaryRoleByEmployee = new Map<string, any>();
    for (const assignment of roleAssignments.data ?? []) {
      if (!primaryRoleByEmployee.has(assignment.employee_id)) {
        primaryRoleByEmployee.set(assignment.employee_id, rolesById.get(assignment.role_id));
      }
    }
    const teamByEmployee = new Map<string, any>();
    for (const membership of memberships.data ?? []) {
      if (!teamByEmployee.has(membership.employee_id)) {
        teamByEmployee.set(membership.employee_id, teamsById.get(membership.team_id));
      }
    }
    const vacationingIds = new Set((absences.data ?? []).map((absence) => absence.employee_id));
    const legacyRoles: Record<string, string> = {
      ADMIN: 'Admin', ARCHITECT: 'Arquitecto', SCRUM_MASTER: 'Scrum Master',
      SOFTWARE_ENGINEER: 'Ingeniero de Software', QA_ENGINEER: 'Ingeniero de QA',
      WELLBEING_CREATOR: 'Creador de Bienestar', INTERN: 'Pasante',
    };
    return employees.map((employee) => {
      const role = primaryRoleByEmployee.get(employee.id);
      const team = teamByEmployee.get(employee.id);
      return {
        id: employee.employee_code ?? employee.id,
        name: employee.full_name,
        role: role ? (legacyRoles[role.code] ?? role.name) : null,
        email: employee.email,
        teamId: team?.code ?? null,
        status: employee.status === 'inactive' ? 'inactivo' : 'activo',
        onVacation: vacationingIds.has(employee.id),
        replacementStartSprintId: null,
        team: team ? { id: team.code, path: `teams/${team.code}`, referencePath: `teams/${team.code}` } : null,
      };
    });
  }

  async getVacationingPersonnel(): Promise<Personnel[]> {
    const database = this.supabaseClient.getV2Client();
    const { data: absences, error } = await database.from('employee_absences')
      .select('employee_id,team_id,replacement_employee_id,start_date,end_date')
      .eq('absence_type', 'vacation').eq('status', 'active');
    if (error) throw error;
    if (!absences?.length) return [];
    const employeeIds = [...new Set(absences.map((absence) => absence.employee_id))];
    const teamIds = [...new Set(absences.map((absence) => absence.team_id).filter(Boolean))];
    const [{ data: employees, error: employeeError }, { data: teams, error: teamError }] = await Promise.all([
      database.from('employees').select('id,employee_code,full_name,email,status').in('id', employeeIds),
      teamIds.length
        ? database.from('teams').select('id,code,name').in('id', teamIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (employeeError) throw employeeError;
    if (teamError) throw teamError;
    const employeesById = new Map((employees ?? []).map((employee) => [employee.id, employee] as const));
    const teamsById = new Map((teams ?? []).map((team) => [team.id, team] as const));
    return absences.flatMap((absence): Personnel[] => {
      const employee = employeesById.get(absence.employee_id);
      if (!employee) return [];
      const team = teamsById.get(absence.team_id);
      return [{
        id: employee.employee_code ?? employee.id,
        name: employee.full_name,
        role: null,
        email: employee.email,
        teamId: team?.code ?? null,
        status: employee.status === 'inactive' ? 'inactivo' : 'activo',
        onVacation: true,
        replacementStartSprintId: null,
        team: team ? { id: team.code, path: `teams/${team.code}`, referencePath: `teams/${team.code}` } : null,
      }];
    });
  }

  async createPersonnel(data: CreatePersonnelData): Promise<{ id: string }> {
    const roleCodes: Record<string, string> = {
      Admin: 'ADMIN',
      Arquitecto: 'ARCHITECT',
      'Scrum Master': 'SCRUM_MASTER',
      'Ingeniero de Software': 'SOFTWARE_ENGINEER',
      'Ingeniero de QA': 'QA_ENGINEER',
      'Creador de Bienestar': 'WELLBEING_CREATOR',
      Pasante: 'INTERN',
    };
    const roleCode = roleCodes[data.role];
    if (!roleCode) throw new Error(`Unsupported personnel role: ${data.role}`);
    const { data: id, error } = await this.supabaseClient.getV2Client()
      .rpc('create_employee_with_assignments', {
        p_payload: {
          fullName: data.name,
          email: data.email,
          roleCode,
          teamCode: data.teamId ?? null,
          authUserId: data.authUserId ?? null,
          createdBy: data.createdBy ?? null,
        },
      });
    if (error) throw error;
    return { id: String(id) };
  }

  async updatePersonnel(personnelId: string, data: UpdatePersonnelData) {
    const roleCodes: Record<string, string> = {
      Admin: 'ADMIN',
      Arquitecto: 'ARCHITECT',
      'Scrum Master': 'SCRUM_MASTER',
      'Ingeniero de Software': 'SOFTWARE_ENGINEER',
      'Ingeniero de QA': 'QA_ENGINEER',
      'Creador de Bienestar': 'WELLBEING_CREATOR',
      Pasante: 'INTERN',
    };
    const payload: Record<string, unknown> = { employeeId: personnelId };
    if (data.name !== undefined) payload.fullName = data.name;
    if (data.email !== undefined) payload.email = data.email;
    if (data.status !== undefined) payload.status = data.status === 'inactivo' ? 'inactive' : 'active';
    if (data.teamId !== undefined) payload.teamCode = data.teamId;
    if (data.createdBy !== undefined) payload.createdBy = data.createdBy;
    if (data.role !== undefined) {
      const roleCode = roleCodes[data.role];
      if (!roleCode) throw new Error(`Unsupported personnel role: ${data.role}`);
      payload.roleCode = roleCode;
    }
    const { data: employeeId, error } = await this.supabaseClient.getV2Client()
      .rpc('update_employee_with_assignments', { p_payload: payload });
    if (error) throw error;
    return this.getPersonnelById(String(employeeId));
  }

  async linkPersonnelToAuthUser(personnelId: string, authUserId: string): Promise<void> {
    const employee = await this.resolveV2Employee(personnelId);
    const { error } = await this.supabaseClient.getV2Client().from('employees')
      .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
      .eq('id', employee.id);
    if (error) throw error;
  }

  async getSprintsByTeam(teamId: string): Promise<Sprint[]> {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const { data, error } = await database
      .from('sprints')
      .select('*')
      .eq('team_id', team.id)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((sprint) => this.mapV2Sprint(sprint, team.code));
  }

  async getSprint(teamId: string, sprintId: string): Promise<Sprint | null> {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const sprintNumber = this.getSprintNumero(sprintId);
    let query = database
      .from('sprints')
      .select('*')
      .eq('team_id', team.id);
    query = sprintNumber > 0 ? query.eq('sprint_number', sprintNumber) : query.eq('name', sprintId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? this.mapV2Sprint(data, team.code) : null;
  }

  async getMembersBySprint(teamId: string, sprintId: string): Promise<SprintMember[]> {
    const database = this.supabaseClient.getV2Client();
    const sprint = await this.getSprint(teamId, sprintId);
    if (!sprint) return [];
    const { data: metrics, error } = await database.from('sprint_member_metrics')
      .select('*').eq('sprint_id', sprint.id).order('evaluated_at');
    if (error) throw error;
    if (!metrics?.length) return [];
    const employeeIds = [...new Set(metrics.flatMap((metric) => [metric.employee_id, metric.evaluated_by]).filter(Boolean))];
    const { data: employees, error: employeeError } = await database.from('employees')
      .select('id,employee_code,full_name,email').in('id', employeeIds);
    if (employeeError) throw employeeError;
    const employeesById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    return metrics.map((metric): SprintMember => {
      const employee = employeesById.get(metric.employee_id);
      const evaluator = employeesById.get(metric.evaluated_by);
      return {
        id: metric.id,
        employeeCode: employee?.employee_code ?? this.slug(employee?.full_name ?? metric.employee_id),
        sprint_id: sprint.id,
        team_id: sprint.team_id,
        name: employee?.full_name ?? '',
        assigned_tasks: metric.assigned_tasks,
        delivered_tasks: metric.delivered_tasks,
        returned_tasks: metric.returned_tasks,
        code_quality: metric.code_quality_score,
        total1: metric.component_1_score,
        total2: metric.component_2_score,
        total3: metric.component_3_score,
        total_final: metric.final_score,
        rating: metric.rating,
        comments: metric.comments,
        evaluated_by: evaluator?.email ?? null,
        evaluation_date: metric.evaluated_at,
      };
    });
  }

  private mapV2Sprint(row: any, teamCode: string): Sprint {
    return {
      id: row.id,
      code: row.name || `sprint-${row.sprint_number}`,
      team_id: teamCode,
      start_date: row.start_date,
      end_date: row.end_date,
      sprint_closed: row.status === 'completed',
    };
  }

  async getLegacyMembersBySprint(teamId: string, sprintId: string) {
    const members = await this.getMembersBySprint(teamId, sprintId);
    return members.map((member) => ({
      id: member.employeeCode,
      name: member.name ?? '',
      total1: member.total1 ?? 0,
      total2: member.total2 ?? 0,
      total3: member.total3 ?? 0,
      total_final: member.total_final ?? 0,
      rating: member.rating ?? '',
      comments: member.comments ?? undefined,
    }));
  }

  async getRotationHistory() {
    const database = this.supabaseClient.getV2Client();
    const { data: events, error } = await database.from('team_rotation_events')
      .select('*').order('effective_at', { ascending: false });
    if (error) throw error;
    if (!events?.length) return [];
    const employeeIds = [...new Set(events.map((event) => event.employee_id))];
    const teamIds = [...new Set(events.flatMap((event) => [event.from_team_id, event.to_team_id]).filter(Boolean))];
    const [{ data: employees, error: employeeError }, { data: teams, error: teamError }] = await Promise.all([
      database.from('employees').select('id,employee_code,full_name').in('id', employeeIds),
      database.from('teams').select('id,code,name').in('id', teamIds),
    ]);
    if (employeeError) throw employeeError;
    if (teamError) throw teamError;
    const employeesById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    const teamsById = new Map((teams ?? []).map((team) => [team.id, team]));
    const legacyTypes: Record<string, string> = {
      rotation: 'rotacion', vacation_start: 'vacaciones', vacation_end: 'reintegracion',
      assignment: 'cubriendo-vacaciones', unassignment: 'fin-cobertura-vacaciones',
    };
    return events.map((event) => {
      const employee = employeesById.get(event.employee_id);
      const source = teamsById.get(event.from_team_id);
      const destination = teamsById.get(event.to_team_id);
      return {
        id: event.id,
        date: event.effective_at,
        type: legacyTypes[event.event_type] ?? event.event_type,
        name: employee?.full_name ?? '',
        fromTeam: source?.code ?? null,
        sourceName: source?.name ?? null,
        toTeam: destination?.code ?? null,
        destinationName: destination?.name ?? null,
        personnelId: employee?.employee_code ?? employee?.id ?? event.employee_id,
      };
    });
  }

  async manageEmployeeMovement(input: {
    action: 'rotate' | 'vacation_start' | 'vacation_end';
    personnelId: string;
    sourceTeamId?: string;
    destinationTeamId?: string;
    replacementId?: string;
    createdBy?: string;
  }) {
    const database = this.supabaseClient.getV2Client();
    const employee = await this.resolveV2Employee(input.personnelId);
    const sourceTeam = input.sourceTeamId ? await this.resolveV2Team(input.sourceTeamId) : null;
    const destinationTeam = input.destinationTeamId ? await this.resolveV2Team(input.destinationTeamId) : null;
    const replacement = input.replacementId ? await this.resolveV2Employee(input.replacementId) : null;
    const { data: movementId, error } = await database.rpc('manage_employee_movement', {
      p_action: input.action,
      p_employee_id: employee.id,
      p_source_team_id: sourceTeam?.id ?? null,
      p_destination_team_id: destinationTeam?.id ?? null,
      p_replacement_id: replacement?.id ?? null,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw error;
    return { ok: true, movementId };
  }

  async getModulesByRole(role: string): Promise<SidebarModule[]> {
    const database = this.supabaseClient.getV2Client();
    const roleCodes: Record<string, string> = {
      Admin: 'ADMIN', Arquitecto: 'ARCHITECT', 'Scrum Master': 'SCRUM_MASTER',
      'Ingeniero de Software': 'SOFTWARE_ENGINEER', 'Ingeniero de QA': 'QA_ENGINEER',
      'Ingeniero QA': 'QA_ENGINEER', 'Creador de Bienestar': 'WELLBEING_CREATOR',
      Pasante: 'INTERN',
    };
    const roleCode = roleCodes[role] ?? role.toUpperCase();
    const { data: roleRecord, error: roleError } = await database.from('roles')
      .select('id,code').eq('code', roleCode).maybeSingle();
    if (roleError) throw roleError;
    if (!roleRecord) return [];

    const { data: permissions, error: permissionError } = await database.from('sidebar_module_roles')
      .select('module_id').eq('role_id', roleRecord.id);
    if (permissionError) throw permissionError;
    const moduleIds = (permissions ?? []).map((permission) => permission.module_id);
    if (!moduleIds.length) return [];

    const { data: modules, error } = await database.from('sidebar_modules')
      .select('*').in('id', moduleIds).eq('is_visible', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (modules ?? []).map((moduleItem) => ({
      id: moduleItem.id,
      name: moduleItem.name,
      route: moduleItem.route,
      icon: moduleItem.icon,
      order: moduleItem.display_order,
      visible: moduleItem.is_visible,
      permittedRoles: [role],
    }));
  }

  async getSidebarConfiguration() {
    const database = this.supabaseClient.getV2Client();
    const [{ data: modules, error: moduleError }, { data: assignments, error: assignmentError }, { data: roles, error: roleError }] = await Promise.all([
      database.from('sidebar_modules').select('*').order('display_order'),
      database.from('sidebar_module_roles').select('module_id,role_id'),
      database.from('roles').select('id,code,name').order('name'),
    ]);
    if (moduleError) throw moduleError;
    if (assignmentError) throw assignmentError;
    if (roleError) throw roleError;
    const rolesById = new Map((roles ?? []).map((role) => [role.id, role]));
    const roleCodesByModule = new Map<string, string[]>();
    for (const assignment of assignments ?? []) {
      const role = rolesById.get(assignment.role_id);
      if (!role) continue;
      const codes = roleCodesByModule.get(assignment.module_id) ?? [];
      codes.push(role.code);
      roleCodesByModule.set(assignment.module_id, codes);
    }
    return {
      modules: (modules ?? []).map((moduleItem) => ({
        id: moduleItem.id,
        code: moduleItem.code,
        name: moduleItem.name,
        route: moduleItem.route,
        icon: moduleItem.icon,
        displayOrder: moduleItem.display_order,
        isVisible: moduleItem.is_visible,
        roleCodes: roleCodesByModule.get(moduleItem.id) ?? [],
      })),
      roles: (roles ?? []).map((role) => ({ code: role.code, name: role.name })),
    };
  }

  async saveSidebarModule(input: object) {
    const { data: moduleId, error } = await this.supabaseClient.getV2Client()
      .rpc('save_sidebar_module', { p_payload: input });
    if (error) throw error;
    const configuration = await this.getSidebarConfiguration();
    return configuration.modules.find((moduleItem) => moduleItem.id === moduleId) ?? null;
  }

  async getMaintenanceStatus(): Promise<MaintenanceStatus> {
    const { data, error } = await this.supabaseClient.getV2Client()
      .from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
    if (error) throw error;
    return { active: Boolean(data?.value?.active ?? false) };
  }

  async getPerformanceConfig() {
    return this.getPublishedEvaluationConfig('performance');
  }

  async savePerformanceConfig(data: Record<string, unknown>) {
    return this.saveEvaluationConfig('performance', 'Performance Evaluation', data);
  }

  async getOtoConfig() {
    return this.getPublishedEvaluationConfig('one_to_one');
  }

  async saveOtoConfig(data: Record<string, unknown>) {
    return this.saveEvaluationConfig('one_to_one', 'One-to-One Evaluation', data);
  }

  private async getPublishedEvaluationConfig(type: 'performance' | 'one_to_one') {
    const database = this.supabaseClient.getV2Client();
    const { data: template, error: templateError } = await database
      .from('evaluation_templates')
      .select('id')
      .eq('type', type)
      .eq('is_active', true)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) return null;

    const { data: version, error: versionError } = await database
      .from('evaluation_template_versions')
      .select('configuration')
      .eq('template_id', template.id)
      .not('published_at', 'is', null)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw versionError;
    return version?.configuration ?? null;
  }

  private async saveEvaluationConfig(
    type: 'performance' | 'one_to_one',
    name: string,
    configuration: Record<string, unknown>,
  ) {
    const database = this.supabaseClient.getV2Client();
    const { data: template, error: templateError } = await database
      .from('evaluation_templates')
      .upsert({ type, name, is_active: true }, { onConflict: 'type,name' })
      .select('id')
      .single();
    if (templateError) throw templateError;

    const { data: latest, error: latestError } = await database
      .from('evaluation_template_versions')
      .select('version,configuration')
      .eq('template_id', template.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    if (latest && JSON.stringify(latest.configuration) === JSON.stringify(configuration)) {
      return { ok: true, version: latest.version, created: false };
    }

    const nextVersion = (latest?.version ?? 0) + 1;
    const { error: versionError } = await database
      .from('evaluation_template_versions')
      .insert({
        template_id: template.id,
        version: nextVersion,
        configuration,
        published_at: new Date().toISOString(),
      });
    if (versionError) throw versionError;
    return { ok: true, version: nextVersion, created: true };
  }

  async savePerformanceEvaluation(data: CreatePerformanceEvaluationDto) {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(data.teamId);
    const employee = await this.resolveV2EmployeeByName(data.engineerName);
    const evaluator = await this.resolveV2EmployeeByName(data.evaluatorName);
    const { data: cycle, error: cycleError } = await database.from('performance_cycles')
      .select('id').eq('team_id', team.id).in('status', ['enabled', 'in_progress'])
      .order('period_start', { ascending: false }).limit(1).maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle) throw new Error(`No active performance cycle was found for team ${data.teamId}`);

    const templateVersionId = await this.getLatestTemplateVersion('performance');
    let evaluationNumber = data.evaluationNumber;
    if (!evaluationNumber) {
      const { data: previous, error: previousError } = await database.from('performance_evaluations')
        .select('evaluation_number').eq('team_id', team.id).eq('employee_id', employee.id)
        .order('evaluation_number', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw previousError;
      evaluationNumber = (previous?.evaluation_number ?? 0) + 1;
    }

    const { data: evaluationId, error } = await database.rpc('save_performance_evaluation', {
      p_payload: {
        cycleId: cycle.id,
        teamId: team.id,
        employeeId: employee.id,
        evaluatorId: evaluator.id,
        templateVersionId,
        evaluationNumber,
        period: data.period,
        answers: data.answers,
        achievements: data.achievements,
        growthPotential: data.growthPotential,
        additionalObservations: data.additionalObservations,
        feedbackConfirmed: data.feedbackConfirmed,
      },
    });
    if (error) throw error;
    return { ok: true, evaluationId, evaluationNumber };
  }

  async getPerformanceHistory(teamId: string) {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const { data: evaluations, error } = await database.from('performance_evaluations')
      .select('*').eq('team_id', team.id).order('evaluated_at', { ascending: true });
    if (error) throw error;
    if (!evaluations?.length) return [];

    const employeeIds = [...new Set(evaluations.flatMap((row) => [row.employee_id, row.evaluator_id]))];
    const evaluationIds = evaluations.map((row) => row.id);
    const [{ data: employees, error: employeeError }, { data: answers, error: answerError }] = await Promise.all([
      database.from('employees').select('id,full_name').in('id', employeeIds),
      database.from('performance_answers').select('*').in('evaluation_id', evaluationIds),
    ]);
    if (employeeError) throw employeeError;
    if (answerError) throw answerError;
    const names = new Map((employees ?? []).map((row) => [row.id, row.full_name]));
    const answersByEvaluation = new Map<string, Record<string, { score: number; comment: string }>>();
    for (const answer of answers ?? []) {
      const current = answersByEvaluation.get(answer.evaluation_id) ?? {};
      current[answer.question_key] = { score: Number(answer.score), comment: answer.comment ?? '' };
      answersByEvaluation.set(answer.evaluation_id, current);
    }
    return evaluations.map((row) => ({
      id: row.id,
      teamId: team.code,
      employeeId: row.employee_id,
      evaluationNumber: row.evaluation_number,
      engineerName: names.get(row.employee_id) ?? '',
      evaluatorName: names.get(row.evaluator_id) ?? '',
      period: row.period,
      answers: answersByEvaluation.get(row.id) ?? {},
      achievements: row.achievements,
      growthPotential: row.growth_potential,
      additionalObservations: row.additional_observations,
      feedbackConfirmed: row.feedback_confirmed,
      date: row.evaluated_at,
    }));
  }

  async saveOtoEvaluation(data: CreateOtoEvaluationDto) {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(data.teamId);
    const employee = await this.resolveV2EmployeeByName(data.engineerName);
    const evaluator = await this.resolveV2EmployeeByName(data.evaluatorName);
    const templateVersionId = await this.getLatestTemplateVersion('one_to_one');
    const sprintNumbers = [...data.period.matchAll(/Sprint\s+(\d+)/gi)].map((match) => Number(match[1]));
    let sprintFromId: string | null = null;
    let sprintToId: string | null = null;
    if (sprintNumbers.length >= 2) {
      const { data: sprints, error: sprintError } = await database.from('sprints')
        .select('id,sprint_number').eq('team_id', team.id)
        .in('sprint_number', [sprintNumbers[0], sprintNumbers[1]]);
      if (sprintError) throw sprintError;
      const sprintByNumber = new Map((sprints ?? []).map((sprint) => [sprint.sprint_number, sprint.id]));
      sprintFromId = sprintByNumber.get(sprintNumbers[0]) ?? null;
      sprintToId = sprintByNumber.get(sprintNumbers[1]) ?? null;
      if (!sprintFromId || !sprintToId) {
        throw new Error(`Sprint range not found for team ${data.teamId}: ${data.period}`);
      }
    }

    let evaluationNumber = data.evaluationNumber;
    if (!evaluationNumber) {
      const { data: previous, error: previousError } = await database.from('one_to_one_sessions')
        .select('evaluation_number').eq('team_id', team.id).eq('employee_id', employee.id)
        .order('evaluation_number', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw previousError;
      evaluationNumber = (previous?.evaluation_number ?? 0) + 1;
    }

    const { data: session, error } = await database.from('one_to_one_sessions').insert({
      team_id: team.id,
      employee_id: employee.id,
      evaluator_id: evaluator.id,
      template_version_id: templateVersionId,
      sprint_from_id: sprintFromId,
      sprint_to_id: sprintToId,
      evaluation_number: evaluationNumber,
      period: data.period,
      summary: data.summary,
      final_synthesis: data.finalSummary,
      reflection_answers: data.reflectionQuestions,
      soft_skill_answers: data.softSkills,
    }).select('id').single();
    if (error) throw error;
    return { ok: true, sessionId: session.id, evaluationNumber };
  }

  async getOtoHistory(teamId: string) {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const { data: sessions, error } = await database.from('one_to_one_sessions')
      .select('*').eq('team_id', team.id).order('evaluated_at', { ascending: true });
    if (error) throw error;
    if (!sessions?.length) return [];
    const employeeIds = [...new Set(sessions.flatMap((row) => [row.employee_id, row.evaluator_id]))];
    const { data: employees, error: employeeError } = await database.from('employees')
      .select('id,full_name').in('id', employeeIds);
    if (employeeError) throw employeeError;
    const names = new Map((employees ?? []).map((row) => [row.id, row.full_name]));

    return sessions.map((row) => ({
      id: row.id,
      teamId: team.code,
      employeeId: row.employee_id,
      evaluationNumber: row.evaluation_number,
      engineerName: names.get(row.employee_id) ?? '',
      evaluatorName: names.get(row.evaluator_id) ?? '',
      period: row.period,
      summary: row.summary,
      finalSummary: row.final_synthesis,
      reflectionQuestions: row.reflection_answers,
      softSkills: row.soft_skill_answers,
      date: row.evaluated_at,
    }));
  }

  private async resolveV2Team(teamIdOrName: string) {
    const { data, error } = await this.supabaseClient.getV2Client().from('teams')
      .select('id,code,name').or(`code.eq.${teamIdOrName},name.eq.${teamIdOrName}`)
      .is('deleted_at', null).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Team not found: ${teamIdOrName}`);
    return data;
  }

  private async resolveV2EmployeeByName(fullName: string) {
    const { data, error } = await this.supabaseClient.getV2Client().from('employees')
      .select('id,full_name').ilike('full_name', fullName).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Employee not found: ${fullName}`);
    return data;
  }

  private async resolveV2Employee(identifier: string) {
    const database = this.supabaseClient.getV2Client();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
    const query = database.from('employees').select('id,employee_code,full_name')
      .is('deleted_at', null).limit(1);
    const { data, error } = isUuid
      ? await query.eq('id', identifier).maybeSingle()
      : await query.eq('employee_code', identifier).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Employee not found: ${identifier}`);
    return data;
  }

  private async getLatestTemplateVersion(type: 'performance' | 'one_to_one') {
    const database = this.supabaseClient.getV2Client();
    const { data: template, error: templateError } = await database.from('evaluation_templates')
      .select('id').eq('type', type).eq('is_active', true).maybeSingle();
    if (templateError) throw templateError;
    if (!template) throw new Error(`Active evaluation template not found: ${type}`);
    const { data: version, error: versionError } = await database.from('evaluation_template_versions')
      .select('id').eq('template_id', template.id).not('published_at', 'is', null)
      .order('version', { ascending: false }).limit(1).maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw new Error(`Published evaluation template version not found: ${type}`);
    return version.id;
  }

  async enablePerformance(teamId: string, adminName: string) {
    const existente = await this.getActiveEnablement(teamId);
    if (existente) return existente;
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const administrator = await this.resolveV2EmployeeByName(adminName);
    const [{ data: memberships, error: membershipError }, { data: excludedRoles, error: roleError }] = await Promise.all([
      database.from('team_memberships').select('employee_id,role_id')
        .eq('team_id', team.id).eq('is_active', true),
      database.from('roles').select('id').in('code', ['ADMIN', 'ARCHITECT']),
    ]);
    if (membershipError) throw membershipError;
    if (roleError) throw roleError;
    const excludedRoleIds = new Set((excludedRoles ?? []).map((role) => role.id));
    const expectedEmployees = new Set(
      (memberships ?? []).filter((membership) => !excludedRoleIds.has(membership.role_id))
        .map((membership) => membership.employee_id),
    );
    const enabledAt = new Date().toISOString();
    const { data: cycle, error } = await database.from('performance_cycles').insert({
      team_id: team.id,
      name: `Performance Cycle ${enabledAt}`,
      period_start: enabledAt.slice(0, 10),
      period_end: null,
      status: 'enabled',
      expected_evaluations: expectedEmployees.size,
      completed_evaluations: 0,
      enabled_by: administrator.id,
    }).select('*').single();
    if (error) throw error;
    return this.mapV2Enablement(cycle, team, administrator);
  }

  async getPerformanceEnablements(teamId?: string) {
    const database = this.supabaseClient.getV2Client();
    const selectedTeam = teamId ? await this.resolveV2Team(teamId) : null;
    let query = database.from('performance_cycles').select('*').order('created_at', { ascending: false });
    if (selectedTeam) query = query.eq('team_id', selectedTeam.id);
    const { data: cycles, error } = await query;
    if (error) throw error;
    if (!cycles?.length) return [];

    const teamIds = [...new Set(cycles.map((cycle) => cycle.team_id))];
    const adminIds = [...new Set(cycles.map((cycle) => cycle.enabled_by).filter(Boolean))];
    const [{ data: teams, error: teamError }, { data: administrators, error: adminError }] = await Promise.all([
      database.from('teams').select('id,code,name').in('id', teamIds),
      adminIds.length
        ? database.from('employees').select('id,full_name').in('id', adminIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (teamError) throw teamError;
    if (adminError) throw adminError;
    const teamsById = new Map((teams ?? []).map((team) => [team.id, team]));
    const adminsById = new Map((administrators ?? []).map((employee) => [employee.id, employee] as const));
    return cycles.map((cycle) => this.mapV2Enablement(
      cycle,
      teamsById.get(cycle.team_id),
      adminsById.get(cycle.enabled_by),
    ));
  }

  async getActiveEnablement(teamId: string) {
    const database = this.supabaseClient.getV2Client();
    const team = await this.resolveV2Team(teamId);
    const { data: cycle, error } = await database.from('performance_cycles').select('*')
      .eq('team_id', team.id).in('status', ['enabled', 'in_progress'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!cycle) return null;
    const administrator = cycle.enabled_by
      ? await database.from('employees').select('id,full_name').eq('id', cycle.enabled_by).maybeSingle()
      : { data: null, error: null };
    if (administrator.error) throw administrator.error;
    return this.mapV2Enablement(cycle, team, administrator.data);
  }

  private mapV2Enablement(row: any, team: any, administrator: any) {
    const status: Record<string, string> = {
      draft: 'Pendiente', enabled: 'Pendiente', in_progress: 'En proceso',
      completed: 'Completado', cancelled: 'Cancelado',
    };
    return {
      id: row.id,
      teamId: team?.code ?? row.team_id,
      teamName: team?.name ?? row.team_id,
      adminName: administrator?.full_name ?? '',
      enabledAt: row.created_at,
      status: status[row.status] ?? row.status,
      evaluatedCount: row.completed_evaluations,
      totalExpected: row.expected_evaluations,
      lastUpdate: row.updated_at,
    };
  }

  async getMetrics(teamId: string, sprintId: string) {
    const members = await this.getMembersBySprint(teamId, sprintId);
    const sprint = await this.getSprint(teamId, sprintId);

    const summary = members
      .filter((member) => member.rating !== 'Arquitecto')
      .map((member) => ({
        name: member.name,
        total1: member.total1,
        total2: member.total2,
        total3: member.total3,
        totalFinal: `${member.total_final}% (${member.rating})`,
        comments: member.comments ?? '—',
      }));

    return {
      startDate: sprint?.start_date ? this.formatDate(sprint.start_date) : '',
      endDate: sprint?.end_date ? this.formatDate(sprint.end_date) : '',
      summary,
    };
  }

  private formatDate(dateValue: string): string {
    const dateOnly = dateValue.slice(0, 10);
    return new Date(`${dateOnly}T00:00:00.000Z`).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  async getSprintEvaluationStatus(teamId: string, specificSprintId?: string) {
    const sprints = await this.getSprintsByTeam(teamId);
    let activeSprint = specificSprintId
      ? sprints.find((s) => s.code === specificSprintId)
      : sprints
        .filter((s) => s.sprint_closed !== true)
        .sort((a, b) => this.getSprintNumero(a.code) - this.getSprintNumero(b.code))[0];

    const maxSprintNum = sprints.reduce((max, sprint) => Math.max(max, this.getSprintNumero(sprint.code)), 0);
    const sprintNumber = activeSprint ? this.getSprintNumero(activeSprint.code) : maxSprintNum + 1;
    const sprintId = activeSprint ? activeSprint.code : `sprint-${sprintNumber}`;
    const rawEvaluatedMembers = await this.getMembersBySprint(teamId, sprintId);
    const evaluatedNames = rawEvaluatedMembers.map((e) => String(e.name || '').toLowerCase().trim());
    const employee = await this.getEmployeeByTeam(teamId);
    const teamMembers = employee
      .filter((p) => {
        const role = String(p.role || '').toLowerCase().trim();
        const onVacation = p.onVacation === true;
        const name = String(p.name || '').toLowerCase().trim();
        const alreadyEvaluated = evaluatedNames.includes(name);
        const isArchitect = role === 'arquitecto';
        const replacementStart = p.replacementStartSprintId
          ? this.getSprintNumero(p.replacementStartSprintId)
          : 0;

        return !alreadyEvaluated && !isArchitect && !onVacation && replacementStart <= sprintNumber;
      })
      .map((p) => ({
        name: p.name,
        role: p.role,
        onVacation: p.onVacation ?? false,
        replacementStartSprintId: p.replacementStartSprintId ?? null,
      }));

    const dates = { startDate: '', endDate: '' };
    if (activeSprint) {
      dates.startDate = activeSprint.start_date ? activeSprint.start_date.split('T')[0] : '';
      dates.endDate = activeSprint.end_date ? activeSprint.end_date.split('T')[0] : '';
    } else {
      const hoy = new Date();
      const diaSemana = hoy.getDay();
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
      const viernes = new Date(lunes);
      viernes.setDate(lunes.getDate() + 4);
      dates.startDate = lunes.toISOString().split('T')[0];
      dates.endDate = viernes.toISOString().split('T')[0];
    }

    return {
      sprintId,
      sprintNumber,
      teamMembers,
      dates,
      datesSaved: !!activeSprint,
      sprintClosed: activeSprint ? activeSprint.sprint_closed === true : false,
    };
  }

  async saveEvaluation(data: SaveEvaluationRequest) {
    const engineerName = data.engineer.split(' – ')[0];
    const sprintNumber = this.getSprintNumero(data.sprintId);
    if (!Number.isInteger(sprintNumber) || sprintNumber <= 0) {
      throw new Error(`Invalid sprint ID: ${data.sprintId}`);
    }
    const { data: result, error } = await this.supabaseClient.getV2Client()
      .rpc('save_sprint_evaluation', {
        p_payload: {
          teamCode: data.teamId,
          sprintId: data.sprintId,
          sprintNumber,
          startDate: data.startDate,
          endDate: data.endDate,
          employeeName: engineerName,
          evaluatorEmail: data.evaluatorEmail,
          metrics: data.metrics ?? {},
          finalScore: data.finalScore,
          ratingLabel: data.ratingLabel,
          comments: data.comments ?? null,
        },
      });
    if (error) throw error;
    const nextState = await this.getSprintEvaluationStatus(data.teamId);
    return {
      ok: true,
      sprintClosed: result?.sprintClosed === true,
      evaluatedMembers: result?.evaluatedMembers ?? 0,
      expectedMembers: result?.expectedMembers ?? 0,
      nextState,
    };
  }
}
