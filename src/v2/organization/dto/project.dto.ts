import { PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateProjectV2Dto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['planned', 'active', 'on_hold', 'completed', 'cancelled'])
  status?: 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;
}

export class UpdateProjectV2Dto extends PartialType(CreateProjectV2Dto) {}
