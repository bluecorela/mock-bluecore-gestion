import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class SidebarModulesService {
constructor(private readonly supabaseDataService: SupabaseDataService) { }

  async getModulesByRole(role: string) {
    return this.supabaseDataService.getModulesByRole(role);
  }

  getConfiguration() {
    return this.supabaseDataService.getSidebarConfiguration();
  }

  createModule(input: object) {
    return this.supabaseDataService.saveSidebarModule(input);
  }

  updateModule(moduleId: string, input: object) {
    return this.supabaseDataService.saveSidebarModule({ ...input, moduleId });
  }

}
