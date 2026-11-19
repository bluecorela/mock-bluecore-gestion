import { sprintErrorException } from '../sprint-error-codes';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationService } from '../../organization/services/organization.service';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import { SprintsRepository } from '../repositories/sprints.repository';
import { LoadConfirmationService } from './load-confirmation.service';
import { StoryLoadDto } from './story-load.dto';
import {
  normalizeStoryRows,
  planStoryLoad,
  StoryLoadContext,
  StoryLoadPreview,
} from './story-load.planner';
import { buildStoryEmployeeMaps } from './story-load.context';
import { StoryLoadRepository } from './story-load.repository';

@Injectable()
export class StoryLoadService {
  constructor(
    private readonly repository: StoryLoadRepository,
    private readonly sprintRepository: SprintsRepository,
    private readonly itemsRepository: SprintItemsRepository,
    private readonly organization: OrganizationService,
    private readonly confirmations: LoadConfirmationService,
  ) {}

  async preview(
    teamId: string,
    sprintId: string,
    user: AuthenticatedUser,
    dto: StoryLoadDto,
  ): Promise<StoryLoadPreview> {
    const input = this.confirmationInput(sprintId, user, dto);
    const ctx = await this.context(teamId, sprintId, input.content.stories);
    input.content.assignees = this.resolveAssignees(input.content.stories, ctx);
    input.content.targets = this.resolveTargets(input.content.stories, ctx);
    const plan = planStoryLoad(input.content.stories, ctx);
    const issued = plan.errors.length ? null : this.confirmations.issue(input);
    const publicRow = (row: (typeof plan.creates)[number]) => ({
      row: row.row,
      code: row.code,
      name: row.name,
      ...(row.changes ? { changes: row.changes } : {}),
    });
    return {
      creates: plan.creates.map(publicRow),
      updates: plan.updates.map(publicRow),
      errors: plan.errors,
      confirmationToken: issued?.token ?? null,
      expiresAt: issued?.expiresAt ?? null,
    };
  }

  async apply(
    teamId: string,
    sprintId: string,
    user: AuthenticatedUser,
    dto: StoryLoadDto,
  ) {
    const input = this.confirmationInput(sprintId, user, dto);
    // Closed sprints always fail before token verification or planning.
    const ctx = await this.context(teamId, sprintId, input.content.stories);
    input.content.assignees = this.resolveAssignees(input.content.stories, ctx);
    input.content.targets = this.resolveTargets(input.content.stories, ctx);
    if (!dto.confirmationToken)
      throw new BadRequestException(
        'Falta confirmationToken; genera la vista previa primero',
      );
    const { confirmationId } = this.confirmations.verify(
      dto.confirmationToken,
      input,
    );
    const plan = planStoryLoad(input.content.stories, ctx);
    if (plan.errors.length) {
      const first = plan.errors[0];
      throw new BadRequestException(`Fila ${first.row}: ${first.message}`);
    }
    // Preserve input order, including mixed creates and updates.
    const rows = [...plan.creates, ...plan.updates]
      .sort((a, b) => a.row - b.row)
      .map((row) => ({
        ...row.dbRow,
        expected_id: input.content.targets[row.row - 1],
      }));
    return this.repository.apply(
      teamId,
      sprintId,
      rows,
      confirmationId,
      input.employeeId,
    );
  }

  async previewNewSprint(
    teamId: string,
    user: AuthenticatedUser,
    sprint: Record<string, unknown>,
    dto: StoryLoadDto,
  ): Promise<StoryLoadPreview> {
    const { input, ctx } = await this.newSprintInput(teamId, user, sprint, dto);
    const plan = planStoryLoad(input.content.stories, ctx);
    const issued = plan.errors.length ? null : this.confirmations.issue(input);
    return {
      creates: plan.creates.map(({ row, code, name }) => ({ row, code, name })),
      updates: [],
      errors: plan.errors,
      confirmationToken: issued?.token ?? null,
      expiresAt: issued?.expiresAt ?? null,
    };
  }

  async applyNewSprint(
    teamId: string,
    user: AuthenticatedUser,
    sprint: Record<string, unknown>,
    payload: Record<string, unknown>,
    dto: StoryLoadDto,
  ) {
    if (!dto.confirmationToken)
      throw new BadRequestException(
        'Falta confirmationToken; genera la vista previa primero',
      );
    const { input, ctx } = await this.newSprintInput(teamId, user, sprint, dto);
    const { confirmationId } = this.confirmations.verify(
      dto.confirmationToken,
      input,
    );
    const plan = planStoryLoad(input.content.stories, ctx);
    if (plan.errors.length) {
      const first = plan.errors[0];
      throw new BadRequestException(`Fila ${first.row}: ${first.message}`);
    }
    return this.sprintRepository.createWithStoryLoad(
      teamId,
      payload,
      plan.creates
        .sort((a, b) => a.row - b.row)
        .map(({ dbRow }) => ({ ...dbRow, expected_id: null })),
      confirmationId,
      input.employeeId,
    );
  }

