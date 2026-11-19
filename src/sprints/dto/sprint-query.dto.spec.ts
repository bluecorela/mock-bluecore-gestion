import { validate } from 'class-validator';
import {
  SprintInitialContextQueryDto,
  SprintListQueryDto,
} from './sprint-query.dto';

describe('Sprint query DTOs', () => {
  it('accepts a date-only reference', async () => {
    const query = new SprintInitialContextQueryDto();
    query.today = '2026-09-16';
    expect(await validate(query)).toHaveLength(0);
  });

  it('rejects a timestamp or invalid date as reference', async () => {
    const query = new SprintInitialContextQueryDto();
    query.today = '2026-09-16T12:00:00Z';
    expect(await validate(query)).not.toHaveLength(0);
    query.today = '2026-02-30';
    expect(await validate(query)).not.toHaveLength(0);
  });

  it('rejects unknown sprint statuses', async () => {
    const query = new SprintListQueryDto();
    query.status = 'unknown' as SprintListQueryDto['status'];
    expect(await validate(query)).not.toHaveLength(0);
  });
});
