import { InternalServerErrorException } from '@nestjs/common';
import type { SprintItemRecord } from '../interfaces/sprint-item.interface';
import { calculateInitiativeStatus } from './initiative-status.mapper';

export function mapSprintItem(row: unknown): SprintItemRecord {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new InternalServerErrorException(
      'Could not map an invalid sprint item',
    );
  }

  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    values[
      key.replace(/_([a-z])/g, (_, character: string) =>
        character.toUpperCase(),
      )
    ] = value;
  }

  if (
    values.progressPercentage !== undefined &&
    values.startDate &&
    values.plannedEndDate
  ) {
    values.status = calculateInitiativeStatus(
      String(values.startDate),
      String(values.plannedEndDate),
      Number(values.progressPercentage ?? 0),
      values.status,
    );
  }

  return values;
}
