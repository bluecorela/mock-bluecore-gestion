import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSprintDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

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

export class UpdateSprintDto extends PartialType(CreateSprintDto) {}

export class CompleteSprintDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  completedPoints?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wipStories?: number;
}
