import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationService } from '../../organization/services/organization.service';
import { CreateSprintDto, UpdateSprintDto } from '../dto/sprint.dto';
import { SprintsRepository } from '../repositories/sprints.repository';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import type { Sprint, SprintStatus } from '../interfaces/sprint.interface';

@Injectable()
export class SprintsService {
  constructor(
    private readonly repository: SprintsRepository,
    private readonly organizationService: OrganizationService,
    private readonly itemsRepository: SprintItemsRepository,
  ) {}

  findByTeam(teamId: string, status?: SprintStatus) {
    return this.repository.findByTeam(teamId, status);
  }

  findActiveInitiatives(teamId: string) {
    return this.repository.findActiveInitiatives(teamId);
  }

  findInitiativesForPeriod(
    teamId: string,
    startDate: string,
    endDate: string,
  ) {
    if (!this.isIsoDate(startDate) || !this.isIsoDate(endDate)) {
      throw new BadRequestException(
        'startDate and endDate must use the YYYY-MM-DD format',
      );
    }
    this.assertDates(startDate, endDate);
    return this.repository.findInitiativesForPeriod(
      teamId,
      startDate,
      endDate,
    );
  }

  /**
   * Bootstrap payload for the sprint screen. Keeping this aggregation in the
   * API avoids making the frontend request organization, employees, sprints,
   * history and the selected sprint dashboard independently.
   */
  async initialContext(teamId: string, today?: string) {
    const [organization, employees, sprints, activeInitiatives] =
      await Promise.all([
        this.organizationService.findTeamOrganization(teamId),
        this.organizationService.findEmployees(teamId),
        this.findByTeam(teamId),
        this.findActiveInitiatives(teamId),
      ]);

    const referenceDate = today ?? this.today();
    const orderedSprints = [...sprints].sort(
      (left, right) => right.sprintNumber - left.sprintNumber,
    );
    const sprintForToday = orderedSprints.find(
      (sprint) =>
        sprint.status === 'planned' &&
        sprint.startDate <= referenceDate &&
        sprint.endDate >= referenceDate,
    );
    const activeSprint = orderedSprints.find(
      (sprint) => sprint.status === 'in_progress',
    );
    const selectedSprint =
      activeSprint ??
      sprintForToday ??
      [...orderedSprints]
        .reverse()
        .find((sprint) => sprint.status === 'planned') ??
      orderedSprints.find((sprint) => sprint.status === 'completed') ??
      null;

    const [dashboard, historicalDashboards] = await Promise.all([
      selectedSprint
        ? this.fullDashboard(teamId, selectedSprint.id)
        : Promise.resolve(null),
      this.historyDashboard(teamId, 3, sprints),
    ]);

    return {
      organization,
      employees,
      sprints,
      selectedSprint,
      dashboard,
      activeInitiatives,
      historicalDashboards,
    };
  }

  /** Dashboard aggregates for the most recent sprints, used by historical charts. */
  async historyDashboard(teamId: string, limit = 3, allSprints?: Sprint[]) {
    const safeLimit = Math.min(Math.max(Number(limit) || 3, 1), 12);
    const sprintList = allSprints ?? (await this.repository.findByTeam(teamId));
    const currentSprint = sprintList.find(
      (sprint) => sprint.status === 'in_progress',
    );
    const anchorNumber =
      currentSprint?.sprintNumber ??
      Math.max(...sprintList.map((sprint) => sprint.sprintNumber), 0);
    const sprints = sprintList
      .filter((sprint) => sprint.sprintNumber <= anchorNumber)
      .sort((a, b) => b.sprintNumber - a.sprintNumber)
      .slice(0, safeLimit)
      .reverse();

    return Promise.all(
      sprints.map(async (sprint) => {
        const dashboard = await this.dashboard(teamId, sprint.id);
        return {
          sprint: dashboard.sprint,
          initiatives: dashboard.initiatives,
          stories: dashboard.stories,
          bugs: dashboard.bugs,
          risks: dashboard.risks,
          completionPercentage: dashboard.completionPercentage,
          performanceScore: dashboard.performanceScore,
          performanceRating: dashboard.performanceRating,
        };
      }),
    );
  }

