import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateTeamDto } from './dto/create-team.dto';
import { OperationsService } from '../operations/operations.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';
import {
  BarChartData,
  Team,
  DashboardMember,
  DashboardSprint,
  TeamDashboardData,
  TeamSprintResponse,
  SaveEvaluationRequest,
  RotationHistory,
  CurrentEngineer,
  MemberSummary,
  Sprint,
  SprintStatus,
} from '../supabase/interfaces/supabase-interface';

@Injectable()
export class TeamsService {
  constructor(
    private readonly operacionesService: OperationsService,
    private readonly supabaseDataService: SupabaseDataService,
  ) { }

  async getDashboardData(teamId: string): Promise<TeamDashboardData | null> {
    const team = await this.supabaseDataService.getTeam(teamId);
    if (!team) return null;

    const personnel = await this.supabaseDataService.getEmployeeByTeam(teamId);
    const allowedRoles = ['Ingeniero de Software', 'Ingeniero de QA', 'Ingeniero QA'];
    const currentEngineers: CurrentEngineer[] = personnel
      .filter((p) => allowedRoles.some((role) => p.role?.toLowerCase().includes(role.toLowerCase())))
      .map((p) => ({
        id: p.id,
        name: p.name ?? '',
        replacementStartSprintId: p.replacementStartSprintId || null,
        onVacation: p.onVacation ?? null,
      }));

    const historyData = await this.supabaseDataService.getRotationHistory() as RotationHistory[];
    const rawSprints = await this.supabaseDataService.getSprintsByTeam(teamId);

    // Mapear sprints al formato que espera OperacionesService y el Dashboard
    const sprints: DashboardSprint[] = await Promise.all(rawSprints.map(async (s) => {
      const members = await this.supabaseDataService.getMembersBySprint(teamId, s.code);
      return {
        id: s.code,
        startDate: s.start_date ?? null,
        endDate: s.end_date ?? null,
        sprintClosed: s.sprint_closed ?? null,
        members: members.map((member): DashboardMember => ({
          id: member.id,
          name: member.name ?? '',
          total1: member.total1,
          total2: member.total2,
          total3: member.total3,
          total_final: member.total_final,
          rating: member.rating,
          comments: member.comments,
        })),
      };
    }));

    // Ordenar sprints por fecha de inicio descendente
    const sortedSprints = [...sprints].sort((a, b) => {
      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return dateB - dateA;
    });

    // Calcular estado de cada sprint (Completado/En proceso)
    // Lógica espejo del frontend
    const dashboardSprints = sortedSprints.map((s, index) => {
      let status: SprintStatus = 'En proceso';
      if (index > 0) {
        status = 'Completado';
      } else {
        // Para el más reciente, verificamos si todos los ingenieros esperados fueron evaluados
        const evaluatedMembers = s.members.filter((i) => {
          if (i.rating === 'Arquitecto') return false;
          const persona = currentEngineers.find((p) => p.name === i.name);
          if (!persona) return false;
          // Lógica simplificada de vacaciones para el dashboard resumido
          if (persona.onVacation) return false;
          return true;
        });

        const validEngineers = currentEngineers.filter((p) => !p.onVacation);
        status = (evaluatedMembers.length >= validEngineers.length && validEngineers.length > 0) ? 'Completado' : 'En proceso';
      }

      return {
        ...s,
        status
      };
    });

    // Calcular métricas usando OperacionesService
    // Nota: OperacionesService espera camelCase en los objetos de sprint
    const lastPerformance = this.operacionesService.calculateLastClosedSprintPerformance(
      sprints,
      historyData,
      currentEngineers
    );

    const trend = this.operacionesService.calculateSprintPerformance(
      sprints,
      historyData,
      currentEngineers
    );

    // Gráfico de barras del último sprint completado
    let barChartData: BarChartData = {
      labels: [],
      datasets: [{ data: [] }]
    };
    let chartSprintId: string | null = null;

    for (const s of sortedSprints) {
      const evaluatedMembers = s.members.filter((i) => i.rating !== 'Arquitecto');
      // Si el sprint está cerrado o tiene evaluaciones, lo usamos para la gráfica de barras
      if (evaluatedMembers.length > 0) {
        barChartData = {
          labels: evaluatedMembers.map((i) => i.name),
          datasets: [{
            data: evaluatedMembers.map((i) => i.total_final ?? 0)
          }]
        };
        chartSprintId = s.id;
        break;
      }
    }

    return {
      team: {
        id: team.id,
        name: team.name,
      },
      stats: {
        totalMembers: currentEngineers.length,
        totalSprints: dashboardSprints.filter(s => s.status === 'Completado').length,
        averagePerformance: lastPerformance?.average ?? 0,
        ratedPerformance: lastPerformance?.rating ?? 'Sin datos',
      },
      sprints: dashboardSprints,
      charts: {
        barChart: barChartData,
        lineChart: trend,
        chartSprintId: chartSprintId
      }
    };
  }

