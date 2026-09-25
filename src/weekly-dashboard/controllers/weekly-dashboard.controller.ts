import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { WeeklyDashboardService } from '../services/weekly-dashboard.service';
import { SaveWeeklyReportDto } from '../dto/save-weekly-report.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationService } from '../../organization/services/organization.service';
import { WeeklyReportContextQueryDto } from '../dto/weekly-report-context-query.dto';

@ApiTags('Weekly dashboard')
@Controller('v2/teams/:teamId/weekly-reports')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class WeeklyDashboardController {
  constructor(
    private readonly service: WeeklyDashboardService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the weekly dashboard history for a team' })
  @ApiParam({ name: 'teamId', format: 'uuid' })
  async findReports(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findReports(teamId);
  }

  @Get('context')
  @ApiOperation({
    summary:
      'Get projects, responsible members and sprints for a selected week',
  })
  @ApiQuery({
    name: 'weekStart',
    required: false,
    type: String,
    example: '2026-08-03',
  })
  async findContext(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Query() query: WeeklyReportContextQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findContext(teamId, query.weekStart);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Scrum Master', 'Arquitecto')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or update a complete weekly dashboard report',
    description: 'Available to administrators, Scrum Masters and architects.',
  })
  async saveReport(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Body() input: SaveWeeklyReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.saveReport(teamId, input);
  }

  @Get(':reportId')
  @ApiOperation({
    summary:
      'Get a weekly dashboard report with initiatives, risks and quality metrics',
  })
  async findReport(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findReport(teamId, reportId);
  }
}
