import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const SIDEBAR_ROLE_CODES = [
  'ADMIN',
  'ARCHITECT',
  'SCRUM_MASTER',
  'SOFTWARE_ENGINEER',
  'QA_ENGINEER',
  'WELLBEING_CREATOR',
  'INTERN',
] as const;

export class CreateSidebarModuleDto {
  @ApiProperty({ example: 'performance' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Evaluación de desempeño' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '/performance' })
  @IsString()
  @IsNotEmpty()
  route: string;

  @ApiPropertyOptional({ example: 'assessment' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: 4, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiProperty({
    enum: SIDEBAR_ROLE_CODES,
    isArray: true,
    example: ['ADMIN', 'ARCHITECT'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SIDEBAR_ROLE_CODES, { each: true })
  roleCodes: string[];
}

export class UpdateSidebarModuleDto extends PartialType(
  CreateSidebarModuleDto,
) {}
