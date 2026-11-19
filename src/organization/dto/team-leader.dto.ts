import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class ReplaceTeamLeaderDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: true })
  @ValidateIf((o: ReplaceTeamLeaderDto) => o.employeeId !== null)
  @IsUUID('all', { message: 'employeeId debe ser un UUID o null' })
  employeeId: string | null;
}
