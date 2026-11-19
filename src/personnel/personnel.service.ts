import { Injectable, BadRequestException } from '@nestjs/common';
import { ROLES_REQUIRING_TEAM } from '../auth/auth.constants';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class PersonnelService {
  constructor(private readonly supabaseDataService: SupabaseDataService) {}

  async findOne(email: string) {
    return this.supabaseDataService.getPersonnelByEmail(
      decodeURIComponent(email),
    );
  }

  assertTeamAccess(
    teamId: string,
    user: import('../auth/interfaces/auth-user.interface').AuthenticatedUser,
  ) {
    return this.supabaseDataService.assertLegacyTeamAccess(teamId, user);
  }

  async findByTeam(teamId: string) {
    return await this.supabaseDataService.getEmployeeByTeam(teamId);
  }

  async getVacationingPersonnel() {
    return await this.supabaseDataService.getVacationingPersonnel();
  }

  async findAll() {
    return this.supabaseDataService.getPersonnel();
  }

  async create(createPersonnelDto: CreatePersonnelDto, createdBy?: string) {
    const { name, role, email, teamId } = createPersonnelDto;

    if (ROLES_REQUIRING_TEAM.some((teamRole) => teamRole === role) && !teamId) {
      throw new BadRequestException(`El rol ${role} requiere equipo`);
    }

    return this.supabaseDataService.createPersonnel({
      name,
      role,
      email,
      teamId,
      createdBy,
    });
  }
}
