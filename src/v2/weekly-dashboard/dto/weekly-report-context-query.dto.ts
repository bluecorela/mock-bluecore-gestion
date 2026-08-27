import { IsDateString, IsOptional } from 'class-validator';

export class WeeklyReportContextQueryDto {
  @IsOptional()
  @IsDateString()
  weekStart?: string;
}
