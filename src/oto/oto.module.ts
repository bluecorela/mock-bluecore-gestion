import { Module } from '@nestjs/common';
import { OtoService } from './oto.service';
import { OtoController } from './oto.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    controllers: [OtoController],
    providers: [OtoService],
})
export class OtoModule { }