  async create(teamId: string, input: CreateSprintDto) {
    await this.assertProjectAssignment(
      teamId,
      input.projectId,
      input.startDate,
      input.endDate,
    );
    this.assertDates(input.startDate, input.endDate);
    return this.repository.createWithStories(teamId, {
      project_id: input.projectId,
      objective: input.objective ?? null,
      start_date: input.startDate,
      end_date: input.endDate,
      scrum_master_id: input.scrumMasterId ?? null,
      architect_id: input.architectId ?? null,
      committed_points: input.committedPoints ?? 0,
      status: 'planned',
    }, input.userStoryCount);
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
    const updates: Record<string, unknown> = {
      ...(input.projectId !== undefined && { project_id: input.projectId }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.objective !== undefined && { objective: input.objective }),
      ...(input.startDate !== undefined && { start_date: input.startDate }),
      ...(input.endDate !== undefined && { end_date: input.endDate }),
      ...(input.scrumMasterId !== undefined && {
        scrum_master_id: input.scrumMasterId,
      }),
      ...(input.architectId !== undefined && {
        architect_id: input.architectId,
      }),
      ...(input.committedPoints !== undefined && {
        committed_points: input.committedPoints,
      }),
    };
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
    const stories = await this.itemsRepository.findAll(
      'sprint_user_stories',
      sprintId,
    );
    if (stories.length === 0) {
      throw new BadRequestException(
        'Debes registrar al menos una historia de usuario antes de iniciar el sprint',
      );
    }
    return this.repository.update(teamId, sprintId, {
      status: 'in_progress',
      committed_points: this.sumStoryPoints(stories),
    });
  }

  async complete(teamId: string, sprintId: string) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (sprint.status === 'completed') {
      return this.repository.completeTransactional(teamId, sprintId);
    }
    if (sprint.status !== 'in_progress')
      throw new BadRequestException(
        'Solo se puede finalizar un sprint en progreso',
      );
    if (this.today() < sprint.endDate) {
      throw new BadRequestException(
        `El sprint solo se puede cerrar a partir del ${sprint.endDate}`,
      );
    }
    return this.repository.completeTransactional(teamId, sprintId);
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
    const [initiatives, stories] = await Promise.all([
      this.itemsRepository.countBySprint('sprint_initiatives', sprintId),
      this.itemsRepository.findAll('sprint_user_stories', sprintId),
    ]);
    const storyCounts = stories.reduce<{
      planned: number;
      inProgress: number;
      blocked: number;
      completed: number;
    }>(
      (counts, story) => {
        const status = String(story.status ?? '');
        if (status === 'planned') counts.planned += 1;
        else if (status === 'in_progress') counts.inProgress += 1;
        else if (status === 'blocked') counts.blocked += 1;
        else if (status === 'completed') counts.completed += 1;
        return counts;
      },
      { planned: 0, inProgress: 0, blocked: 0, completed: 0 },
    );
    const performanceScore = this.calculatePerformanceScore({
      ...dashboard,
      initiatives: { total: initiatives },
    });
    return {
      ...dashboard,
      initiatives: { total: initiatives },
      stories: {
        ...dashboard.stories,
        planned: storyCounts.planned,
        inProgress: storyCounts.inProgress,
        blocked: storyCounts.blocked,
        completed: storyCounts.completed,
        total: stories.length,
      },
      performanceScore,
      performanceRating: this.performanceRating(performanceScore),
    };
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

  private isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }

  private sumStoryPoints(stories: Array<{ storyPoints?: number }>): number {
    return stories.reduce(
      (sum, story) => sum + Number(story.storyPoints ?? 0),
      0,
    );
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
