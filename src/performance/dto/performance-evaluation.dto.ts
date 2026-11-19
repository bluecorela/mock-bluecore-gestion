import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsObject,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class QuestionAnswerDto {
  @ApiProperty({ description: 'Puntaje de la pregunta', example: 4 })
  @IsNumber()
  @IsNotEmpty()
  score: number;

  @ApiProperty({
    description: 'Comentario de la pregunta',
    example: 'Buen desempeño',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class CreatePerformanceEvaluationDto {
  @ApiProperty({ description: 'ID del equipo', example: 'sgb-evolucion' })
  @IsString()
  @IsNotEmpty()
  teamId: string;

  @ApiProperty({ description: 'Nombre del evaluador', example: 'Luis Salgado' })
  @IsString()
  @IsNotEmpty()
  evaluatorName: string;

  @ApiProperty({
    description: 'Nombre del ingeniero evaluado',
    example: 'Juan Pérez',
  })
  @IsString()
  @IsNotEmpty()
  engineerName: string;

  @ApiProperty({
    description: 'Periodo de evaluación',
    example: 'Performance Anual',
  })
  @IsString()
  @IsNotEmpty()
  period: string;

  @ApiProperty({
    description: 'Respuestas a las preguntas',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  answers: { [key: string]: QuestionAnswerDto };

  @ApiProperty({
    description: 'Logros destacados',
    example: 'Completó todos los sprints',
  })
  @IsString()
  @IsNotEmpty()
  achievements: string;

  @ApiProperty({
    description: 'Observaciones adicionales',
    example: 'Excelente actitud',
  })
  @IsString()
  @IsNotEmpty()
  additionalObservations: string;

  @ApiProperty({ description: 'Potencial de crecimiento', example: 'Alto' })
  @IsString()
  @IsNotEmpty()
  growthPotential: string;

  @ApiProperty({ description: 'Confirma retroalimentación', example: true })
  @IsBoolean()
  @IsNotEmpty()
  feedbackConfirmed: boolean;

  @ApiProperty({
    description: 'Número de evaluación (1, 2, etc.)',
    example: 1,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  evaluationNumber?: number;
}
