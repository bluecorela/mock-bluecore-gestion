import { Module } from '@nestjs/common';
import { SidebarModulesService } from './sidebar-modules.service';
import { SidebarModulesController } from './sidebar-modules.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [SidebarModulesService],
  controllers: [SidebarModulesController]
})
export class SidebarModulesModule { }
