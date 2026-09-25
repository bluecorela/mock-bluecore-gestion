import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsNumber,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class SprintConfigurationDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsUUID()
  scrumMasterId?: string;

  @IsOptional()
  @IsUUID()
  architectId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  committedPoints?: number;

  @IsOptional()
  @IsString()
  objective?: string;
}

export class CreateSprintDto extends SprintConfigurationDto {
  @IsInt()
  @Min(1)
  @Max(200)
  userStoryCount!: number;
}

export class UpdateSprintDto extends PartialType(
  OmitType(CreateSprintDto, ['userStoryCount'] as const),
) {}
