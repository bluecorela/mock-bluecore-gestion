import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotacionHistorialService {
  constructor(private readonly supabaseDataService: SupabaseDataService) { }

  async findAll() {
    const historial = await this.supabaseDataService.getHistorialRotaciones();

    return historial.map((item) => ({
      ...item,
      fecha: item.fecha ? new Date(item.fecha) : null,
    }));
  }
}
