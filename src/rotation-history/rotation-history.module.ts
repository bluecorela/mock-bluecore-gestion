import { Module } from '@nestjs/common';
import { RotationHistoryService } from './rotation-history.service';
import { RotationHistoryController } from './rotation-history.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [RotationHistoryService],
  controllers: [RotationHistoryController],
})
export class RotationHistoryModule { }
