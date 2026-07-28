import { Module } from '@nestjs/common';
import { EquiposService } from './equipos.service';
import { EquiposController } from './equipos.controller';
import { OperacionesModule } from '../operaciones/operaciones.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [OperacionesModule, SupabaseModule],
  controllers: [EquiposController],
  providers: [EquiposService],
})
export class EquiposModule { }
