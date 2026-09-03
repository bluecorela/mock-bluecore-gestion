import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationService } from '../organization/organization.service';
import { SprintsService } from './sprints.service';

@ApiTags('Team initiatives')
@ApiBearerAuth()
@UseGuards(AuthGuard)
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
}
