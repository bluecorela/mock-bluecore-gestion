import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SaveSprintEvaluationDto {
  @IsString() @IsNotEmpty() teamId!: string;
  @IsString() @Matches(/^sprint-[1-9]\d*$/i) sprintId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
  @IsString() @IsNotEmpty() engineer!: string;
  @IsObject() metrics!: Record<string, number>;
  @IsNumber() @Min(0) @Max(100) finalScore!: number;
  @IsString() @IsNotEmpty() ratingLabel!: string;
  @IsOptional() @IsString() comments?: string;
  // Accepted for old clients; the controller always replaces it with the authenticated email.
  @IsOptional() @IsEmail() evaluatorEmail?: string;
}
