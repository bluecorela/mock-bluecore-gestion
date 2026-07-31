import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsObject, IsNumber, IsOptional } from 'class-validator';

export class SoftSkillAnswerDto {
    @ApiProperty({ description: 'Calificación de la habilidad', example: 3 })
    @IsNumber()
    @IsNotEmpty()
    rating: number;

    @ApiProperty({ description: 'Comentario opcional', example: 'Excelente proactividad', required: false })
    @IsString()
    @IsOptional()
    comment?: string;
}

export class OtoSummaryDto {
    @ApiProperty({ description: 'Total de tareas asignadas', example: 10 })
    @IsNumber()
    @IsNotEmpty()
    totalAssignedTasks: number;

    @ApiProperty({ description: 'Porcentaje de tareas entregadas', example: 90 })
    @IsNumber()
    @IsNotEmpty()
    assignedDeliveredPercentage: number;

    @ApiProperty({ description: 'Porcentaje de tareas devueltas', example: 5 })
    @IsNumber()
    @IsNotEmpty()
    deliveredReturnedPercentage: number;

    @ApiProperty({ description: 'Porcentaje de calidad del código', example: 95 })
    @IsNumber()
    @IsNotEmpty()
    codeQualityPercentage: number;

    @ApiProperty({ description: 'Promedio total final de los sprints', example: 88.5 })
    @IsNumber()
    @IsNotEmpty()
    averageFinalTotal: number;
}

export class CreateOtoEvaluationDto {
    @ApiProperty({ description: 'ID del equipo', example: 'sgb-evolucion' })
    @IsString()
    @IsNotEmpty()
    teamId: string;

    @ApiProperty({ description: 'Nombre del evaluador', example: 'Luis Salgado' })
    @IsString()
    @IsNotEmpty()
    evaluatorName: string;

    @ApiProperty({ description: 'Nombre del ingeniero evaluado', example: 'Juan Pérez' })
    @IsString()
    @IsNotEmpty()
    engineerName: string;

    @ApiProperty({ description: 'Número de evaluación (1, 2, etc.)', example: 1, required: false })
    @IsNumber()
    @IsOptional()
    evaluationNumber?: number;

    @ApiProperty({ description: 'Periodo de evaluación', example: 'Sprint 1 al Sprint 4' })
    @IsString()
    @IsNotEmpty()
    period: string;

    @ApiProperty({ description: 'Preguntas de reflexión (texto libre por clave)', type: 'object', additionalProperties: { type: 'string' } })
    @IsObject()
    @IsNotEmpty()
    reflectionQuestions: { [key: string]: string };

    @ApiProperty({ description: 'Habilidades blandas (calificacion + comentario por clave)', type: 'object', additionalProperties: { $ref: '#/components/schemas/HabilidadBlandaRespuestaDto' } })
    @IsObject()
    @IsNotEmpty()
    softSkills: { [key: string]: SoftSkillAnswerDto };

    @ApiProperty({ description: 'Síntesis final (texto libre por clave)', type: 'object', additionalProperties: { type: 'string' } })
    @IsObject()
    @IsNotEmpty()
    finalSummary: { [key: string]: string };

    @ApiProperty({ description: 'Resumen de métricas de los 4 sprints', type: OtoSummaryDto })
    @IsObject()
    @IsNotEmpty()
    summary: OtoSummaryDto;
}
