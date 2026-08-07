import { IsDateString, IsOptional } from 'class-validator';

export class WeeklyReportContextQueryV2Dto {
  @IsOptional()
  @IsDateString()
  weekStart?: string;
}
