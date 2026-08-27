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
import { OrganizationService } from './organization.service';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import {
  CreateTeamProjectMembershipDto,
  EndTeamProjectMembershipDto,
} from './dto/team-project-membership.dto';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';

@ApiTags('Organization')
@Controller('v2')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Get('clients')
  @ApiOperation({ summary: 'List active clients from the normalized schema' })
  findClients() {
    return this.service.findClients();
  }

  @Post('clients')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a client in the normalized schema' })
  createClient(@Body() input: CreateClientDto) {
    return this.service.createClient(input);
  }

  @Patch('clients/:clientId')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a client in the normalized schema' })
  updateClient(
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Body() input: UpdateClientDto,
  ) {
    return this.service.updateClient(clientId, input);
  }

  @Get('clients/:clientId/projects')
  @ApiOperation({ summary: 'List projects for a client' })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  findProjectsByClient(
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.service.findProjectsByClient(clientId);
  }

  @Get('projects')
  @ApiOperation({ summary: 'List active projects from the normalized schema' })
  @ApiQuery({ name: 'clientId', required: false, format: 'uuid' })
  findProjects(
    @Query('clientId', new ParseUUIDPipe({ optional: true })) clientId?: string,
  ) {
    return this.service.findProjects(clientId);
  }

  @Post('projects')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a project in the normalized schema' })
  createProject(@Body() input: CreateProjectDto) {
    return this.service.createProject(input);
  }

  @Patch('projects/:projectId')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project in the normalized schema' })
  updateProject(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.service.updateProject(projectId, input);
  }

  @Get('teams')
  @ApiOperation({ summary: 'List active teams from the normalized schema' })
  findTeams() {
    return this.service.findTeams();
  }

  @Get('employees')
  @ApiOperation({
    summary: 'List active employees, optionally filtered by team',
  })
  @ApiQuery({ name: 'teamId', required: false, format: 'uuid' })
  findEmployees(
    @Query('teamId', new ParseUUIDPipe({ optional: true })) teamId?: string,
  ) {
    return this.service.findEmployees(teamId);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List roles available for employee assignments' })
  findRoles() {
    return this.service.findRoles();
  }

  @Get('teams/:teamId/organization')
  @ApiOperation({
    summary: 'Get the client and project assignments for a team',
  })
  @ApiParam({ name: 'teamId', format: 'uuid' })
  findTeamOrganization(@Param('teamId', new ParseUUIDPipe()) teamId: string) {
    return this.service.findTeamOrganization(teamId);
  }

  @Post('teams/:teamId/projects/:assignmentId/members')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign an employee role to a team project' })
  assignTeamProjectMember(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Body() input: CreateTeamProjectMembershipDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.assignTeamProjectMember(
      teamId,
      assignmentId,
      input,
      currentUser,
    );
  }

  @Patch('teams/:teamId/projects/:assignmentId/members/:membershipId')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'End an employee role assignment in a team project',
  })
  endTeamProjectMember(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body() input: EndTeamProjectMembershipDto,
  ) {
    return this.service.endTeamProjectMember(
      teamId,
      assignmentId,
      membershipId,
      input,
    );
  }
}
