import { sprintErrorException } from '../sprint-error-codes';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { StoryLoadService } from '../load/story-load.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationService } from '../../organization/services/organization.service';
import {
  CreateSprintDto,
  PreviewSprintDto,
  UpdateSprintDto,
} from '../dto/sprint.dto';
import { UpdateSprintInitiativeDto } from '../dto/sprint-items.dto';
import { SprintsRepository } from '../repositories/sprints.repository';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import type { Sprint, SprintStatus } from '../interfaces/sprint.interface';

@Injectable()
export class SprintsService {
  constructor(
    private readonly repository: SprintsRepository,
    private readonly organizationService: OrganizationService,
    private readonly itemsRepository: SprintItemsRepository,
    private readonly storyLoad: StoryLoadService,
  ) {}

  findByTeam(teamId: string, status?: SprintStatus) {
    return this.repository.findByTeam(teamId, status);
  }

  findActiveInitiatives(teamId: string) {
    return this.repository.findActiveInitiatives(teamId);
  }

  async findHomeInitiatives(
    teamId: string,
    today: string = this.today(),
  ): Promise<{
    active: Record<string, unknown>[];
    finished: Record<string, unknown>[];
  }> {
    const initiatives = await this.repository.findTeamInitiatives(teamId);
    const cutoff = new Date(today + 'T00:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const minimumDate = cutoff.toISOString().slice(0, 10);
    const effectiveEnd = (row: Record<string, unknown>) =>
      String(row.actualEndDate ?? row.plannedEndDate ?? '');
    const active = initiatives
      .filter((row) => row.status !== 'completed' && row.status !== 'cancelled')
      .sort(
        (a, b) =>
          String(a.plannedEndDate ?? '9999-12-31').localeCompare(
            String(b.plannedEndDate ?? '9999-12-31'),
          ) || String(a.name ?? '').localeCompare(String(b.name ?? '')),
      );
    const finished = initiatives
      .filter(
        (row) => row.status === 'completed' && effectiveEnd(row) >= minimumDate,
      )
      .sort((a, b) => effectiveEnd(b).localeCompare(effectiveEnd(a)));
    return { active, finished };
  }

  findInitiativesForPeriod(teamId: string, startDate: string, endDate: string) {
    if (!this.isIsoDate(startDate) || !this.isIsoDate(endDate)) {
      throw new BadRequestException(
        'startDate and endDate must use the YYYY-MM-DD format',
      );
    }
    this.assertDates(startDate, endDate);
    return this.repository.findInitiativesForPeriod(teamId, startDate, endDate);
  }

  async updateTeamInitiative(
    teamId: string,
    initiativeId: string,
    input: UpdateSprintInitiativeDto,
  ) {
    const row = await this.repository.updateTeamInitiative(
      teamId,
      initiativeId,
      this.toInitiativeDatabase(input),
    );
    if (!row) throw new NotFoundException('Initiative not found');
    return row;
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

  private async assertCreatable(teamId: string, input: PreviewSprintDto) {
    await this.assertProjectAssignment(
      teamId,
      input.projectId,
      input.startDate,
      input.endDate,
    );
    this.assertDates(input.startDate, input.endDate);
    const leaders = await this.organizationService.findTeamLeaders(teamId);
    if (!leaders.architect) {
      throw new BadRequestException(
        'El equipo no tiene arquitecto asignado. Corrígelo en Equipos.',
      );
    }
    if (leaders.scrumMaster?.id === leaders.architect.id) {
      return { ...leaders, scrumMaster: null };
    }
    return leaders;
  }

  private assertStoryInput(input: PreviewSprintDto) {
    if (input.stories && (input.userStoryCount ?? 0) > 0)
      throw new BadRequestException(
        'Usa la cantidad de HU o la lista de historias, no ambas',
      );
  }

  async preview(
    teamId: string,
    input: PreviewSprintDto,
    user: AuthenticatedUser,
  ) {
    this.assertStoryInput(input);
    const leaders = await this.assertCreatable(teamId, input);
    const sprint = {
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      objective: input.objective ?? null,
      architect: {
        id: leaders.architect!.id,
        name: leaders.architect!.fullName,
      },
      scrumMaster: leaders.scrumMaster
        ? { id: leaders.scrumMaster.id, name: leaders.scrumMaster.fullName }
        : null,
    };
    const plan = input.stories
      ? await this.storyLoad.previewNewSprint(
          teamId,
          user,
          this.signedSprint(input, leaders),
          { stories: input.stories },
        )
      : {
          creates: [],
          updates: [],
          errors: [],
          confirmationToken: null,
          expiresAt: null,
        };
    return { sprint, ...plan };
  }

  private signedSprint(
    input: PreviewSprintDto,
    leaders: Awaited<ReturnType<OrganizationService['findTeamLeaders']>>,
  ) {
    return {
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      objective: input.objective,
      committedPoints: input.committedPoints,
      architectId: leaders.architect!.id,
      scrumMasterId: leaders.scrumMaster?.id,
    };
  }

  async create(
    teamId: string,
    input: CreateSprintDto,
    user: AuthenticatedUser,
  ) {
    this.assertStoryInput(input);
    if (input.stories && !input.confirmationToken)
      throw new BadRequestException(
        'Falta confirmationToken; genera la vista previa primero',
      );
    const leaders = await this.assertCreatable(teamId, input);
    const normalized = this.signedSprint(input, leaders);
    const payload = {
      project_id: normalized.projectId,
      objective: normalized.objective?.trim() || null,
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      scrum_master_id: normalized.scrumMasterId ?? null,
      architect_id: normalized.architectId,
      committed_points: normalized.committedPoints ?? 0,
      status: 'planned',
    };
    if (input.stories)
      return this.storyLoad.applyNewSprint(teamId, user, normalized, payload, {
        stories: input.stories,
        confirmationToken: input.confirmationToken,
      });
    return this.repository.createWithStories(
      teamId,
      payload,
      input.userStoryCount ?? 0,
    );
  }

  async update(teamId: string, sprintId: string, input: UpdateSprintDto) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (!['planned', 'in_progress'].includes(sprint.status)) {
      throw sprintErrorException(
        'SPRINT_NOT_WRITABLE',
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
      ...(input.committedPoints !== undefined && {
        committed_points: input.committedPoints,
      }),
    };
    const updatedSprint = await this.repository.update(
      teamId,
      sprintId,
      updates,
    );
    if (!updatedSprint) throw sprintErrorException('SPRINT_NOT_FOUND');
    return updatedSprint;
  }

  remove(teamId: string, sprintId: string) {
    return this.repository.deletePlanned(teamId, sprintId);
  }

  async start(teamId: string, sprintId: string) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (sprint.status !== 'planned')
      throw sprintErrorException('SPRINT_NOT_PLANNED');
    if (await this.repository.hasInProgressSprint(teamId, sprintId))
      throw sprintErrorException('SPRINT_ALREADY_ACTIVE');
    if (
      await this.repository.hasPreviousUnclosedSprint(
        teamId,
        sprint.sprintNumber,
      )
    ) {
      throw sprintErrorException('PREVIOUS_SPRINT_PENDING');
    }
    const stories = await this.itemsRepository.findAll(
      'sprint_user_stories',
      sprintId,
    );
    if (stories.length === 0) {
      throw sprintErrorException('SPRINT_WITHOUT_STORIES');
    }
    return this.repository.startTransactional(teamId, sprintId);
  }

  async complete(teamId: string, sprintId: string) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (sprint.status === 'completed') {
      return this.repository.completeTransactional(teamId, sprintId);
    }
    if (sprint.status !== 'in_progress')
      throw sprintErrorException('SPRINT_NOT_IN_PROGRESS');
    if (this.today() < sprint.endDate) {
      throw sprintErrorException(
        'SPRINT_END_NOT_REACHED',
        `El sprint solo se puede completar a partir del ${sprint.endDate}`,
      );
    }
    return this.repository.completeTransactional(teamId, sprintId);
  }

