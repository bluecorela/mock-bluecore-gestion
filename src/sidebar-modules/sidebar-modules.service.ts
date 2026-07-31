import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class SidebarModulesService {
constructor(private readonly supabaseDataService: SupabaseDataService) { }

  async getModulesByRole(role: string) {
    return this.supabaseDataService.getModulesByRole(role);
  }

}
