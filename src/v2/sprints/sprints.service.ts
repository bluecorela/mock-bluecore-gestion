import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationService } from '../organization/organization.service';
import {
  CompleteSprintDto,
  CreateSprintDto,
  UpdateSprintDto,
} from './dto/sprint.dto';
import { SprintsRepository } from './sprints.repository';
import { SprintItemsRepository } from './sprint-items.repository';

@Injectable()
export class SprintsService {
  constructor(
    private readonly repository: SprintsRepository,
    private readonly organizationService: OrganizationService,
    private readonly itemsRepository: SprintItemsRepository,
  ) {}

  findByTeam(teamId: string, status?: string) {
    return this.repository.findByTeam(teamId, status);
  }

  async create(teamId: string, input: CreateSprintDto) {
    await this.assertProjectAssignment(
      teamId,
      input.projectId,
      input.startDate,
      input.endDate,
    );
    this.assertDates(input.startDate, input.endDate);
    const sprintNumber = await this.repository.nextSprintNumber(teamId);
    return this.repository.create({
      team_id: teamId,
      project_id: input.projectId,
      sprint_number: sprintNumber,
      name: input.name,
      objective: input.objective ?? null,
      start_date: input.startDate,
      end_date: input.endDate,
      scrum_master_id: input.scrumMasterId ?? null,
      architect_id: input.architectId ?? null,
      committed_points: input.committedPoints ?? 0,
      status: 'planned',
    });
  }

