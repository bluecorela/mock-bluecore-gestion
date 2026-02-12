import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateEquipoDto {
    @ApiProperty({
        description: 'Nombre del equipo',
        example: 'SGB Evolución',
    })
    @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
    @IsString({ message: 'El nombre debe ser un texto' })
    nombre: string;
}
