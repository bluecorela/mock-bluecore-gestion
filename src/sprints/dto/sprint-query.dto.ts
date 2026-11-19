import { IsDateString, IsIn, IsOptional, Matches } from 'class-validator';
import type { SprintStatus } from '../interfaces/sprint.interface';

export class SprintListQueryDto {
  @IsOptional()
  @IsIn(['planned', 'in_progress', 'completed', 'cancelled'])
  status?: SprintStatus;
}

export class SprintInitialContextQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  today?: string;
}
