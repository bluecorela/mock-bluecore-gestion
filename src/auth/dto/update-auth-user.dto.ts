import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAuthUserDto {
  @ApiPropertyOptional({ description: 'Nombre del usuario', example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'juan@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Nueva contraseña',
    example: 'Cambiar123!',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description: 'Rol del usuario',
    enum: ['Admin', 'Arquitecto', 'Scrum Master', 'Ingeniero de Software', 'Ingeniero de QA', 'Creador de Bienestar', 'Pasante'],
    example: 'Ingeniero de Software',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Admin', 'Arquitecto', 'Scrum Master', 'Ingeniero de Software', 'Ingeniero de QA', 'Creador de Bienestar', 'Pasante'])
  role?: string;

  @ApiPropertyOptional({
    description: 'ID del equipo. Enviar null para quitar equipo.',
    example: 'sgb-evolucion',
    nullable: true,
  })
  @IsOptional()
  teamId?: string | null;

  @ApiPropertyOptional({
    description: 'Estado del usuario',
    enum: ['activo', 'inactivo'],
    example: 'activo',
  })
  @IsOptional()
  @IsString()
  @IsIn(['activo', 'inactivo'])
  status?: 'activo' | 'inactivo';

  @ApiPropertyOptional({
    description: 'Confirmar automáticamente el correo si se cambia en Supabase Auth',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  emailConfirm?: boolean;

  @ApiPropertyOptional({
    description: 'Enviar correo con contraseña temporal si se actualiza la contraseña',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  sendPasswordEmail?: boolean;
}