  async findAll(onlyWithEvaluations = false): Promise<Team[]> {
    return this.supabaseDataService.getTeams(onlyWithEvaluations);
  }

  async getSprintsByTeam(teamId: string): Promise<TeamSprintResponse[]> {
    const sprints = await this.supabaseDataService.getSprintsByTeam(teamId);
    return sprints.map((s) => ({
      id: s.code,
      name: s.code,
      startDate: s.start_date ?? null,
      endDate: s.end_date ?? null,
      sprintClosed: s.sprint_closed ?? null,
    }));
  }
  async getMembersBySprint(teamId: string, sprintId: string): Promise<MemberSummary[]> {
    return this.supabaseDataService.getLegacyMembersBySprint(teamId, sprintId);
  }

  async getSprint(teamId: string, sprintId: string) {
    const sprint = await this.supabaseDataService.getSprint(teamId, sprintId);

    if (!sprint) return null;

    return {
      id: sprint.code,
      fecha_inicio: sprint.start_date,
      fecha_fin: sprint.end_date,
      sprintClosed: sprint.sprint_closed ?? null,
    };
  }

  async getTeam(teamId: string): Promise<Team | null> {
    return this.supabaseDataService.getTeam(teamId);
  }

  async getMetricas(teamId: string, sprintId: string) {
    return this.supabaseDataService.getMetrics(teamId, sprintId);
  }

  async create(createTeamDto: CreateTeamDto) {
    return this.supabaseDataService.createTeam(createTeamDto.name);
  }

  async getSprintEvaluationStatus(teamId: string, sprintId?: string) {
    return this.supabaseDataService.getSprintEvaluationStatus(teamId, sprintId);
  }

  async getSprintBoardContext(teamId: string) {
    const [team, members, sprints, rotationHistory, evaluationStatus] = await Promise.all([
      this.getTeam(teamId),
      this.supabaseDataService.getEmployeeByTeam(teamId),
      this.getSprintsByTeam(teamId),
      this.supabaseDataService.getRotationHistory() as Promise<RotationHistory[]>,
      this.getSprintEvaluationStatus(teamId),
    ]);
    if (!team) return null;

    const teamKeys = new Set([teamId, team.id, team.name].filter(Boolean));
    const relevantRotationHistory = rotationHistory.filter((event: any) =>
      teamKeys.has(event.fromTeam) || teamKeys.has(event.toTeam)
      || teamKeys.has(event.sourceName) || teamKeys.has(event.destinationName),
    );

    return {
      team,
      members,
      sprints,
      rotationHistory: relevantRotationHistory,
      evaluationStatus,
    };
  }

  async saveEvaluation(data: Partial<SaveEvaluationRequest> | undefined) {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('El cuerpo de la evaluación es obligatorio');
    }

    const requiredFields: Array<keyof SaveEvaluationRequest> = [
      'teamId',
      'sprintId',
      'startDate',
      'endDate',
      'engineer',
      'metrics',
      'finalScore',
      'ratingLabel',
      'evaluatorEmail',
    ];
    const missingFields = requiredFields.filter((field) => data[field] === undefined || data[field] === null);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Faltan campos obligatorios para guardar la evaluación: ${missingFields.join(', ')}`,
      );
    }

    return this.supabaseDataService.saveEvaluation(data as SaveEvaluationRequest);
  }
}
