import { Module } from '@nestjs/common';
import { RotationHistoryService } from './rotation-history.service';
import { RotationHistoryController } from './rotation-history.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  providers: [RotationHistoryService],
  controllers: [RotationHistoryController],
})
export class RotationHistoryModule { }
