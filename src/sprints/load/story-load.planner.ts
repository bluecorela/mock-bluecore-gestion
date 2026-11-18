import type { StoryLoadItemDto } from './story-load.dto';

export interface StoryLoadContext {
  sprint: { id: string; name: string; status: string };
  storiesInSprint: Array<{
    id: string;
    code: string;
    status: string;
    name: string;
    storyPoints: number;
    description: string | null;
    estimatedWorkDays: number | null;
    assignedEmployeeId: string | null;
  }>;
  codesElsewhere: Map<string, { sprintName: string; sameTeam: boolean }>;
  employeeIdByEmail: Map<string, string>;
  employeeEmailById: Map<string, string>;
}
export interface PlanRow {
  row: number;
  code: string | null;
  name: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  dbRow: Record<string, unknown>;
}
export interface StoryLoadPlan {
  creates: PlanRow[];
  updates: PlanRow[];
  errors: Array<{ row: number; code?: string; message: string }>;
}
export type StoryLoadPreview = Omit<StoryLoadPlan, 'creates' | 'updates'> & {
  creates: Omit<PlanRow, 'dbRow'>[];
  updates: Omit<PlanRow, 'dbRow'>[];
  confirmationToken: string | null;
  expiresAt: string | null;
};

export function normalizeStoryRows(
  rows: Partial<StoryLoadItemDto>[],
): Partial<StoryLoadItemDto>[] {
  return rows.map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).flatMap(([key, value]) => {
          if (typeof value === 'string') {
            value = value.trim();
            if (key === 'code') value = (value as string).toUpperCase();
            if (key === 'assigneeEmail')
              value = (value as string).toLowerCase();
          }
          return value === '' || value === null || value === undefined
            ? []
            : [[key, value]];
        }),
      ) as Partial<StoryLoadItemDto>,
  );
}

const fields: Record<string, string> = {
  code: 'code',
  name: 'name',
  description: 'description',
  storyPoints: 'story_points',
  estimatedWorkDays: 'estimated_work_days',
  assigneeEmail: 'assigned_employee_id',
  status: 'status',
};

export function planStoryLoad(
  input: Partial<StoryLoadItemDto>[],
  ctx: StoryLoadContext,
): StoryLoadPlan {
  const rows = normalizeStoryRows(input);
  const positions = new Map<string, number[]>();
  rows.forEach((row, i) => {
    if (row.code)
      positions.set(row.code, [...(positions.get(row.code) ?? []), i + 1]);
  });
  const plan: StoryLoadPlan = { creates: [], updates: [], errors: [] };
  rows.forEach((row, i) => {
    const current = row.code
      ? ctx.storiesInSprint.find((story) => story.code === row.code)
      : undefined;
    const elsewhere = row.code ? ctx.codesElsewhere.get(row.code) : undefined;
    const messages: string[] = [];
    const duplicates = row.code ? positions.get(row.code)! : [];
    if (duplicates.length > 1) {
      const list = `${duplicates.slice(0, -1).join(', ')} y ${duplicates.at(-1)}`;
      messages.push(
        `El código ${row.code} está repetido en la carga (filas ${list})`,
      );
    }
    if (elsewhere && !current)
      messages.push(
        elsewhere.sameTeam
          ? `${row.code} pertenece al ${elsewhere.sprintName}`
          : `${row.code} pertenece a otro equipo`,
      );
    if (row.assigneeEmail && !ctx.employeeIdByEmail.has(row.assigneeEmail))
      messages.push(
        `El responsable ${row.assigneeEmail} no pertenece al equipo`,
      );
    if (current && ['completed', 'cancelled'].includes(current.status))
      messages.push('No se puede actualizar una HU finalizada');
    if (
      ctx.sprint.status === 'planned' &&
      row.status !== undefined &&
      row.status !== 'planned'
    )
      messages.push(
        'En un sprint planificado las HU solo pueden estar Planificadas',
      );
    if (messages.length) {
      plan.errors.push(
        ...messages.map((message) => ({
          row: i + 1,
          ...(row.code ? { code: row.code } : {}),
          message,
        })),
      );
      return;
    }
    const dbRow: Record<string, unknown> = {};
    const changes: NonNullable<PlanRow['changes']> = {};
    for (const [key, dbKey] of Object.entries(fields)) {
      const value: unknown = row[key as keyof StoryLoadItemDto];
      if (value === undefined) continue;
      const to =
        key === 'assigneeEmail'
          ? ctx.employeeIdByEmail.get(String(value))!
          : value;
      dbRow[dbKey] = to;
      if (current && key !== 'code') {
        // Compare assignees by ID; display emails in the preview.
        const from =
          current[
            (key === 'assigneeEmail'
              ? 'assignedEmployeeId'
              : key) as keyof typeof current
          ];
        if (from !== to) {
          changes[key] =
            key === 'assigneeEmail'
              ? {
                  from:
                    from == null
                      ? null
                      : (ctx.employeeEmailById.get(String(from)) ??
                        'Fuera del equipo'),
                  to: value,
                }
              : { from, to };
        }
      }
    }
    const planned: PlanRow = {
      row: i + 1,
      code: row.code ?? null,
      name: row.name ?? current?.name ?? '',
      dbRow,
    };
    if (current) plan.updates.push({ ...planned, changes });
    else plan.creates.push(planned);
  });
  return plan;
}
