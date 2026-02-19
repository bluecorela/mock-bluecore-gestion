import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsObject, IsArray, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class PreguntaRespuestaDto {
    @ApiProperty({ description: 'Puntaje de la pregunta', example: 4 })
    @IsNumber()
    @IsNotEmpty()
    puntaje: number;

    @ApiProperty({ description: 'Comentario de la pregunta', example: 'Buen desempeño', required: false })
    @IsString()
    @IsOptional()
    comentario?: string;
}

export class CreatePerformanceEvaluacionDto {
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

    @ApiProperty({ description: 'Periodo de evaluación', example: 'Performance Semestral' })
    @IsString()
    @IsNotEmpty()
    periodo: string;

    @ApiProperty({ description: 'Respuestas a las preguntas', type: 'object', additionalProperties: true })
    @IsObject()
    @IsNotEmpty()
    respuestas: { [clave: string]: PreguntaRespuestaDto };

    @ApiProperty({ description: 'Logros destacados', example: 'Completó todos los sprints' })
    @IsString()
    @IsNotEmpty()
    logros: string;

    @ApiProperty({ description: 'Observaciones adicionales', example: 'Excelente actitud' })
    @IsString()
    @IsNotEmpty()
    observacionesAdicionales: string;

    @ApiProperty({ description: 'Potencial de crecimiento', example: 'Alto' })
    @IsString()
    @IsNotEmpty()
    potencialCrecimiento: string;

    @ApiProperty({ description: 'Confirma retroalimentación', example: true })
    @IsBoolean()
    @IsNotEmpty()
    retroalimentacionConfirmada: boolean;

    @ApiProperty({ description: 'Número de evaluación (1, 2, etc.)', example: 1 })
    @IsNumber()
    @IsNotEmpty()
    numeroEvaluacion: number;
}
