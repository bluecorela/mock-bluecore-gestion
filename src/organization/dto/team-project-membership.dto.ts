import { IsDateString, IsUUID } from 'class-validator';

export class CreateTeamProjectMembershipDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  roleId!: string;

  @IsDateString()
  startedAt!: string;
}

export class EndTeamProjectMembershipDto {
  @IsDateString()
  endedAt!: string;
}
