import { Module } from '@nestjs/common';
import { RotacionHistorialService } from './rotacion-historial.service';
import { RotacionHistorialController } from './rotacion-historial.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [RotacionHistorialService],
  controllers: [RotacionHistorialController],
})
export class RotacionHistorialModule { }
