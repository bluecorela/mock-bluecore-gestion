import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class ModulosSidebarService {
constructor(private readonly supabaseDataService: SupabaseDataService) { }

  async getModulosRol(rol: string) {
    return this.supabaseDataService.getModulosRol(rol);
  }

}
