import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { SprintsController } from './sprints.controller';
import { SprintsRepository } from './sprints.repository';
import { SprintsService } from './sprints.service';
import { SprintItemsController } from './sprint-items.controller';
import { SprintItemsRepository } from './sprint-items.repository';
import { SprintItemsService } from './sprint-items.service';
import { TeamInitiativesController } from './team-initiatives.controller';

@Module({
  imports: [SupabaseModule, AuthModule, OrganizationModule],
  controllers: [SprintsController, SprintItemsController, TeamInitiativesController],
  providers: [
    SprintsRepository,
    SprintsService,
    SprintItemsRepository,
    SprintItemsService,
  ],
  exports: [SprintsService],
})
export class SprintsModule {}
