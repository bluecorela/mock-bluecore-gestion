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
import { WeeklyDashboardService } from './weekly-dashboard.service';
import { SaveWeeklyReportDto } from './dto/save-weekly-report.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { WeeklyReportContextQueryDto } from './dto/weekly-report-context-query.dto';

@ApiTags('Weekly dashboard')
@Controller('v2/teams/:teamId/weekly-reports')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class WeeklyDashboardController {
  constructor(private readonly service: WeeklyDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'List the weekly dashboard history for a team' })
  @ApiParam({ name: 'teamId', format: 'uuid' })
  findReports(@Param('teamId', new ParseUUIDPipe()) teamId: string) {
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
  findContext(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Query() query: WeeklyReportContextQueryDto,
  ) {
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
  saveReport(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Body() input: SaveWeeklyReportDto,
  ) {
    return this.service.saveReport(teamId, input);
  }

  @Get(':reportId')
  @ApiOperation({
    summary:
      'Get a weekly dashboard report with initiatives, risks and quality metrics',
  })
  findReport(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ) {
    return this.service.findReport(teamId, reportId);
  }
}