  async update(teamId: string, sprintId: string, input: UpdateSprintDto) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (!['planned', 'in_progress'].includes(sprint.status)) {
      throw new BadRequestException(
        'Solo se puede actualizar un sprint planificado o en curso',
      );
    }
    if (
      sprint.status === 'in_progress' &&
      input.startDate !== undefined &&
      input.startDate !== sprint.startDate
    ) {
      throw new BadRequestException(
        'La fecha de inicio no se puede modificar en un sprint en curso',
      );
    }
    const startDate = input.startDate ?? sprint.startDate;
    const endDate = input.endDate ?? sprint.endDate;
    this.assertDates(startDate, endDate);
    await this.assertProjectAssignment(
      teamId,
      input.projectId ?? sprint.projectId,
      startDate,
      endDate,
    );
    const updates: Record<string, unknown> = {};
    const fields: Record<string, string> = {
      projectId: 'project_id',
      name: 'name',
      objective: 'objective',
      startDate: 'start_date',
      endDate: 'end_date',
      scrumMasterId: 'scrum_master_id',
      architectId: 'architect_id',
      committedPoints: 'committed_points',
    };
    for (const [inputField, column] of Object.entries(fields))
      if ((input as any)[inputField] !== undefined)
        updates[column] = (input as any)[inputField];
    const updatedSprint = await this.repository.update(
      teamId,
      sprintId,
      updates,
    );
    if (!updatedSprint) throw new NotFoundException('Sprint not found');
    return updatedSprint;
  }

  async start(teamId: string, sprintId: string) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (sprint.status !== 'planned')
      throw new BadRequestException(
        'Solo se puede iniciar un sprint planificado',
      );
    if (await this.repository.hasInProgressSprint(teamId, sprintId))
      throw new BadRequestException('El equipo ya tiene un sprint en progreso');
    if (
      await this.repository.hasPreviousUnclosedSprint(
        teamId,
        sprint.sprintNumber,
      )
    ) {
      throw new BadRequestException(
        'No se puede iniciar un sprint mientras exista un sprint anterior sin cerrar',
      );
    }
    if (
      (await this.itemsRepository.countBySprint(
        'sprint_user_stories',
        sprintId,
      )) === 0
    ) {
      throw new BadRequestException(
        'Debes registrar al menos una historia de usuario antes de iniciar el sprint',
      );
    }
    return this.repository.update(teamId, sprintId, { status: 'in_progress' });
  }

  async complete(teamId: string, sprintId: string, input: CompleteSprintDto) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (sprint.status !== 'in_progress')
      throw new BadRequestException(
        'Solo se puede finalizar un sprint en progreso',
      );
    if (this.today() < sprint.endDate) {
      throw new BadRequestException(
        `El sprint solo se puede cerrar a partir del ${sprint.endDate}`,
      );
    }
    const pendingStories = (
      await this.itemsRepository.findAll('sprint_user_stories', sprintId)
    ).filter(
      (story) =>
        typeof story.status === 'string' &&
        ['planned', 'in_progress', 'blocked'].includes(story.status),
    );
    if (pendingStories.length) {
      const nextSprint = await this.repository.findNextPlannedSprint(
        teamId,
        sprint.projectId,
        sprint.sprintNumber,
      );
      if (!nextSprint) {
        throw new BadRequestException(
          'No se puede cerrar el sprint porque tiene historias de usuario pendientes y no existe un siguiente sprint planificado para trasladarlas',
        );
      }
      await this.itemsRepository.copyPendingStoriesToSprint(
        sprintId,
        nextSprint.id,
      );
    }
    return this.repository.update(teamId, sprintId, {
      status: 'completed',
      closed_at: new Date().toISOString(),
      completed_points: input.completedPoints ?? sprint.completedPoints,
      wip_stories: input.wipStories ?? sprint.wipStories,
    });
  }

  async closureSummary(teamId: string, sprintId: string) {
    await this.requireSprint(teamId, sprintId);
    const [initiatives, stories, bugs, risks] = await Promise.all([
      this.itemsRepository.findAll('sprint_initiatives', sprintId),
      this.itemsRepository.findAll('sprint_user_stories', sprintId),
      this.itemsRepository.findAll('sprint_bugs', sprintId),
      this.itemsRepository.findAll('sprint_risks', sprintId),
    ]);
    const pending = {
      initiatives: initiatives.filter(
        (item) =>
          typeof item.status === 'string' &&
          ['planned', 'in_progress', 'at_risk'].includes(item.status),
      ),
      userStories: stories.filter(
        (item) =>
          typeof item.status === 'string' &&
          ['planned', 'in_progress', 'blocked'].includes(item.status),
      ),
      bugs: bugs.filter(
        (item) =>
          typeof item.status === 'string' &&
          ['open', 'in_progress'].includes(item.status),
      ),
      risksAndBlockers: risks.filter(
        (item) =>
          typeof item.status === 'string' &&
          ['open', 'at_risk', 'monitoring'].includes(item.status),
      ),
    };
    return {
      sprintId,
      carryOverMessage:
        'Las historias de usuario pendientes se copiarán al siguiente sprint planificado; los demás registros permanecerán disponibles para su planificación.',
      counts: Object.fromEntries(
        Object.entries(pending).map(([key, values]) => [key, values.length]),
      ),
      pending,
    };
  }

  async dashboard(teamId: string, sprintId: string) {
    const dashboard = await this.repository.findDashboard(teamId, sprintId);
    if (!dashboard) throw new NotFoundException('Sprint not found');
    const initiatives = await this.itemsRepository.countBySprint(
      'sprint_initiatives',
      sprintId,
    );
    const performanceScore = this.calculatePerformanceScore({
      ...dashboard,
      initiatives: { total: initiatives },
    });
    return {
      ...dashboard,
      initiatives: { total: initiatives },
      performanceScore,
      performanceRating: this.performanceRating(performanceScore),
    };
  }

  async activeDashboard(teamId: string) {
    const activeSprint = (
      await this.repository.findByTeam(teamId, 'in_progress')
    )[0];
    if (!activeSprint)
      throw new NotFoundException(
        'No hay un sprint en progreso para este equipo',
      );
    return this.dashboard(teamId, activeSprint.id);
  }

  async activeFullDashboard(teamId: string) {
    const activeSprint = (
      await this.repository.findByTeam(teamId, 'in_progress')
    )[0];
    if (!activeSprint)
      throw new NotFoundException(
        'No hay un sprint en progreso para este equipo',
      );
    return this.fullDashboard(teamId, activeSprint.id);
  }

  async fullDashboard(teamId: string, sprintId: string) {
    const [dashboard, initiatives, stories, bugs, risks] = await Promise.all([
      this.dashboard(teamId, sprintId),
      this.itemsRepository.findAll('sprint_initiatives', sprintId),
      this.itemsRepository.findAll('sprint_user_stories', sprintId),
      this.itemsRepository.findAll('sprint_bugs', sprintId),
      this.itemsRepository.findAll('sprint_risks', sprintId),
    ]);
    return {
      ...dashboard,
      details: { initiatives, stories, bugs, risks },
    };
  }

  private async requireSprint(teamId: string, sprintId: string) {
    const sprint = await this.repository.findById(teamId, sprintId);
    if (!sprint) throw new NotFoundException('Sprint not found');
    return sprint;
  }

  private async assertProjectAssignment(
    teamId: string,
    projectId: string,
    startDate: string,
    endDate: string,
  ) {
    const organization =
      await this.organizationService.findTeamOrganization(teamId);
    const exists = organization.assignments.some(
      (assignment) =>
        assignment.project.id === projectId &&
        assignment.startedAt <= endDate &&
        (!assignment.endedAt || assignment.endedAt >= startDate),
    );
    if (!exists)
      throw new BadRequestException(
        'El proyecto no está asignado al equipo para las fechas del sprint',
      );
  }

  private assertDates(startDate: string, endDate: string) {
    if (new Date(endDate).getTime() < new Date(startDate).getTime())
      throw new BadRequestException('endDate cannot be earlier than startDate');
  }

  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private calculatePerformanceScore(dashboard: any): number {
    const committed = Number(dashboard.sprint?.committedPoints ?? 0);
    const completed = Number(
      dashboard.stories?.pointsCompleted ??
        dashboard.sprint?.completedPoints ??
        0,
    );
    const delivery =
      committed > 0 ? Math.min(100, (completed / committed) * 100) : 0;

    const totalStories = Number(dashboard.stories?.total ?? 0);
    const completedStories = Number(dashboard.stories?.completed ?? 0);
    const storyCompletion =
      totalStories > 0
        ? Math.min(100, (completedStories / totalStories) * 100)
        : 0;

    const criticalBugs = Number(dashboard.bugs?.critical ?? 0);
    const productionBugs = Number(dashboard.bugs?.production ?? 0);
    const quality = this.clamp(100 - criticalBugs * 15 - productionBugs * 10);

    const activeRisks = Number(dashboard.risks?.active ?? 0);
    const riskControl = this.clamp(100 - activeRisks * 10);

    return (
      Math.round(
        (delivery * 0.5 +
          quality * 0.25 +
          storyCompletion * 0.15 +
          riskControl * 0.1) *
          100,
      ) / 100
    );
  }

  private performanceRating(score: number): string {
    if (score >= 90) return 'Excelente';
    if (score >= 75) return 'Bueno';
    if (score >= 60) return 'Moderado';
    return 'Bajo';
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
