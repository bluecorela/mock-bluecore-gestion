import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { AssignableRole, DesignateRow } from './user-admin.types';
import { normalizeEmail } from './user-admin.planner';
const roles = [
  'Arquitecto',
  'Scrum Master',
  'Ingeniero de Software',
  'Ingeniero de QA',
];
class EmailDto {
  @ApiProperty({ description: 'Correo de la persona' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Correo inválido' })
  correo!: string;
}
export class RoleRowDto extends EmailDto {
  @ApiProperty({ enum: roles })
  @IsIn(roles, {
    message:
      'El rol debe ser uno de los cuatro roles asignables; Admin solo se asigna desde la web',
  })
  rol!: AssignableRole;
}
export class CreateUserRowDto extends RoleRowDto {
  @ApiProperty({ description: 'Nombre de la persona' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre!: string;
  @ApiProperty({ description: 'UUID del equipo' })
  @IsUUID('all', { message: 'El equipo debe ser un UUID' })
  equipo_id!: string;
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean({ message: 'designar_como_lider debe ser booleano' })
  designar_como_lider?: boolean;
}
export class CreateUsersDto {
  @ApiProperty({ type: [CreateUserRowDto], minItems: 1, maxItems: 10 })
  @IsArray({ message: 'usuarios debe ser una lista' })
  @ArrayMinSize(1, { message: 'El lote debe tener entre 1 y 10 usuarios' })
  @ArrayMaxSize(10, { message: 'El lote debe tener entre 1 y 10 usuarios' })
  @ValidateNested({ each: true })
  @Type(() => CreateUserRowDto)
  usuarios!: CreateUserRowDto[];
}
export class MoveRowDto extends EmailDto {
  @ApiProperty({ description: 'UUID del equipo destino' })
  @IsUUID('all', { message: 'El destino debe ser un UUID' })
  equipo_destino_id!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID('all', { message: 'El origen debe ser un UUID' })
  equipo_origen_id?: string;
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean({ message: 'designar_como_lider debe ser booleano' })
  designar_como_lider?: boolean;
}
export class DesignateRowDto extends EmailDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID('all', { message: 'El origen debe ser un UUID' })
  equipo_origen_id?: string;

  @ApiProperty({ description: 'UUID del equipo' })
  @IsUUID('all', { message: 'El equipo debe ser un UUID' })
  equipo_id!: string;
  @ApiProperty({ enum: ['Arquitecto', 'Scrum Master'] })
  @IsIn(['Arquitecto', 'Scrum Master'], {
    message: 'Solo se puede designar Arquitecto o Scrum Master',
  })
  rol!: DesignateRow['rol'];
}
export class ApplyCreateUserDto {
  @ApiProperty({ type: CreateUserRowDto })
  @IsObject({ message: 'usuario debe ser un objeto' })
  @IsNotEmpty({ message: 'usuario es obligatorio' })
  @ValidateNested()
  @Type(() => CreateUserRowDto)
  usuario!: CreateUserRowDto;
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'La confirmación es obligatoria' })
  confirmationToken!: string;
}
export class ApplyRoleDto extends RoleRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'La confirmación es obligatoria' })
  confirmationToken!: string;
}
export class ApplyMoveDto extends MoveRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'La confirmación es obligatoria' })
  confirmationToken!: string;
}
export class ApplyDesignateDto extends DesignateRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'La confirmación es obligatoria' })
  confirmationToken!: string;
}
export class FindUsersDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  texto?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID('all', { message: 'El equipo debe ser un UUID' })
  equipo_id?: string;
}
