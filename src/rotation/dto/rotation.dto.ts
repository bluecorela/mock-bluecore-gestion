import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RotatePersonnelDto {
    @ApiProperty({ description: 'ID del personal a rotar', example: 'person-123' })
    @IsString()
    @IsNotEmpty()
    personnelId: string;

    @ApiProperty({ description: 'ID del equipo destino', example: 'team-456' })
    @IsString()
    @IsNotEmpty()
    destinationTeamId: string;

    @ApiProperty({ description: 'ID del equipo origen', example: 'team-789' })
    @IsString()
    @IsNotEmpty()
    sourceTeamId: string;
}

export class VacationDto {
    @ApiProperty({ description: 'ID del personal que sale de vacaciones', example: 'person-123' })
    @IsString()
    @IsNotEmpty()
    personnelId: string;

    @ApiProperty({ description: 'ID del equipo origen', example: 'team-789' })
    @IsString()
    @IsNotEmpty()
    sourceTeamId: string;

    @ApiProperty({ description: 'ID del personal reemplazo (opcional)', example: 'person-999', required: false })
    @IsString()
    @IsOptional()
    replacementId?: string;
}

export class ReintegrateDto {
    @ApiProperty({ description: 'ID del personal a reintegrar', example: 'person-123' })
    @IsString()
    @IsNotEmpty()
    personnelId: string;

    @ApiProperty({ description: 'ID del equipo destino (opcional)', example: 'team-456', required: false })
    @IsString()
    @IsOptional()
    destinationTeamId?: string;

    @ApiProperty({ description: 'ID del equipo origen (opcional)', example: 'pool-de-vacaciones', required: false })
    @IsString()
    @IsOptional()
    sourceTeamId?: string;
}
