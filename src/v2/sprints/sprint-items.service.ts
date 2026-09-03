import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateSprintBugDto,
  CreateSprintInitiativeDto,
  CreateSprintRiskDto,
  CreateSprintUserStoryDto,
  UpdateSprintBugDto,
  UpdateSprintInitiativeDto,
  UpdateSprintRiskDto,
  UpdateSprintUserStoryDto,
} from './dto/sprint-items.dto';
import { SprintItemsRepository } from './sprint-items.repository';
import { SprintsRepository } from './sprints.repository';

const tables = {
  initiatives: 'sprint_initiatives',
  stories: 'sprint_user_stories',
  bugs: 'sprint_bugs',
  risks: 'sprint_risks',
} as const;
type ItemKind = keyof typeof tables;

@Injectable()
export class SprintItemsService {
  constructor(
    private readonly repository: SprintItemsRepository,
    private readonly sprintRepository: SprintsRepository,
  ) {}

  async findAll(teamId: string, sprintId: string, kind: ItemKind) {
    await this.requireSprint(teamId, sprintId);
    return this.repository.findAll(tables[kind], sprintId);
  }

  async create(
    teamId: string,
    sprintId: string,
    kind: ItemKind,
    input:
      | CreateSprintInitiativeDto
      | CreateSprintUserStoryDto
      | CreateSprintBugDto
      | CreateSprintRiskDto,
  ) {
    const sprint = await this.requireWritableSprint(teamId, sprintId);
    if ((kind === 'bugs' || kind === 'risks') && sprint.status !== 'in_progress') {
      throw new BadRequestException(
        'Los bugs, devoluciones, riesgos y bloqueos solo se pueden crear en un sprint en progreso',
      );
    }
    const payload = this.toDatabase(
      kind,
      input as unknown as Record<string, unknown>,
    );
    if (kind === 'initiatives') {
      const initiativeInput = input as CreateSprintInitiativeDto;
      let master = await this.sprintRepository.findTeamInitiative(
        teamId,
        sprint.projectId,
        initiativeInput.name,
      );
      if (!master) {
        master = await this.sprintRepository.createTeamInitiative({
          team_id: teamId,
          project_id: sprint.projectId,
          name: initiativeInput.name,
          description: initiativeInput.description ?? null,
          start_date: initiativeInput.startDate,
          planned_end_date: initiativeInput.plannedEndDate ?? null,
          actual_end_date: initiativeInput.actualEndDate ?? null,
          progress_percentage: initiativeInput.progressPercentage ?? 0,
          status: initiativeInput.status ?? 'planned',
          owner_id: initiativeInput.ownerId ?? null,
        });
      }
      payload.initiative_id = master.id;
    }
    if (kind === 'stories')
      payload.code = await this.repository.nextCode(tables.stories, 'HU');
    if (kind === 'bugs') {
      const type = String(payload.type ?? 'bug');
      payload.code = await this.repository.nextCode(
        tables.bugs,
        type === 'return' ? 'RET' : 'BUG',
      );
    }
    if (kind === 'risks')
      payload.code = await this.repository.nextCode(tables.risks, 'RISK');
    if (
      (payload.status === 'resolved' || payload.status === 'closed') &&
      !payload.resolved_at
    )
      payload.resolved_at = new Date().toISOString();
    if (
      kind === 'stories' &&
      payload.status === 'completed' &&
      !payload.completed_at
    )
      payload.completed_at = new Date().toISOString();
    return this.repository.create(tables[kind], {
      sprint_id: sprintId,
      ...payload,
    });
  }

