import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
} from 'class-validator';
import { AUTH_ROLES } from '../../auth/auth.constants';

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
    enum: [...AUTH_ROLES],
    example: 'Ingeniero de Software',
  })
  @IsNotEmpty({ message: 'El rol es obligatorio' })
  @IsIn([...AUTH_ROLES])
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
