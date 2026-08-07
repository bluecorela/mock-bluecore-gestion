import { Module } from '@nestjs/common';
import { RotationController } from './rotation.controller';
import { RotationService } from './rotation.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [SupabaseModule, AuthModule],
    controllers: [RotationController],
    providers: [RotationService],
})
export class RotationModule { }
