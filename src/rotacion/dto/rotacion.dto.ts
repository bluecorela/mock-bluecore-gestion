import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RotarPersonalDto {
    @ApiProperty({ description: 'ID del personal a rotar', example: 'person-123' })
    @IsString()
    @IsNotEmpty()
    personalId: string;

    @ApiProperty({ description: 'ID del equipo destino', example: 'team-456' })
    @IsString()
    @IsNotEmpty()
    equipoDestinoId: string;

    @ApiProperty({ description: 'ID del equipo origen', example: 'team-789' })
    @IsString()
    @IsNotEmpty()
    equipoOrigenId: string;
}

export class VacacionesDto {
    @ApiProperty({ description: 'ID del personal que sale de vacaciones', example: 'person-123' })
    @IsString()
    @IsNotEmpty()
    personalId: string;

    @ApiProperty({ description: 'ID del equipo origen', example: 'team-789' })
    @IsString()
    @IsNotEmpty()
    equipoOrigenId: string;

    @ApiProperty({ description: 'ID del personal reemplazo (opcional)', example: 'person-999', required: false })
    @IsString()
    @IsOptional()
    reemplazoId?: string;
}

export class ReintegrarDto {
    @ApiProperty({ description: 'ID del personal a reintegrar', example: 'person-123' })
    @IsString()
    @IsNotEmpty()
    personalId: string;

    @ApiProperty({ description: 'ID del equipo destino (opcional)', example: 'team-456', required: false })
    @IsString()
    @IsOptional()
    equipoDestinoId?: string;

    @ApiProperty({ description: 'ID del equipo origen (opcional)', example: 'pool-de-vacaciones', required: false })
    @IsString()
    @IsOptional()
    equipoOrigenId?: string;
}
