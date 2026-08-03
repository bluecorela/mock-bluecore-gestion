import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { OperationsModule } from '../operations/operations.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [OperationsModule, SupabaseModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule { }
