import { Type } from 'class-transformer';
import { StoryLoadItemDto } from '../load/story-load.dto';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
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
  @IsNumber()
  @Min(0)
  committedPoints?: number;

  @IsOptional()
  @IsString()
  objective?: string;
}

export class CreateSprintDto extends SprintConfigurationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  userStoryCount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StoryLoadItemDto)
  stories?: StoryLoadItemDto[];

  @IsOptional()
  @IsString()
  confirmationToken?: string;
}

export class PreviewSprintDto extends OmitType(CreateSprintDto, [
  'confirmationToken',
] as const) {}

export class UpdateSprintDto extends PartialType(
  OmitType(CreateSprintDto, [
    'userStoryCount',
    'stories',
    'confirmationToken',
  ] as const),
) {}