  private async newSprintInput(
    teamId: string,
    user: AuthenticatedUser,
    sprint: Record<string, unknown>,
    dto: StoryLoadDto,
  ) {
    if (!user.employeeId)
      throw new ForbiddenException('Tu usuario no tiene un empleado asociado');
    const stories = normalizeStoryRows(dto.stories);
    const ctx = await this.context(teamId, '', stories);
    const normalizedSprint = Object.fromEntries(
      Object.entries(sprint)
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() : value,
        ])
        .filter(
          ([, value]) => value !== '' && value !== null && value !== undefined,
        ),
    );
    return {
      ctx,
      input: {
        operation: 'sprint_create' as const,
        target: teamId,
        employeeId: user.employeeId,
        content: {
          sprint: normalizedSprint,
          stories,
          assignees: this.resolveAssignees(stories, ctx),
          targets: stories.map(() => null),
        },
      },
    };
  }

  private confirmationInput(
    sprintId: string,
    user: AuthenticatedUser,
    dto: StoryLoadDto,
  ) {
    if (!user.employeeId)
      throw new ForbiddenException('Tu usuario no tiene un empleado asociado');
    return {
      operation: 'stories_bulk' as const,
      target: sprintId,
      employeeId: user.employeeId,
      content: {
        stories: normalizeStoryRows(dto.stories),
        assignees: {} as Record<string, string>,
        targets: [] as Array<string | null>,
      },
    };
  }

  private resolveTargets(
    rows: Partial<StoryLoadDto['stories'][number]>[],
    ctx: StoryLoadContext,
  ): Array<string | null> {
    return rows.map(({ code }) =>
      code
        ? (ctx.storiesInSprint.find((story) => story.code === code)?.id ?? null)
        : null,
    );
  }

  private resolveAssignees(
    rows: Partial<StoryLoadDto['stories'][number]>[],
    ctx: StoryLoadContext,
  ): Record<string, string> {
    return Object.fromEntries(
      rows.flatMap(({ assigneeEmail }) => {
        const id = assigneeEmail && ctx.employeeIdByEmail.get(assigneeEmail);
        return id ? [[assigneeEmail, id]] : [];
      }),
    );
  }

  private async context(
    teamId: string,
    sprintId: string,
    rows: Partial<StoryLoadDto['stories'][number]>[],
  ): Promise<StoryLoadContext> {
    const codes = [
      ...new Set(rows.flatMap((row) => (row.code ? [row.code] : []))),
    ];
    const [sprint, stories, matches, employees, leaders] = await Promise.all([
      sprintId
        ? this.requireWritableSprint(teamId, sprintId)
        : Promise.resolve({ id: '', name: 'Sprint nuevo', status: 'planned' }),
      sprintId
        ? this.itemsRepository.findAll('sprint_user_stories', sprintId)
        : Promise.resolve([]),
      codes.length
        ? this.repository.findStoriesByCodes(codes)
        : Promise.resolve([]),
      this.organization.findEmployees(teamId),
      this.organization.findTeamLeaders(teamId),
    ]);
    const codesElsewhere: StoryLoadContext['codesElsewhere'] = new Map();
    // Historical duplicates: select deterministically by sprint name, then sprint ID.
    for (const match of [...matches].sort(
      (a, b) =>
        a.sprints.name.localeCompare(b.sprints.name) ||
        a.sprint_id.localeCompare(b.sprint_id),
    )) {
      if (match.sprint_id !== sprintId && !codesElsewhere.has(match.code))
        codesElsewhere.set(match.code, {
          sprintName: match.sprints.name,
          sameTeam: match.sprints.team_id === teamId,
        });
    }
    const employeeMaps = buildStoryEmployeeMaps(employees, leaders);
    return {
      sprint,
      codesElsewhere,
      ...employeeMaps,
      storiesInSprint: stories.map((story) => ({
        id: String(story.id),
        code: String(story.code),
        status: String(story.status),
        name: String(story.name),
        storyPoints: Number(story.storyPoints),
        description:
          story.description == null ? null : String(story.description),
        estimatedWorkDays:
          story.estimatedWorkDays == null
            ? null
            : Number(story.estimatedWorkDays),
        assignedEmployeeId:
          story.assignedEmployeeId == null
            ? null
            : String(story.assignedEmployeeId),
      })),
    };
  }

  private async requireWritableSprint(teamId: string, sprintId: string) {
    const sprint = await this.sprintRepository.findById(teamId, sprintId);
    if (!sprint) throw sprintErrorException('SPRINT_NOT_FOUND');
    if (sprint.status === 'completed' || sprint.status === 'cancelled')
      throw sprintErrorException('SPRINT_COMPLETED');
    return sprint;
  }
}
