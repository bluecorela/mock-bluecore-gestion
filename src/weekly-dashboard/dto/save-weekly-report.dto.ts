import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class WeeklyInitiativeDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage!: number;

  @IsIn(['planned', 'in_progress', 'at_risk', 'completed', 'cancelled'])
  status!: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class WeeklyRiskDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsIn(['low', 'medium', 'high', 'critical'])
  impact!: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  probability?: string;

  @IsOptional()
  @IsUUID()
  responsibleEmployeeId?: string;

  @IsIn(['open', 'at_risk', 'monitoring', 'resolved', 'accepted', 'cancelled'])
  status!: string;

  @IsOptional()
  @IsString()
  mitigationPlan?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ValidateIf(
    (risk: WeeklyRiskDto) =>
      risk.status === 'resolved' || risk.resolvedAt !== undefined,
  )
  @IsDateString()
  resolvedAt?: string;
}

export class WeeklyQualityDto {
  @IsInt()
  @Min(0)
  defectsFound!: number;

  @IsInt()
  @Min(0)
  productionDefects!: number;

  @IsInt()
  @Min(0)
  criticalDefects!: number;

  @IsInt()
  @Min(0)
  resolvedDefects!: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class SaveWeeklyReportDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsOptional()
  @IsUUID()
  scrumMasterId?: string;

  @IsOptional()
  @IsUUID()
  architectId?: string;

  @IsInt()
  @Min(1)
  @Max(53)
  weekNumber!: number;

  @IsDateString()
  weekStart!: string;

  @IsDateString()
  weekEnd!: string;

  @IsNumber()
  @Min(0)
  committedPoints!: number;

  @IsNumber()
  @Min(0)
  completedPoints!: number;

  @IsInt()
  @Min(0)
  wipStories!: number;

  @IsOptional()
  @IsIn(['draft', 'submitted'])
  status?: 'draft' | 'submitted';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyInitiativeDto)
  initiatives!: WeeklyInitiativeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyRiskDto)
  risks!: WeeklyRiskDto[];

  @ValidateNested()
  @Type(() => WeeklyQualityDto)
  quality!: WeeklyQualityDto;
}
