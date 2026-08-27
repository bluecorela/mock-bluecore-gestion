import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
} from 'class-validator';

export class CreatePersonnelDto {
  @ApiProperty({
    description: 'Nombre del miembro',
    example: 'Juan Pérez',
  })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Rol del miembro',
    enum: [
      'Admin',
      'Arquitecto',
      'Scrum Master',
      'Ingeniero de Software',
      'Ingeniero de QA',
      'Creador de Bienestar',
      'Pasante',
    ],
    example: 'Ingeniero de Software',
  })
  @IsNotEmpty({ message: 'El rol es obligatorio' })
  @IsIn([
    'Admin',
    'Arquitecto',
    'Scrum Master',
    'Ingeniero de Software',
    'Ingeniero de QA',
    'Creador de Bienestar',
    'Pasante',
  ])
  role: string;

  @ApiProperty({
    description: 'Correo electrónico',
    required: true,
    example: 'juan@example.com',
  })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  @IsEmail({}, { message: 'El correo debe ser válido' })
  email: string;

  @ApiProperty({
    description: 'ID del equipo',
    required: false,
    example: 'sgb-evolucion',
  })
  @IsOptional()
  @IsString()
  teamId?: string;
}
