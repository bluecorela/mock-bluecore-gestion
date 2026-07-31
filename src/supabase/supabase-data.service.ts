import { Injectable } from '@nestjs/common';
import { SupabaseClient } from './supabase.client';
import {
  CreatePersonnelData,
  Team,
  SaveEvaluationRequest,
  RotationHistoryRow,
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

  private client() {
    return this.supabaseClient.getClient();
  }

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');
  }

  private sprintPrimaryId(teamId: string, sprintId: string): string {
    return `${teamId}__${sprintId}`;
  }

  private getSprintNumero(sprintId: string): number {
    const parts = String(sprintId).split('-');
    return parts.length > 1 ? parseInt(parts[1], 10) : 0;
  }

  private mapPersonnel(row: any): Personnel | null {
    if (!row) return null;

    return {
      id: row.id,
      name: row.full_name ?? null,
      role: row.rol ?? null,
      email: row.email ?? null,
      teamId: row.team_id ?? null,
      status: row.estatus ?? null,
      onVacation: row.on_vacations ?? null,
      replacementStartSprintId: row.start_sprint_replacement_id,
      team: row.team_id ? {
        id: row.team_id,
        path: `teams/${row.team_id}`,
        referencePath: `teams/${row.team_id}`,
      } : null,
      firebase_path: row.firebase_path,
      raw_data: row.raw_data,
    };
  }

  private mapSprintMember(row: any): SprintMember {
    return {
      id: row.id,
      firebase_id: row.firebase_id,
      sprint_id: row.sprint_id,
      team_id: row.team_id,
      name: row.employee_name ?? '',
      total1: row.total1 ?? 0,
      total2: row.total2 ?? 0,
      total3: row.total3 ?? 0,
      total_final: row.total_final ?? 0,
      rating: row.qualification ?? '',
      comments: row.comments ?? null,
      assigned_tasks: row.assigned_tasks ?? null,
      delivered_tasks: row.delivered_tasks ?? null,
      returned_tasks: row.returned_tasks ?? null,
      code_quality: row.code_quality ?? null,
      evaluated_by: row.evaluated_by ?? null,
      evaluation_date: row.evaluation_date ?? null,
      firebase_path: row.firebase_path,
      raw_data: row.raw_data,
    };
  }

  private mapHistory(row: RotationHistoryRow) {
    return {
      id: row.id,
      date: row.date,
      type: row.type,
      name: row.employee_name,
      fromTeam: row.from_team,
      sourceName: row.from_name_team,
      toTeam: row.to_team,
      destinationName: row.to_name_team,
      personnelId: row.employee_id,
    };
  }

  async getTeams(onlyWithEvaluations = false): Promise<Team[]> {
    if (onlyWithEvaluations) {
      const { data: members, error: membersError } = await this.client()
        .from('sprint_members')
        .select('team_id');

      if (membersError) {
        throw membersError;
      }

      const teamIds = [...new Set((members ?? []).map((member) => member.team_id))];

      if (!teamIds.length) {
        return [];
      }

      const { data, error } = await this.client()
        .from('teams')
        .select('id, name:name')
        .in('id', teamIds)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    }

    const query = this.client()
      .from('teams')
      .select('id, name:name');

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const { data, error } = await this.client()
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? { ...data, name: data.name } : null;
  }

  async findTeamByName(name: string): Promise<Team | null> {
    const { data, error } = await this.client()
      .from('teams')
      .select('*')
      .eq('name', name)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? { ...data, name: data.name } : null;
  }

  async createTeam(name: string): Promise<{ id: string; name: string }> {
    const teamId = this.slug(name);
    const existing = await this.getTeam(teamId);

    if (existing) {
      throw new Error('Ya existe un equipo con ese nombre');
    }

    const { error } = await this.client()
      .from('teams')
      .insert({
        id: teamId,
        name: name,
        raw_data: { name },
      });

    if (error) {
      throw error;
    }

    return { id: teamId, name };
  }

  async getPersonnel(): Promise<Personnel[]> {
    const { data, error } = await this.client()
      .from('employees')
      .select('*');

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapPersonnel(row) as Personnel);
  }

  async getPersonnelByEmail(email: string) {
    const { data, error } = await this.client()
      .from('employees')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return this.mapPersonnel(data);
  }

  async getPersonnelById(id: string) {
    const { data, error } = await this.client()
      .from('employees')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return this.mapPersonnel(data);
  }

  async getEmployeeByTeam(teamId: string): Promise<Personnel[]> {
    const { data, error } = await this.client()
      .from('employees')
      .select('*')
      .eq('team_id', teamId);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapPersonnel(row) as Personnel);
  }

  async getVacationingPersonnel(): Promise<Personnel[]> {
    const { data, error } = await this.client()
      .from('employees')
      .select('*')
      .eq('on_vacations', true);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapPersonnel(row) as Personnel);
  }

  async createPersonnel(data: CreatePersonnelData): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const row = {
      id,
      full_name: data.name,
      rol: data.role,
      email: data.email ?? null,
      team_id: data.teamId ?? null,
      estatus: data.status ?? 'activo',
      raw_data: {
        name: data.name,
        role: data.role,
        email: data.email,
        teamId: data.teamId,
        status: data.status ?? 'activo',
      },
    };

    const { error } = await this.client().from('employees').insert(row);

    if (error) {
      throw error;
    }

    return { id };
  }

  async updatePersonnel(personnelId: string, data: UpdatePersonnelData) {
    const current = await this.getPersonnelById(personnelId);

    if (!current) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      raw_data: {
        ...(current.raw_data ?? {}),
        ...data,
      },
    };

    if (data.name !== undefined) updateData.full_name = data.name;
    if (data.role !== undefined) updateData.rol = data.role;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.teamId !== undefined) updateData.team_id = data.teamId;
    if (data.status !== undefined) updateData.estatus = data.status;

    const { data: updated, error } = await this.client()
      .from('employees')
      .update(updateData)
      .eq('id', personnelId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.mapPersonnel(updated);
  }

  async updatePersonnelTeam(personnelId: string, teamId: string) {
    const { error } = await this.client()
      .from('employees')
      .update({
        team_id: teamId,
        raw_data: { team: teamId },
      })
      .eq('id', personnelId);

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async updatePersonnelVacation(personnelId: string, onVacation: boolean) {
    const { error } = await this.client()
      .from('employees')
      .update({ on_vacations: onVacation })
      .eq('id', personnelId);

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async getSprintsByTeam(teamId: string): Promise<Sprint[]> {
    const { data, error } = await this.client()
      .from('sprints')
      .select('*')
      .eq('team_id', teamId)
      .order('start_date', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getSprint(teamId: string, sprintId: string): Promise<Sprint | null> {
    const { data, error } = await this.client()
      .from('sprints')
      .select('*')
      .eq('team_id', teamId)
      .eq('firebase_id', sprintId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async getMembersBySprint(teamId: string, sprintId: string): Promise<SprintMember[]> {
    const { data, error } = await this.client()
      .from('sprint_members')
      .select('*')
      .eq('team_id', teamId)
      .eq('sprint_id', `${teamId}__${sprintId}`);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapSprintMember(row));
  }

  async getLegacyMembersBySprint(teamId: string, sprintId: string) {
    const members = await this.getMembersBySprint(teamId, sprintId);
    return members.map((member) => ({
      id: member.firebase_id,
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
    const { data, error } = await this.client()
      .from('rotations_history')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapHistory(row));
  }

  async addRotationHistory(data: {
    personnelId: string;
    name: string;
    type: string;
    fromTeam: string;
    toTeam: string;
    sourceName?: string;
    destinationName?: string;
    date?: Date;
  }) {
    const id = crypto.randomUUID();
    const date = data.date ?? new Date();
    const { error } = await this.client().from('rotations_history').insert({
      id,
      date: date.toISOString(),
      type: data.type,
      name: data.name,
      employee_id: data.personnelId,
      from_team: data.fromTeam,
      from_name_team: data.sourceName ?? null,
      to_team: data.toTeam,
      to_name_team: data.destinationName ?? null,
      raw_data: data,
    });

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async getModulesByRole(role: string): Promise<SidebarModule[]> {
    const { data, error } = await this.client()
      .from('modules_sidebar')
      .select('*')
      .eq('visible', true)
      .order('order', { ascending: true });

    if (error) {
      throw error;
    }

    const modules = (data ?? []).filter(
      (moduleItem) => Array.isArray(moduleItem.permitted_roles) && moduleItem.permitted_roles.includes(role),
    );

    if (role === 'Admin') {
      const modulesToDisable = ['Gestor de Noticias', 'Documentos'];
      return modules
        .filter((moduleItem) => !modulesToDisable.includes(moduleItem.name_module ?? ''))
        .map((moduleItem) => this.mapSidebarModule(moduleItem));
    }

    return modules.map((moduleItem) => this.mapSidebarModule(moduleItem));
  }

  private mapSidebarModule(row: any): SidebarModule {
    return {
      id: row.id,
      name: row.name_module,
      route: row.route,
      icon: row.icon,
      order: row.order,
      visible: row.visible,
      permittedRoles: row.permitted_roles,
      firebase_path: row.firebase_path,
      raw_data: row.raw_data,
    };
  }

  async getMaintenanceStatus(): Promise<MaintenanceStatus> {
    const { data, error } = await this.client()
      .from('settings')
      .select('active')
      .eq('id', 'maintenance')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { active: data?.active ?? false };
  }

  async getPerformanceConfig() {
    const { data, error } = await this.client()
      .from('config_evaluations')
      .select('*')
      .eq('id', 'performance')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.raw_data ?? data;
  }

  async savePerformanceConfig(data: Record<string, unknown>) {
    const { error } = await this.client()
      .from('config_evaluations')
      .upsert({
        id: 'performance',
        sections: data.sections ?? null,
        raw_data: data,
      });

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async getOtoConfig() {
    const { data, error } = await this.client()
      .from('config_evaluations')
      .select('*')
      .eq('id', 'one-to-one')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.raw_data ?? data;
  }

  async saveOtoConfig(data: Record<string, unknown>) {
    const { error } = await this.client()
      .from('config_evaluations')
      .upsert({
        id: 'one-to-one',
        sections: data.sections ?? null,
        raw_data: data,
      });

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async savePerformanceEvaluation(data: CreatePerformanceEvaluationDto) {
    const evaluationNumber = data.evaluationNumber ?? await this.findNextEvaluationNumber(
      'performance_evaluaciones',
      data.teamId,
      data.engineerName,
    );
    const docId = this.slug(data.engineerName);
    const collectionId = `performance-${evaluationNumber}`;
    const date = new Date().toISOString();

    const { error } = await this.client().from('performance_evaluaciones').insert({
      id: `${data.teamId}__${collectionId}__${docId}`,
      firebase_id: docId,
      team_id: data.teamId,
      name_ingineer: data.engineerName,
      evaluator_name: data.evaluatorName,
      period: data.period,
      evaluation_number: evaluationNumber,
      date: date,
      answere: data.answers,
      achievements: data.achievements,
      growth_potential: data.growthPotential,
      additional_observations: data.additionalObservations,
      feedback_confirmed: data.feedbackConfirmed,
      firebase_collection: collectionId,
      raw_data: { ...data, evaluationNumber, date },
    });

    if (error) {
      throw error;
    }

    const activeEnablement = await this.getActiveEnablement(data.teamId);
    if (activeEnablement) {
      const evaluatedCount = (activeEnablement.evaluatedCount || 0) + 1;
      await this.updatePerformanceEnablement(activeEnablement.id, {
        evaluated_count: evaluatedCount,
        status: evaluatedCount >= (activeEnablement.totalExpected || 0) ? 'Completado' : 'En proceso',
        last_update: new Date().toISOString(),
      });
    }

    return { ok: true, evaluationNumber };
  }

  async getPerformanceHistory(teamId: string) {
    const { data, error } = await this.client()
      .from('performance_evaluaciones')
      .select('*')
      .eq('team_id', teamId)
      .order('evaluation_number', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => {
      const storedAnswers = row.answere ?? row.raw_data?.answers ?? row.raw_data?.respuestas ?? {};
      const answers = Object.fromEntries(
        Object.entries(storedAnswers).map(([key, value]: [string, any]) => [
          key,
          {
            score: Number(value?.score ?? value?.puntaje ?? 0),
            comment: value?.comment ?? value?.comentario ?? '',
          },
        ]),
      );

      return {
        id: row.id,
        teamId: row.team_id,
        employeeId: row.firebase_id,
        evaluationNumber: row.evaluation_number,
        engineerName: row.name_ingineer,
        evaluatorName: row.evaluator_name,
        period: row.period,
        answers,
        achievements: row.achievements,
        growthPotential: row.growth_potential,
        additionalObservations: row.additional_observations,
        feedbackConfirmed: row.feedback_confirmed,
        date: row.date,
      };
    });
  }

  async saveOtoEvaluation(data: CreateOtoEvaluationDto) {
    const evaluationNumber = data.evaluationNumber ?? await this.findNextEvaluationNumber(
      'oto_evaluations',
      data.teamId,
      data.engineerName,
    );
    const docId = this.slug(data.engineerName);
    const collectionId = `one-to-one-${evaluationNumber}`;
    const date = new Date().toISOString();

    const { error } = await this.client().from('oto_evaluations').insert({
      id: `${data.teamId}__${collectionId}__${docId}`,
      firebase_id: docId,
      team_id: data.teamId,
      name_engineer: data.engineerName,
      name_evaluator: data.evaluatorName,
      period: data.period,
      number_evaluation: evaluationNumber,
      date,
      summary: data.summary,
      final_synthesis: data.finalSummary,
      reflection_questions: data.reflectionQuestions,
      soft_skills: data.softSkills,
      firebase_collection: collectionId,
      raw_data: { ...data, evaluationNumber, date },
    });

    if (error) {
      throw error;
    }

    return { ok: true, evaluationNumber };
  }

  async getOtoHistory(teamId: string) {
    const { data, error } = await this.client()
      .from('oto_evaluations')
      .select('*')
      .eq('team_id', teamId)
      .order('number_evaluation', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => {
      const storedSummary = row.summary ?? row.raw_data?.summary ?? row.raw_data?.resumen ?? {};
      const storedSoftSkills = row.soft_skills ?? row.raw_data?.softSkills ?? row.raw_data?.habilidadesBlandas ?? {};

      const summary = {
        totalAssignedTasks: storedSummary.totalAssignedTasks ?? storedSummary.totalTareasAsignadas ?? 0,
        assignedDeliveredPercentage:
          storedSummary.assignedDeliveredPercentage ?? storedSummary.porcentajeAsignadasEntregadas ?? 0,
        deliveredReturnedPercentage:
          storedSummary.deliveredReturnedPercentage ?? storedSummary.porcentajeEntregadasDevueltas ?? 0,
        codeQualityPercentage:
          storedSummary.codeQualityPercentage ?? storedSummary.porcentajeCalidadCodigo ?? 0,
        averageFinalTotal: storedSummary.averageFinalTotal ?? storedSummary.promedioTotalFinal ?? 0,
      };

      const softSkills = Object.fromEntries(
        Object.entries(storedSoftSkills).map(([key, value]: [string, any]) => [
          key,
          {
            rating: Number(value?.rating ?? value?.calificacion ?? 0),
            comment: value?.comment ?? value?.comentario ?? '',
          },
        ]),
      );

      return {
        id: row.id,
        teamId: row.team_id,
        employeeId: row.firebase_id,
        evaluationNumber: row.number_evaluation,
        engineerName: row.name_engineer,
        evaluatorName: row.name_evaluator,
        period: row.period,
        summary,
        finalSummary: row.final_synthesis ?? row.raw_data?.finalSummary ?? row.raw_data?.sintesisFinal ?? {},
        reflectionQuestions:
          row.reflection_questions ?? row.raw_data?.reflectionQuestions ?? row.raw_data?.preguntasReflexion ?? {},
        softSkills,
        date: row.date,
      };
    });
  }

  private async findNextEvaluationNumber(
    table: 'performance_evaluaciones' | 'oto_evaluations',
    teamId: string,
    engineerName: string,
  ): Promise<number> {
    const docId = this.slug(engineerName);
    const { data, error } = await this.client()
      .from(table)
      .select(table === 'performance_evaluaciones' ? 'evaluation_number, firebase_id' : 'number_evaluation, firebase_id')
      .eq('team_id', teamId)
      .order(table === 'performance_evaluaciones' ? 'evaluation_number' : 'number_evaluation', { ascending: false });

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const numberField = table === 'performance_evaluaciones' ? 'evaluation_number' : 'number_evaluation';
    const latest = rows[0]?.[numberField] ?? 0;
    const existsInLatest = rows.some((row) => row[numberField] === latest && row.firebase_id === docId);

    if (!latest) return 1;
    return existsInLatest ? latest + 1 : latest;
  }

  async enablePerformance(teamId: string, adminName: string) {
    const existente = await this.getActiveEnablement(teamId);
    if (existente) return existente;

    const employee = await this.getEmployeeByTeam(teamId);
    const totalExpected = employee .filter((p) => !['Arquitecto', 'Admin'].includes(String(p.role || ''))).length;
    const team = await this.getTeam(teamId);
    const id = crypto.randomUUID();
    const enabledAt = new Date().toISOString();
    const row = {
      id,
      teams_id: teamId,
      teams_name: team?.name || teamId,
      admin_name: adminName,
      init_date: enabledAt,
      status: 'Pendiente',
      evaluated_count: 0,
      'total_ expected': totalExpected,
      raw_data: {
        teamId,
        teamName: team?.name || teamId,
        adminName,
        enabledAt,
        status: 'Pendiente',
        evaluatedCount: 0,
        totalExpected,
      },
    };

    const { error } = await this.client().from('performance_ qualifications').insert(row);

    if (error) {
      throw error;
    }

    return this.mapEnablement(row);
  }

  async getPerformanceEnablements(teamId?: string) {
    let query = this.client()
      .from('performance_ qualifications')
      .select('*')
      .order('init_date', { ascending: false });

    if (teamId) {
      query = query.eq('teams_id', teamId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapEnablement(row));
  }

  async getActiveEnablement(teamId: string) {
    const { data, error } = await this.client()
      .from('performance_ qualifications')
      .select('*')
      .eq('teams_id', teamId)
      .in('status', ['Pendiente', 'En proceso'])
      .order('init_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? this.mapEnablement(data) : null;
  }

  private async updatePerformanceEnablement(
    id: string,
    updates: { evaluated_count: number; status: string; last_update: string },
  ) {
    const { data: current, error: currentError } = await this.client()
      .from('performance_ qualifications')
      .select('raw_data')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    const rawData = (current?.raw_data ?? {}) as Record<string, unknown>;
    const { error } = await this.client()
      .from('performance_ qualifications')
      .update({
        ...updates,
        raw_data: {
          ...rawData,
          evaluatedCount: updates.evaluated_count,
          status: updates.status,
          lastUpdate: updates.last_update,
        },
      })
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  private mapEnablement(row: any) {
    return {
      id: row.id,
      teamId: row.teams_id,
      teamName: row.teams_name,
      adminName: row.admin_name,
      enabledAt: row.init_date,
      status: row.status,
      evaluatedCount: row.evaluated_count,
      totalExpected: row['total_ expected'],
      lastUpdate: row.last_update,
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
    return new Date(dateValue).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  async getSprintEvaluationStatus(teamId: string, specificSprintId?: string) {
    const sprints = await this.getSprintsByTeam(teamId);
    let activeSprint = specificSprintId
      ? sprints.find((s) => s.firebase_id === specificSprintId)
      : sprints
        .filter((s) => s.sprint_closed !== true)
        .sort((a, b) => this.getSprintNumero(a.firebase_id) - this.getSprintNumero(b.firebase_id))[0];

    const maxSprintNum = sprints.reduce((max, sprint) => Math.max(max, this.getSprintNumero(sprint.firebase_id)), 0);
    const sprintNumber = activeSprint ? this.getSprintNumero(activeSprint.firebase_id) : maxSprintNum + 1;
    const sprintId = activeSprint ? activeSprint.firebase_id : `sprint-${sprintNumber}`;
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
    const memberId = this.slug(engineerName);
    const sprintPrimaryId = this.sprintPrimaryId(data.teamId, data.sprintId);
    const sprint = await this.getSprint(data.teamId, data.sprintId);

    if (!sprint) {
      const { error } = await this.client().from('sprints').insert({
        id: sprintPrimaryId,
        firebase_id: data.sprintId,
        team_id: data.teamId,
        start_date: new Date(data.startDate).toISOString(),
        end_date: new Date(data.endDate).toISOString(),
        sprint_closed: false,
        raw_data: {
          fecha_inicio: data.startDate,
          fecha_fin: data.endDate,
          sprint_cerrado: false,
        },
      });

      if (error) throw error;
    }

    const metrics = data.metrics ?? {};
    const { error: memberError } = await this.client().from('sprint_members').upsert({
      id: `${sprintPrimaryId}__${memberId}`,
      firebase_id: memberId,
      sprint_id: sprintPrimaryId,
      team_id: data.teamId,
      employee_name: engineerName,
      assigned_tasks: metrics.assignedTasks ?? null,
      delivered_tasks: metrics.deliveredTasks ?? metrics.deliveredTasksAlternative ?? null,
      returned_tasks: metrics.returnedTasks ?? null,
      code_quality: metrics.codeQuality ?? null,
      total1: metrics.total1 ?? null,
      total2: metrics.total2 ?? null,
      total3: metrics.total3 ?? null,
      total_final: data.finalScore,
      qualification: data.ratingLabel,
      comments: data.comments ?? null,
      evaluated_by: data.evaluatorEmail,
      evaluation_date: new Date().toISOString(),
      raw_data: {
        name: engineerName,
        ...metrics,
        total_final: data.finalScore,
        rating: data.ratingLabel,
        comments: data.comments,
        evaluado_por: data.evaluatorEmail,
      },
    });

    if (memberError) throw memberError;

    const members = await this.getMembersBySprint(data.teamId, data.sprintId);
    const employee = await this.getEmployeeByTeam(data.teamId);
    const totalExpected = employee.filter((p) => {
      const role = String(p.role || '').toLowerCase().trim();
      return role !== 'arquitecto' && p.onVacation !== true;
    }).length;
    let sprintClosed = false;

    if (totalExpected > 0 && members.length >= totalExpected) {
      const { error } = await this.client()
        .from('sprints')
        .update({ sprint_closed: true })
        .eq('id', sprintPrimaryId);

      if (error) throw error;
      sprintClosed = true;
    }

    const nextState = await this.getSprintEvaluationStatus(data.teamId);
    return { ok: true, sprintClosed, nextState };
  }
}