  async closureSummary(teamId: string, sprintId: string) {
    const sprint = await this.requireSprint(teamId, sprintId);
    const next = await this.repository.findNextPlannedSprint(
      teamId,
      sprint.projectId,
      sprint.sprintNumber,
    );
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
          ['planned', 'in_progress', 'requires_attention', 'at_risk'].includes(
            item.status,
          ),
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
      nextSprint: next ? { id: next.id, name: next.name } : null,
      requiresNextSprint: pending.userStories.length > 0 && next === null,
      carryOverMessage:
        pending.userStories.length === 0
          ? 'No hay HU pendientes por mover.'
          : next
            ? `Las HU pendientes se moverán al ${next.name} con su mismo código y estado.`
            : 'Hay HU pendientes y no hay un siguiente sprint planificado del mismo proyecto. Créalo para poder completar.',
      counts: Object.fromEntries(
        Object.entries(pending).map(([key, values]) => [key, values.length]),
      ),
      pending,
    };
  }

  async dashboard(teamId: string, sprintId: string) {
    const dashboard = await this.repository.findDashboard(teamId, sprintId);
    if (!dashboard) throw sprintErrorException('SPRINT_NOT_FOUND');
    const [initiatives, stories, sprint, transfers, incomingTransfers] =
      await Promise.all([
        this.itemsRepository.countBySprint('sprint_initiatives', sprintId),
        this.itemsRepository.findAll('sprint_user_stories', sprintId),
        this.repository.findById(teamId, sprintId),
        this.repository.findTransfersOut(sprintId),
        this.repository.findTransfersIn(sprintId),
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
    const { addedAfterStart, scopePoints } = this.calculateScope(
      dashboard,
      stories,
      sprint?.closedScopePoints ?? null,
    );
    const currentStoryIds = new Set(stories.map((story) => String(story.id)));
    const destinations = new Map<
      string,
      { sprintId: string; sprintName: string; storyIds: Set<string> }
    >();
    for (const transfer of transfers) {
      if (currentStoryIds.has(transfer.storyId)) continue;
      let destination = destinations.get(transfer.targetSprintId);
      if (!destination) {
        destination = {
          sprintId: transfer.targetSprintId,
          sprintName: transfer.targetSprintName,
          storyIds: new Set(),
        };
        destinations.set(transfer.targetSprintId, destination);
      }
      destination.storyIds.add(transfer.storyId);
    }
    const transferredOut = [...destinations.values()]
      .sort((a, b) => a.sprintName.localeCompare(b.sprintName))
      .map(({ sprintId, sprintName, storyIds }) => ({
        sprintId,
        sprintName,
        count: storyIds.size,
      }));
    const latestTransfers = new Map<
      string,
      (typeof incomingTransfers)[number]
    >();
    for (const transfer of incomingTransfers) {
      if (!currentStoryIds.has(transfer.storyId)) continue;
      const previous = latestTransfers.get(transfer.storyId);
      if (
        !previous ||
        Date.parse(transfer.movedAt) > Date.parse(previous.movedAt)
      ) {
        latestTransfers.set(transfer.storyId, transfer);
      }
    }
    const origins = new Map<
      string,
      { sprintId: string; sprintName: string; count: number }
    >();
    for (const transfer of latestTransfers.values()) {
      const origin = origins.get(transfer.sourceSprintId) ?? {
        sprintId: transfer.sourceSprintId,
        sprintName: transfer.sourceSprintName,
        count: 0,
      };
      origin.count += 1;
      origins.set(transfer.sourceSprintId, origin);
    }
    const transferredIn = [...origins.values()].sort((a, b) =>
      a.sprintName.localeCompare(b.sprintName, undefined, { numeric: true }),
    );
    const pointsCompleted = Number(dashboard.stories.pointsCompleted ?? 0);
    const completionPercentage =
      scopePoints > 0
        ? Math.min(
            100,
            Math.round(((pointsCompleted * 100) / scopePoints) * 100) / 100,
          )
        : 0;
    const performanceScore = this.calculatePerformanceScore(
      {
        ...dashboard,
        initiatives: { total: initiatives },
      },
      scopePoints,
    );
    return {
      ...dashboard,
      sprint: {
        ...dashboard.sprint,
        closedScopePoints: sprint?.closedScopePoints ?? null,
      },
      initiatives: { total: initiatives },
      stories: {
        ...dashboard.stories,
        planned: storyCounts.planned,
        inProgress: storyCounts.inProgress,
        blocked: storyCounts.blocked,
        completed: storyCounts.completed,
        total: stories.length,
        transferredOut,
        transferredIn,
        addedAfterStart,
        scopePoints,
      },
      completionPercentage,
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
    if (!sprint) throw sprintErrorException('SPRINT_NOT_FOUND');
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
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    );
  }

  private toInitiativeDatabase(input: UpdateSprintInitiativeDto) {
    const fields: Record<string, string> = {
      startDate: 'start_date',
      plannedEndDate: 'planned_end_date',
      actualEndDate: 'actual_end_date',
      progressPercentage: 'progress_percentage',
      ownerId: 'owner_id',
    };
    return Object.fromEntries(
      Object.entries(input)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [fields[key] ?? key, value]),
    );
  }

  private sumStoryPoints(stories: Array<{ storyPoints?: number }>): number {
    return stories.reduce(
      (sum, story) => sum + Number(story.storyPoints ?? 0),
      0,
    );
  }

  public today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private calculateScope(
    dashboard: {
      sprint: { status: string; committedPoints?: number };
      stories: { pointsTotal?: number };
    },
    stories: Record<string, unknown>[],
    closedScopePoints: number | null,
  ) {
    const addedAfterStart = stories.reduce<{ count: number; points: number }>(
      (added, story) => {
        if (story.addedAfterStart === true) {
          added.count += 1;
          added.points += Number(story.storyPoints ?? 0);
        }
        return added;
      },
      { count: 0, points: 0 },
    );
    const scopePoints =
      closedScopePoints ??
      (dashboard.sprint.status === 'planned'
        ? Number(dashboard.stories.pointsTotal ?? 0)
        : Number(dashboard.sprint.committedPoints ?? 0) +
          addedAfterStart.points);
    return { addedAfterStart, scopePoints };
  }

  private calculatePerformanceScore(
    dashboard: any,
    scopePoints: number,
  ): number {
    const completed = Number(
      dashboard.stories?.pointsCompleted ??
        dashboard.sprint?.completedPoints ??
        0,
    );
    const delivery =
      scopePoints > 0 ? Math.min(100, (completed / scopePoints) * 100) : 0;

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
