import { InternalServerErrorException } from '@nestjs/common';
import type { Sprint, SprintStatus } from '../interfaces/sprint.interface';
import { calculateInitiativeStatus } from './initiative-status.mapper';

type DatabaseRow = Record<string, unknown>;

function field<T>(row: DatabaseRow, name: string): T {
  return row[name] as T;
}

export function mapSprint(value: unknown): Sprint {
  const row = asDatabaseRow(value, 'sprint');
  return {
    id: field<string>(row, 'id'),
    teamId: field<string>(row, 'team_id'),
    projectId: field<string>(row, 'project_id'),
    sprintNumber: field<number>(row, 'sprint_number'),
    name: field<string>(row, 'name'),
    objective: field<string | null>(row, 'objective'),
    status: field<SprintStatus>(row, 'status'),
    startDate: field<string>(row, 'start_date'),
    endDate: field<string>(row, 'end_date'),
    committedPoints: field<number>(row, 'committed_points'),
    completedPoints: field<number>(row, 'completed_points'),
    wipStories: field<number>(row, 'wip_stories'),
    scrumMasterId: field<string | null>(row, 'scrum_master_id'),
    architectId: field<string | null>(row, 'architect_id'),
    closedAt: field<string | null>(row, 'closed_at'),
    createdAt: field<string>(row, 'created_at'),
    updatedAt: field<string>(row, 'updated_at'),
  };
}

export function mapTeamInitiative(value: unknown): Record<string, unknown> {
  const row = asDatabaseRow(value, 'team initiative');
  const mapped = mapCamelCaseRow(row);
  if (
    mapped.startDate &&
    mapped.plannedEndDate &&
    mapped.progressPercentage !== undefined
  ) {
    mapped.status = calculateInitiativeStatus(
      String(mapped.startDate),
      String(mapped.plannedEndDate),
      Number(mapped.progressPercentage ?? 0),
      mapped.status,
    );
  }
  return mapped;
}

export function mapDashboard(value: unknown) {
  const row = asDatabaseRow(value, 'sprint dashboard');
  return {
    sprint: {
      id: field<string>(row, 'sprint_id'),
      teamId: field<string>(row, 'team_id'),
      projectId: field<string>(row, 'project_id'),
      sprintNumber: field<number>(row, 'sprint_number'),
      name: field<string>(row, 'name'),
      objective: field<string | null>(row, 'objective'),
      status: field<SprintStatus>(row, 'status'),
      startDate: field<string>(row, 'start_date'),
      endDate: field<string>(row, 'end_date'),
      plannedHistoryCount: field<number>(row, 'planned_history_count'),
      inProgressHistoryCount: field<number>(row, 'in_progress_history_count'),
      blockedHistoryCount: field<number>(row, 'blocked_history_count'),
      completedHistoryCount: field<number>(row, 'completed_history_count'),
      committedPoints: field<number>(row, 'committed_points'),
      completedPoints: field<number>(row, 'completed_points'),
      wipStories: field<number>(row, 'wip_stories'),
      scrumMasterId: field<string | null>(row, 'scrum_master_id'),
      architectId: field<string | null>(row, 'architect_id'),
    },
    stories: {
      total: field<number>(row, 'stories_total'),
      planned: field<number>(row, 'stories_planned'),
      inProgress: field<number>(row, 'stories_in_progress'),
      completed: field<number>(row, 'stories_completed'),
      blocked: field<number>(row, 'stories_blocked'),
      pointsTotal: field<number>(row, 'story_points_total'),
      pointsCompleted: field<number>(row, 'story_points_completed'),
    },
    bugs: {
      total: field<number>(row, 'bugs_total'),
      open: field<number>(row, 'bugs_open'),
      resolved: field<number>(row, 'bugs_resolved'),
      critical: field<number>(row, 'bugs_critical'),
      returns: field<number>(row, 'returns_total'),
      production: field<number>(row, 'production_bugs'),
    },
    risks: {
      active: field<number>(row, 'risks_active'),
      highImpact: field<number>(row, 'risks_high_impact'),
    },
    completionPercentage: field<number>(row, 'completion_percentage'),
  };
}

function mapCamelCaseRow(row: DatabaseRow): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, character: string) =>
        character.toUpperCase(),
      ),
      value,
    ]),
  );
}

function asDatabaseRow(value: unknown, resource: string): DatabaseRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InternalServerErrorException(
      `Could not map an invalid ${resource}`,
    );
  }
  return value as DatabaseRow;
}
