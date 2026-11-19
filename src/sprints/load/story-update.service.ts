import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationService } from '../../organization/services/organization.service';
import { mapSprintItem } from '../mappers/sprint-item.mapper';
import { LoadConfirmationService } from './load-confirmation.service';
import { buildStoryEmployeeMaps } from './story-load.context';
import { UpdateStoryByCodeDto } from './story-load.dto';
import {
  normalizeStoryRows,
  planStoryLoad,
  StoryLoadContext,
} from './story-load.planner';
import { StoryLoadRepository } from './story-load.repository';

@Injectable()
export class StoryUpdateService {
  constructor(
    private readonly repository: StoryLoadRepository,
    private readonly organization: OrganizationService,
    private readonly confirmations: LoadConfirmationService,
  ) {}

  async previewByCode(
    code: string,
    user: AuthenticatedUser,
    dto: UpdateStoryByCodeDto,
  ) {
    const { match, input, ctx, row } = await this.prepare(code, user, dto);
    const plan = planStoryLoad([row], ctx);
    const issued = plan.errors.length ? null : this.confirmations.issue(input);
    return {
      story: {
        code: match.code,
        sprintId: match.sprint_id,
        sprintName: match.sprints.name,
        teamId: match.sprints.team_id,
        teamName: match.sprints.teams.name,
      },
      changes: plan.updates[0]?.changes ?? {},
      errors: plan.errors.map(({ message }) => message),
      confirmationToken: issued?.token ?? null,
      expiresAt: issued?.expiresAt ?? null,
    };
  }

  async applyByCode(
    code: string,
    user: AuthenticatedUser,
    dto: UpdateStoryByCodeDto,
  ) {
    const { match, input, ctx, row } = await this.prepare(code, user, dto);
    if (!dto.confirmationToken)
      throw new BadRequestException(
        'Falta confirmationToken; genera la vista previa primero',
      );
    const { confirmationId } = this.confirmations.verify(
      dto.confirmationToken,
      input,
    );
    const plan = planStoryLoad([row], ctx);
    if (plan.errors.length)
      throw new BadRequestException(plan.errors[0].message);
    const payload = { ...plan.updates[0].dbRow };
    delete payload.code;
    const result = await this.repository.updateStoryById(
      match.sprints.team_id,
      match.sprint_id,
      match.id,
      payload,
      confirmationId,
      input.employeeId,
    );
    return mapSprintItem(result);
  }

  private async prepare(
    code: string,
    user: AuthenticatedUser,
    dto: UpdateStoryByCodeDto,
  ) {
    if (!user.employeeId)
      throw new ForbiddenException('Tu usuario no tiene un empleado asociado');
    code = code.trim().toUpperCase();
    if (!code || code.length > 60)
      throw new BadRequestException(
        'El código debe tener entre 1 y 60 caracteres',
      );
    // Pick only update fields: neither the path code nor the token are payload changes.
    const [story] = normalizeStoryRows([
      {
        name: dto.name,
        description: dto.description,
        storyPoints: dto.storyPoints,
        estimatedWorkDays: dto.estimatedWorkDays,
        assigneeEmail: dto.assigneeEmail,
        status: dto.status,
      },
    ]);
    if (!Object.keys(story).length)
      throw new BadRequestException('No hay cambios para aplicar');
    const teamIds =
      user.role === 'Admin'
        ? null
        : (await this.organization.findTeamsForUser(user)).map(({ id }) => id);
    const matches =
      teamIds?.length === 0
        ? []
        : await this.repository.findOpenStoriesByCode(code, teamIds);
    if (!matches.length)
      throw new NotFoundException(
        `No existe una HU con el código ${code} en un sprint abierto de tus equipos`,
      );
    if (matches.length > 1) {
      const names = matches
        .map(({ sprints }) => sprints.name)
        .sort()
        .join(', ');
      throw new ConflictException(
        `El código ${code} aparece en varios sprints (${names}); corrígelo antes de actualizar`,
      );
    }
    const match = matches[0];
    await this.organization.assertTeamLeader(match.sprints.team_id, user, [
      'ARCHITECT',
      'SCRUM_MASTER',
    ]);
    const [employees, leaders] = await Promise.all([
      this.organization.findEmployees(match.sprints.team_id),
      this.organization.findTeamLeaders(match.sprints.team_id),
    ]);
    const employeeMaps = buildStoryEmployeeMaps(employees, leaders);
    const ctx: StoryLoadContext = {
      sprint: match.sprints,
      storiesInSprint: [
        {
          id: match.id,
          code: match.code,
          status: match.status,
          name: match.name,
          storyPoints: Number(match.story_points),
          description: match.description,
          estimatedWorkDays:
            match.estimated_work_days == null
              ? null
              : Number(match.estimated_work_days),
          assignedEmployeeId: match.assigned_employee_id,
        },
      ],
      codesElsewhere: new Map(),
      ...employeeMaps,
    };
    const employeeId =
      story.assigneeEmail &&
      employeeMaps.employeeIdByEmail.get(story.assigneeEmail);
    return {
      match,
      ctx,
      row: { code, ...story },
      input: {
        operation: 'story_update' as const,
        target: match.id,
        employeeId: user.employeeId,
        content: {
          sprintId: match.sprint_id,
          story,
          assignees:
            employeeId && story.assigneeEmail
              ? { [story.assigneeEmail]: employeeId }
              : {},
        },
      },
    };
  }
}
