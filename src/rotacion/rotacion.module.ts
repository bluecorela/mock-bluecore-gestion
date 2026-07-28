import { Module } from '@nestjs/common';
import { RotacionController } from './rotacion.controller';
import { RotacionService } from './rotacion.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    controllers: [RotacionController],
    providers: [RotacionService],
})
export class RotacionModule { }
