import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SprintsController } from './controllers/sprints.controller';
import { SprintItemsController } from './controllers/sprint-items.controller';
import { TeamInitiativesController } from './controllers/team-initiatives.controller';
import { SprintsRepository } from './repositories/sprints.repository';
import { SprintItemsRepository } from './repositories/sprint-items.repository';
import { SprintsService } from './services/sprints.service';
import { SprintItemsService } from './services/sprint-items.service';

@Module({
  imports: [SupabaseModule, AuthModule, OrganizationModule],
  controllers: [
    SprintsController,
    SprintItemsController,
    TeamInitiativesController,
  ],
  providers: [
    SprintsRepository,
    SprintsService,
    SprintItemsRepository,
    SprintItemsService,
  ],
  exports: [SprintsService],
})
export class SprintsModule {}
