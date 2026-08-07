import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAuthUserDto {
  @ApiProperty({ description: 'Nombre del usuario', example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Correo electrónico', example: 'juan@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Contraseña temporal o definitiva',
    example: 'Cambiar123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'Rol del usuario',
    enum: ['Admin', 'Arquitecto', 'Scrum Master', 'Ingeniero de Software', 'Ingeniero de QA', 'Creador de Bienestar', 'Pasante'],
    example: 'Ingeniero de Software',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['Admin', 'Arquitecto', 'Scrum Master', 'Ingeniero de Software', 'Ingeniero de QA', 'Creador de Bienestar', 'Pasante'])
  role: string;

  @ApiProperty({
    description: 'ID del equipo',
    required: false,
    example: 'sgb-evolucion',
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    description: 'Confirmar automáticamente el correo en Supabase Auth',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  emailConfirm?: boolean;

  @ApiProperty({
    description: 'Enviar correo con contraseña temporal',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  sendPasswordEmail?: boolean;
}
