import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { OrganizationService } from '../../organization/services/organization.service';
import { SprintsService } from '../services/sprints.service';

@ApiTags('Team initiatives')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles('Admin', 'Scrum Master', 'Arquitecto')
@Controller('v2/teams/:teamId/initiatives')
export class TeamInitiativesController {
  constructor(
    private readonly service: SprintsService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Get('active')
  @ApiOperation({ summary: 'List active initiatives for a team' })
  async findActive(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findActiveInitiatives(teamId);
  }

  @Get()
  @ApiOperation({
    summary: 'List team initiatives whose dates overlap the requested period',
  })
  async findForPeriod(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizationService.assertTeamAccess(teamId, user);
    return this.service.findInitiativesForPeriod(teamId, startDate, endDate);
  }
}
