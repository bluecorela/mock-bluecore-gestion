import { Module } from '@nestjs/common';
import { ModulosSidebarService } from './modulos-sidebar.service';
import { ModulosSidebarController } from './modulos-sidebar.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [ModulosSidebarService],
  controllers: [ModulosSidebarController]
})
export class ModulosSidebarModule { }
