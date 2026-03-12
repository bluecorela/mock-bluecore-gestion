import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEmail, IsOptional, IsIn } from 'class-validator';

export class CreatePersonalDto {
    @ApiProperty({
        description: 'Nombre del miembro',
        example: 'Juan Pérez'
    })
    @IsNotEmpty({ message: 'El nombre es obligatorio' })
    @IsString()
    nombre: string;

    @ApiProperty({
        description: 'Rol del miembro',
        enum: ['Admin', 'Arquitecto', 'Ingeniero de Software', 'Ingeniero de QA', 'Pasante'],
        example: 'Ingeniero de Software'
    })
    @IsNotEmpty({ message: 'El rol es obligatorio' })
    @IsIn(['Admin', 'Arquitecto', 'Ingeniero de Software', 'Ingeniero de QA', 'Pasante'])
    rol: string;

    @ApiProperty({
        description: 'Correo electrónico',
        required: false,
        example: 'juan@example.com'
    })
    @IsOptional()
    @IsEmail({}, { message: 'El correo debe ser válido' })
    correo?: string;

    @ApiProperty({
        description: 'ID del equipo',
        required: false,
        example: 'sgb-evolucion'
    })
    @IsOptional()
    @IsString()
    equipoId?: string;
}
