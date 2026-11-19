import {
  normalizeStoryRows,
  planStoryLoad,
  StoryLoadContext,
} from './story-load.planner';
const row = { name: 'Historia', storyPoints: 3 };
const story = {
  id: 's',
  code: 'HU-7',
  status: 'in_progress',
  name: 'Antes',
  storyPoints: 3,
  description: null,
  estimatedWorkDays: null,
  assignedEmployeeId: 'e',
};
const context = (): StoryLoadContext => ({
  sprint: { id: 'sprint', name: 'Sprint-1', status: 'planned' },
  storiesInSprint: [{ ...story }],
  codesElsewhere: new Map(),
  employeeIdByEmail: new Map([['a@b.com', 'e']]),
  employeeEmailById: new Map([['e', 'a@b.com']]),
});
describe('story load planner', () => {
  it('normalizes strings, discards empty/null values and preserves order', () => {
    expect(
      normalizeStoryRows([
        {
          ...row,
          code: ' hu-7 ',
          name: ' Historia ',
          assigneeEmail: ' A@B.COM ',
          description: '',
          status: null,
        } as unknown as typeof row,
      ]),
    ).toEqual([{ ...row, code: 'HU-7', assigneeEmail: 'a@b.com' }]);
  });
  it('creates without code or status and leaves placeholders alone', () => {
    const plan = planStoryLoad([row], context());
    expect(plan.creates).toEqual([
      {
        row: 1,
        code: null,
        name: row.name,
        dbRow: { name: row.name, story_points: 3 },
      },
    ]);
    expect(plan.updates).toEqual([]);
  });
  it('mixes creates updates errors; only changed present fields are listed, comparing employee IDs', () => {
    const ctx = context();
    ctx.codesElsewhere.set('OTHER', { sprintName: 'Sprint-4', sameTeam: true });
    const plan = planStoryLoad(
      [
        row,
        { ...row, code: 'HU-7', assigneeEmail: 'a@b.com' },
        { ...row, code: 'OTHER' },
      ],
      ctx,
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates[0].changes).toEqual({
      name: { from: 'Antes', to: 'Historia' },
    });
    expect(plan.updates[0].dbRow).toEqual({
      code: 'HU-7',
      name: 'Historia',
      story_points: 3,
      assigned_employee_id: 'e',
    });
    expect(plan.errors).toEqual([
      { row: 3, code: 'OTHER', message: 'OTHER pertenece al Sprint-4' },
    ]);
  });
  it.each([
    [2, 'filas 1 y 2'],
    [3, 'filas 1, 2 y 3'],
  ])('marks all %i duplicate rows', (count, positions) => {
    const plan = planStoryLoad(
      Array.from({ length: count }, () => ({ ...row, code: 'HU-7' })),
      context(),
    );
    expect(plan.updates).toEqual([]);
    expect(plan.errors.map((e) => e.message)).toEqual(
      Array(count).fill(
        `El código HU-7 está repetido en la carga (${positions})`,
      ),
    );
  });
  it.each([
    [
      { assigneeEmail: 'x@y.com' },
      'El responsable x@y.com no pertenece al equipo',
    ],
    [
      { status: 'blocked' },
      'En un sprint planificado las HU solo pueden estar Planificadas',
    ],
  ])('reports invalid row %j', (extra, message) => {
    expect(
      planStoryLoad([{ ...row, ...extra } as typeof row], context()).errors[0]
        .message,
    ).toBe(message);
  });
  it('updates a destination story even if its legacy code also exists elsewhere', () => {
    const ctx = context();
    ctx.codesElsewhere.set('HU-7', { sprintName: 'Sprint-4', sameTeam: true });
    const plan = planStoryLoad([{ ...row, code: 'HU-7' }], ctx);
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toHaveLength(1);
  });
  it('hides names of other teams', () => {
    const ctx = context();
    ctx.codesElsewhere.set('HU-9', { sprintName: 'Secret', sameTeam: false });
    expect(
      planStoryLoad([{ ...row, code: 'HU-9' }], ctx).errors[0].message,
    ).toBe('HU-9 pertenece a otro equipo');
  });
  it.each(['completed', 'cancelled'])(
    'rejects finalized %s stories',
    (status) => {
      const ctx = context();
      ctx.storiesInSprint[0].status = status;
      expect(
        planStoryLoad([{ ...row, code: 'HU-7' }], ctx).errors[0].message,
      ).toBe('No se puede actualizar una HU finalizada');
    },
  );
});