  async update(
    teamId: string,
    sprintId: string,
    itemId: string,
    kind: ItemKind,
    input:
      | UpdateSprintInitiativeDto
      | UpdateSprintUserStoryDto
      | UpdateSprintBugDto
      | UpdateSprintRiskDto,
  ) {
    const sprint = await this.requireWritableSprint(teamId, sprintId);
    const currentItems =
      kind === 'initiatives'
        ? await this.repository.findAll(tables.initiatives, sprintId)
        : [];
    const currentInitiative = currentItems.find((item) => item.id === itemId);
    if (kind === 'stories') {
      const currentItems = await this.repository.findAll(tables.stories, sprintId);
      const current = currentItems.find((item) => item.id === itemId);
      if (current?.status === 'completed') {
        throw new BadRequestException(
          'No se puede actualizar una HU finalizada',
        );
      }
      if (sprint.status === 'planned' && input.status !== undefined) {
      if (current && input.status !== current.status) {
        throw new BadRequestException(
          'No se puede cambiar el estado de una HU en un sprint planificado',
        );
      }
      }
    }
    const payload = this.toDatabase(
      kind,
      input as unknown as Record<string, unknown>,
    );
    if (kind === 'initiatives' && currentInitiative?.initiativeId) {
      const masterFields = { ...payload };
      delete masterFields.initiative_id;
      await this.sprintRepository.updateTeamInitiative(
        String(currentInitiative.initiativeId),
        masterFields,
      );
    }
    if (
      (payload.status === 'resolved' || payload.status === 'closed') &&
      !payload.resolved_at
    )
      payload.resolved_at = new Date().toISOString();
    if (
      kind === 'stories' &&
      payload.status === 'completed' &&
      !payload.completed_at
    )
      payload.completed_at = new Date().toISOString();
    const row = await this.repository.update(
      tables[kind],
      sprintId,
      itemId,
      payload,
    );
    if (!row) throw new NotFoundException('Registro del sprint no encontrado');
    return row;
  }

  async remove(
    teamId: string,
    sprintId: string,
    itemId: string,
    kind: ItemKind,
  ) {
    await this.requireWritableSprint(teamId, sprintId);
    if (!(await this.repository.remove(tables[kind], sprintId, itemId)))
      throw new NotFoundException('Registro del sprint no encontrado');
  }

  async moveStory(
    teamId: string,
    sourceSprintId: string,
    storyId: string,
    targetSprintId: string,
  ) {
    const source = await this.requireWritableSprint(teamId, sourceSprintId);
    const target = await this.requireWritableSprint(teamId, targetSprintId);
    if (source.id === target.id)
      throw new BadRequestException('La historia ya pertenece a este sprint');
    const story = await this.repository.moveStory(
      sourceSprintId,
      storyId,
      targetSprintId,
    );
    if (!story)
      throw new NotFoundException('Historia de usuario no encontrada');
    return story;
  }

  private async requireSprint(teamId: string, sprintId: string) {
    const sprint = await this.sprintRepository.findById(teamId, sprintId);
    if (!sprint) throw new NotFoundException('Sprint not found');
    return sprint;
  }

  private async requireWritableSprint(teamId: string, sprintId: string) {
    const sprint = await this.requireSprint(teamId, sprintId);
    if (sprint.status === 'completed' || sprint.status === 'cancelled')
      throw new BadRequestException('No se puede modificar un sprint cerrado');
    return sprint;
  }

  private toDatabase(kind: ItemKind, input: Record<string, unknown>) {
    const fields: Record<ItemKind, Record<string, string>> = {
      initiatives: {
        startDate: 'start_date',
        plannedEndDate: 'planned_end_date',
        actualEndDate: 'actual_end_date',
        progressPercentage: 'progress_percentage',
        ownerId: 'owner_id',
      },
      stories: {
        storyPoints: 'story_points',
        estimatedWorkDays: 'estimated_work_days',
        assignedEmployeeId: 'assigned_employee_id',
      },
      bugs: {
        responsibleEmployeeId: 'responsible_employee_id',
        storyId: 'story_id',
        detectedAt: 'detected_at',
      },
      risks: {
        responsibleEmployeeId: 'responsible_employee_id',
        responsibleName: 'responsible_name',
        mitigationPlan: 'mitigation_plan',
        dueDate: 'due_date',
      },
    };
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) result[fields[kind][key] ?? key] = value;
    return result;
  }
}
