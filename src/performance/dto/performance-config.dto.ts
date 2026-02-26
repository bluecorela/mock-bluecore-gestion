import { ApiProperty } from '@nestjs/swagger';

export class OpcionRespuestaDto {
    @ApiProperty({ description: 'Valor numérico de la opción', example: 7.7 })
    valor: number;

    @ApiProperty({ description: 'Descripción de la opción', example: 'Alto (7.7 puntos)' })
    descripcion: string;
}

export class PreguntaEvaluacionDto {
    @ApiProperty({ description: 'Identificador único de la pregunta', example: 'conocimientoTecnico' })
    clave: string;

    @ApiProperty({ description: 'Texto de la pregunta', example: '1. ¿Cómo evalúa el conocimiento del colaborador...?' })
    label: string;
}

export class PerformanceConfigDto {
    @ApiProperty({ description: 'Lista de preguntas de evaluación', type: [PreguntaEvaluacionDto] })
    preguntas: PreguntaEvaluacionDto[];

    @ApiProperty({ description: 'Mapa de opciones de respuesta por clave de pregunta', additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/OpcionRespuestaDto' } } })
    respuestas: { [clave: string]: OpcionRespuestaDto[] };
}
