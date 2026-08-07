import { Injectable, BadRequestException } from '@nestjs/common';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class PersonnelService {
  constructor(private readonly supabaseDataService: SupabaseDataService) { }

  async findOne(email: string) {
    return this.supabaseDataService.getPersonnelByEmail(decodeURIComponent(email));
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

    if (['Ingeniero de Software', 'Ingeniero de QA', 'Pasante'].includes(role) && !teamId) {
      throw new BadRequestException(`El rol ${role} requiere equipo`);
    }

    return this.supabaseDataService.createPersonnel({ name, role, email, teamId, createdBy });
  }

}
