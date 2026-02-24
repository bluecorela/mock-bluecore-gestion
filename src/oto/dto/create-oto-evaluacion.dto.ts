import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsObject, IsNumber, IsOptional } from 'class-validator';

export class HabilidadBlandaRespuestaDto {
    @ApiProperty({ description: 'Calificación de la habilidad', example: 3 })
    @IsNumber()
    @IsNotEmpty()
    calificacion: number;

    @ApiProperty({ description: 'Comentario opcional', example: 'Excelente proactividad', required: false })
    @IsString()
    @IsOptional()
    comentario?: string;
}

export class ResumenOtoDto {
    @ApiProperty({ description: 'Total de tareas asignadas', example: 10 })
    @IsNumber()
    @IsNotEmpty()
    totalTareasAsignadas: number;

    @ApiProperty({ description: 'Porcentaje de tareas entregadas', example: 90 })
    @IsNumber()
    @IsNotEmpty()
    porcentajeAsignadasEntregadas: number;

    @ApiProperty({ description: 'Porcentaje de tareas devueltas', example: 5 })
    @IsNumber()
    @IsNotEmpty()
    porcentajeEntregadasDevueltas: number;

    @ApiProperty({ description: 'Porcentaje de calidad del código', example: 95 })
    @IsNumber()
    @IsNotEmpty()
    porcentajeCalidadCodigo: number;

    @ApiProperty({ description: 'Promedio total final de los sprints', example: 88.5 })
    @IsNumber()
    @IsNotEmpty()
    promedioTotalFinal: number;
}

export class CreateOtoEvaluacionDto {
    @ApiProperty({ description: 'ID del equipo', example: 'sgb-evolucion' })
    @IsString()
    @IsNotEmpty()
    equipoId: string;

    @ApiProperty({ description: 'Nombre del evaluador', example: 'Luis Salgado' })
    @IsString()
    @IsNotEmpty()
    nombreEvaluador: string;

    @ApiProperty({ description: 'Nombre del ingeniero evaluado', example: 'Juan Pérez' })
    @IsString()
    @IsNotEmpty()
    nombreIngeniero: string;

    @ApiProperty({ description: 'Número de evaluación (1, 2, etc.)', example: 1 })
    @IsNumber()
    @IsNotEmpty()
    numeroEvaluacion: number;

    @ApiProperty({ description: 'Periodo de evaluación', example: 'Sprint 1 al Sprint 4' })
    @IsString()
    @IsNotEmpty()
    periodo: string;

    @ApiProperty({ description: 'Preguntas de reflexión (texto libre por clave)', type: 'object', additionalProperties: { type: 'string' } })
    @IsObject()
    @IsNotEmpty()
    preguntasReflexion: { [clave: string]: string };

    @ApiProperty({ description: 'Habilidades blandas (calificacion + comentario por clave)', type: 'object', additionalProperties: { $ref: '#/components/schemas/HabilidadBlandaRespuestaDto' } })
    @IsObject()
    @IsNotEmpty()
    habilidadesBlandas: { [clave: string]: HabilidadBlandaRespuestaDto };

    @ApiProperty({ description: 'Síntesis final (texto libre por clave)', type: 'object', additionalProperties: { type: 'string' } })
    @IsObject()
    @IsNotEmpty()
    sintesisFinal: { [clave: string]: string };

    @ApiProperty({ description: 'Resumen de métricas de los 4 sprints', type: ResumenOtoDto })
    @IsObject()
    @IsNotEmpty()
    resumen: ResumenOtoDto;
}
