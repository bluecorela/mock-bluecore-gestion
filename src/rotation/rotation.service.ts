import { Injectable } from '@nestjs/common';
import {
  RotatePersonnelDto,
  VacationDto,
  ReintegrateDto,
} from './dto/rotation.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotationService {
  constructor(private readonly supabaseDataService: SupabaseDataService) {}

  async getContext() {
    const [teams, personnel, vacationingPersonnel, history] = await Promise.all([
      this.supabaseDataService.getTeams(),
      this.supabaseDataService.getPersonnel(),
      this.supabaseDataService.getVacationingPersonnel(),
      this.supabaseDataService.getRotationHistory(),
    ]);
    const vacationPool = personnel.filter(
      (person) =>
        person.teamId?.toLowerCase() === 'pool-de-vacaciones' ||
        person.team?.path?.toLowerCase().includes('pool-de-vacaciones'),
    );
    return {
      teams,
      vacationPool,
      vacationingPersonnel,
      history,
    };
  }

  async rotatePersonnel(data: RotatePersonnelDto, createdBy?: string) {
    const result = await this.supabaseDataService.manageEmployeeMovement({
      action: 'rotate',
      personnelId: data.personnelId,
      sourceTeamId: data.sourceTeamId,
      destinationTeamId: data.destinationTeamId,
      createdBy,
    });
    return { message: 'Rotación exitosa', ...result };
  }

  async sendOnVacation(data: VacationDto, createdBy?: string) {
    const result = await this.supabaseDataService.manageEmployeeMovement({
      action: 'vacation_start',
      personnelId: data.personnelId,
      sourceTeamId: data.sourceTeamId,
      replacementId: data.replacementId,
      createdBy,
    });
    return { message: 'Enviado a vacaciones', ...result };
  }

  async reintegratePersonnel(data: ReintegrateDto, createdBy?: string) {
    const result = await this.supabaseDataService.manageEmployeeMovement({
      action: 'vacation_end',
      personnelId: data.personnelId,
      destinationTeamId: data.destinationTeamId,
      createdBy,
    });
    return { message: 'Reintegrado exitosamente', ...result };
  }
}
