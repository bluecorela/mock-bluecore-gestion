import { Injectable } from '@nestjs/common';
import { RotatePersonnelDto, VacationDto, ReintegrateDto } from './dto/rotation.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotationService {
  constructor(private readonly supabaseDataService: SupabaseDataService) {}

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
