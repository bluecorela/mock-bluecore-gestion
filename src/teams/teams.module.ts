import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { OperationsModule } from '../operations/operations.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { SprintsModule } from '../v2/sprints/sprints.module';

@Module({
  imports: [OperationsModule, SupabaseModule, AuthModule, SprintsModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
