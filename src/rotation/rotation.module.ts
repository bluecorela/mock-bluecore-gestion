import { Module } from '@nestjs/common';
import { RotationController } from './rotation.controller';
import { RotationService } from './rotation.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    controllers: [RotationController],
    providers: [RotationService],
})
export class RotationModule { }
