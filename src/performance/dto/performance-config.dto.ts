import { ApiProperty } from '@nestjs/swagger';

export class AnswerOptionDto {
  @ApiProperty({ description: 'Valor numérico de la opción', example: 7.7 })
  value!: number;

  @ApiProperty({
    description: 'Descripción de la opción',
    example: 'Alto (7.7 puntos)',
  })
  description!: string;
}

export class EvaluationQuestionDto {
  @ApiProperty({
    description: 'Identificador único de la pregunta',
    example: 'conocimientoTecnico',
  })
  key!: string;

  @ApiProperty({
    description: 'Texto de la pregunta',
    example: '1. ¿Cómo evalúa el conocimiento del colaborador...?',
  })
  label!: string;
}

export class PerformanceConfigDto {
  @ApiProperty({
    description: 'Lista de preguntas de evaluación',
    type: [EvaluationQuestionDto],
  })
  questions!: EvaluationQuestionDto[];

  @ApiProperty({
    description: 'Mapa de opciones de respuesta por clave de pregunta',
    additionalProperties: {
      type: 'array',
      items: { $ref: '#/components/schemas/AnswerOptionDto' },
    },
  })
  answers!: { [key: string]: AnswerOptionDto[] };
}
