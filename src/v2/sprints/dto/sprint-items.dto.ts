import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSprintInitiativeDto {
  @IsString() @MaxLength(180) name!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() plannedEndDate?: string;
  @IsOptional() @IsDateString() actualEndDate?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) progressPercentage?: number;
  @IsOptional()
  @IsIn(['planned', 'in_progress', 'requires_attention', 'at_risk', 'completed', 'cancelled'])
  status?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}
export class UpdateSprintInitiativeDto extends PartialType(
  CreateSprintInitiativeDto,
) {}

export class CreateSprintUserStoryDto {
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsString() @MaxLength(180) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsIn(['planned', 'in_progress', 'blocked', 'completed'])
  status?: string;
  @IsOptional() @IsNumber() @Min(0) storyPoints?: number;
  @IsOptional() @IsNumber() @Min(0) estimatedWorkDays?: number;
  @IsOptional() @IsUUID() assignedEmployeeId?: string;
}
export class UpdateSprintUserStoryDto extends PartialType(
  CreateSprintUserStoryDto,
) {}

export class MoveSprintUserStoryDto {
  @IsUUID()
  targetSprintId!: string;
}

export class CreateSprintBugDto {
  @IsIn(['bug', 'return']) type!: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsString() description!: string;
  @IsOptional() @IsUUID() storyId?: string;
  @IsIn(['low', 'medium', 'high', 'critical']) priority!: string;
  @IsDateString() detectedAt!: string;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status?: string;
  @IsOptional() @IsIn(['development', 'qa', 'production']) environment?: string;
  @IsOptional() @IsString() observations?: string;
}
export class UpdateSprintBugDto extends PartialType(CreateSprintBugDto) {}

export class CreateSprintRiskDto {
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsString() description!: string;
  @IsIn(['low', 'medium', 'high', 'critical']) impact!: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) probability?: string;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
  @IsOptional() @IsString() @MaxLength(180) responsibleName?: string;
  @IsOptional()
  @IsIn(['open', 'at_risk', 'monitoring', 'resolved', 'accepted', 'cancelled'])
  status?: string;
  @IsOptional() @IsString() mitigationPlan?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
export class UpdateSprintRiskDto extends PartialType(CreateSprintRiskDto) {}
