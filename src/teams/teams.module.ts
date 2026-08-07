import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { OperationsModule } from '../operations/operations.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [OperationsModule, SupabaseModule, AuthModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule { }
