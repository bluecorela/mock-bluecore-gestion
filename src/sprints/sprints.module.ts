import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SprintsController } from './controllers/sprints.controller';
import { SprintItemsController } from './controllers/sprint-items.controller';
import { TeamInitiativesController } from './controllers/team-initiatives.controller';
import {
  StoryByCodeController,
  StoryLoadController,
} from './load/story-load.controller';
import { StoryUpdateService } from './load/story-update.service';
import { StoryLoadService } from './load/story-load.service';
import { StoryLoadRepository } from './load/story-load.repository';
import { LoadConfirmationService } from './load/load-confirmation.service';
import { SprintsRepository } from './repositories/sprints.repository';
import { SprintItemsRepository } from './repositories/sprint-items.repository';
import { SprintsService } from './services/sprints.service';
import { SprintItemsService } from './services/sprint-items.service';

@Module({
  imports: [SupabaseModule, AuthModule, OrganizationModule],
  controllers: [
    SprintsController,
    StoryLoadController,
    StoryByCodeController,
    SprintItemsController,
    TeamInitiativesController,
  ],
  providers: [
    LoadConfirmationService,
    StoryLoadService,
    StoryUpdateService,
    StoryLoadRepository,
    SprintsRepository,
    SprintsService,
    SprintItemsRepository,
    SprintItemsService,
  ],
  exports: [SprintsService, LoadConfirmationService],
})
export class SprintsModule {}
