import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { OrganizationService } from '../organization/organization.service';
import {
  CompleteSprintDto,
  CreateSprintDto,
  UpdateSprintDto,
} from './dto/sprint.dto';
import { SprintsService } from './sprints.service';

@ApiTags('Sprints')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/teams/:teamId/sprints')
export class SprintsController {
  constructor(
    private readonly service: SprintsService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a team’s sprints' })
  @ApiQuery({ name: 'status', required: false, example: 'in_progress' })
  async findByTeam(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Query('status') status: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findByTeam(teamId, status);
  }

  @Get('active/dashboard')
  @ApiOperation({
    summary: 'Get the operational dashboard for the active sprint',
  })
  async activeDashboard(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.activeDashboard(teamId);
  }

  @Get('active/full-dashboard')
  @ApiOperation({ summary: 'Get the active sprint dashboard with all details' })
  async activeFullDashboard(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.activeFullDashboard(teamId);
  }

  @Get(':sprintId/dashboard')
  @ApiOperation({ summary: 'Get the operational dashboard for a sprint' })
  @ApiParam({ name: 'sprintId', format: 'uuid' })
  async dashboard(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.dashboard(teamId, sprintId);
  }

  @Get(':sprintId/full-dashboard')
  @ApiOperation({ summary: 'Get a sprint dashboard with all details' })
  @ApiParam({ name: 'sprintId', format: 'uuid' })
  async fullDashboard(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.fullDashboard(teamId, sprintId);
  }

  @Get(':sprintId/closure-summary')
  @ApiOperation({
    summary:
      'List open sprint records that must be planned for the next sprint',
  })
  async closureSummary(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.closureSummary(teamId, sprintId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Configure a planned sprint' })
  async create(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Body() input: CreateSprintDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.create(teamId, input);
  }

  @Patch(':sprintId')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Update a planned sprint configuration' })
  async update(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Body() input: UpdateSprintDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.update(teamId, sprintId, input);
  }

  @Post(':sprintId/start')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Start a configured sprint' })
  async start(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.start(teamId, sprintId);
  }

  @Post(':sprintId/complete')
  @UseGuards(RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiOperation({ summary: 'Complete an active sprint' })
  async complete(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @Body() input: CompleteSprintDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.complete(teamId, sprintId, input);
  }
}
