import { Injectable, BadRequestException } from '@nestjs/common';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class PersonalService {
  constructor(private readonly supabaseDataService: SupabaseDataService) { }

  async findOne(correo: string) {
    return this.supabaseDataService.getPersonalByEmail(decodeURIComponent(correo));
  }

  async findEquipo(equipoId: string) {
    return await this.supabaseDataService.getPersonalByEquipo(equipoId);
  }

  async getVacaciones() {
    return await this.supabaseDataService.getPersonalOnVacation();
  }

  async findAll() {
    return this.supabaseDataService.getPersonal();
  }

  async create(createPersonalDto: CreatePersonalDto) {
    const { nombre, rol, correo, equipoId } = createPersonalDto;

    // Validaciones de negocio según el rol
    if (rol === 'Admin' && !correo) {
      throw new BadRequestException('El rol Admin requiere correo');
    }

    if (rol === 'Arquitecto' && (!correo || !equipoId)) {
      throw new BadRequestException('El rol Arquitecto requiere correo y equipo');
    }

    if (['Ingeniero de Software', 'Ingeniero de QA', 'Pasante'].includes(rol) && !equipoId) {
      throw new BadRequestException(`El rol ${rol} requiere equipo`);
    }

    return this.supabaseDataService.createPersonal({ nombre, rol, correo, equipoId });
  }

}
