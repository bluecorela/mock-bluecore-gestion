import { IsDateString, IsUUID } from 'class-validator';

export class CreateTeamProjectMembershipV2Dto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  roleId!: string;

  @IsDateString()
  startedAt!: string;
}

export class EndTeamProjectMembershipV2Dto {
  @IsDateString()
  endedAt!: string;
}
