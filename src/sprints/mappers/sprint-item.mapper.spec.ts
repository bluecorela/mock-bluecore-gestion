import { InternalServerErrorException } from '@nestjs/common';
import { mapSprintItem } from './sprint-item.mapper';

describe('mapSprintItem', () => {
  it('maps snake case fields to camel case', () => {
    expect(
      mapSprintItem({
        id: 'story-id',
        story_points: 8,
        assigned_employee_id: 'employee-id',
      }),
    ).toEqual({
      id: 'story-id',
      storyPoints: 8,
      assignedEmployeeId: 'employee-id',
    });
  });

  it('rejects invalid database rows', () => {
    expect(() => mapSprintItem(null)).toThrow(InternalServerErrorException);
  });

  it('preserves a cancelled initiative status', () => {
    expect(
      mapSprintItem({
        status: 'cancelled',
        start_date: '2026-08-01',
        planned_end_date: '2026-08-31',
        progress_percentage: 100,
      }).status,
    ).toBe('cancelled');
  });
});
