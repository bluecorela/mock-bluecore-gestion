import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { OrganizationService } from '../organization/organization.service';
import {
  CreateSprintBugDto,
  CreateSprintInitiativeDto,
  CreateSprintRiskDto,
  CreateSprintUserStoryDto,
  MoveSprintUserStoryDto,
  UpdateSprintBugDto,
  UpdateSprintInitiativeDto,
  UpdateSprintRiskDto,
  UpdateSprintUserStoryDto,
} from './dto/sprint-items.dto';
import { SprintItemsService } from './sprint-items.service';

type Kind = 'initiatives' | 'stories' | 'bugs' | 'risks';
type CreateSprintItemDto =
  | CreateSprintInitiativeDto
  | CreateSprintUserStoryDto
  | CreateSprintBugDto
  | CreateSprintRiskDto;
type UpdateSprintItemDto =
  | UpdateSprintInitiativeDto
  | UpdateSprintUserStoryDto
  | UpdateSprintBugDto
  | UpdateSprintRiskDto;

@ApiTags('Sprint operational data')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/teams/:teamId/sprints/:sprintId')
export class SprintItemsController {
  constructor(
    private readonly service: SprintItemsService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Get('initiatives') findInitiatives(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.find(teamId, sprintId, user, 'initiatives');
  }
  @Get('stories') findStories(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.find(teamId, sprintId, user, 'stories');
  }
  @Get('bugs') findBugs(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.find(teamId, sprintId, user, 'bugs');
  }
  @Get('risks') findRisks(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.find(teamId, sprintId, user, 'risks');
  }

  @Post('initiatives')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Add an initiative to a sprint' })
  createInitiative(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Body() body: CreateSprintInitiativeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.create(teamId, sprintId, user, 'initiatives', body);
  }
  @Post('stories')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Add a user story to a sprint' })
  createStory(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Body() body: CreateSprintUserStoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.create(teamId, sprintId, user, 'stories', body);
  }
  @Post('bugs')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Register a bug or return in a sprint' })
  createBug(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Body() body: CreateSprintBugDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.create(teamId, sprintId, user, 'bugs', body);
  }
  @Post('risks')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Register a risk or blocker in a sprint' })
  createRisk(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Body() body: CreateSprintRiskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.create(teamId, sprintId, user, 'risks', body);
  }

  @Post('stories/:itemId/move')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({
    summary: 'Move a user story to another open sprint in the same team',
  })
  async moveStory(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sourceSprintId: string,
    @Param('itemId', new ParseUUIDPipe()) storyId: string,
    @Body() body: MoveSprintUserStoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.moveStory(
      teamId,
      sourceSprintId,
      storyId,
      body.targetSprintId,
    );
  }

  @Patch('initiatives/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  updateInitiative(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: UpdateSprintInitiativeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.update(teamId, sprintId, itemId, user, 'initiatives', body);
  }
  @Patch('stories/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  updateStory(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: UpdateSprintUserStoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.update(teamId, sprintId, itemId, user, 'stories', body);
  }
  @Patch('bugs/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  updateBug(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: UpdateSprintBugDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.update(teamId, sprintId, itemId, user, 'bugs', body);
  }
  @Patch('risks/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  updateRisk(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: UpdateSprintRiskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.update(teamId, sprintId, itemId, user, 'risks', body);
  }

  @Delete('initiatives/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  deleteInitiative(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.remove(teamId, sprintId, itemId, user, 'initiatives');
  }
  @Delete('stories/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  deleteStory(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.remove(teamId, sprintId, itemId, user, 'stories');
  }
  @Delete('bugs/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  deleteBug(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.remove(teamId, sprintId, itemId, user, 'bugs');
  }
  @Delete('risks/:itemId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  deleteRisk(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.remove(teamId, sprintId, itemId, user, 'risks');
  }

  private async find(
    teamId: string,
    sprintId: string,
    user: AuthenticatedUser,
    kind: Kind,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findAll(teamId, sprintId, kind);
  }
  private async create(
    teamId: string,
    sprintId: string,
    user: AuthenticatedUser,
    kind: Kind,
    body: CreateSprintItemDto,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.create(teamId, sprintId, kind, body);
  }
  private async update(
    teamId: string,
    sprintId: string,
    itemId: string,
    user: AuthenticatedUser,
    kind: Kind,
    body: UpdateSprintItemDto,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.update(teamId, sprintId, itemId, kind, body);
  }
  private async remove(
    teamId: string,
    sprintId: string,
    itemId: string,
    user: AuthenticatedUser,
    kind: Kind,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    await this.service.remove(teamId, sprintId, itemId, kind);
  }
}
