import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRepository } from './organization.repository';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import {
  CreateTeamProjectMembershipDto,
  EndTeamProjectMembershipDto,
} from './dto/team-project-membership.dto';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';

@Injectable()
export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  findClients() {
    return this.repository.findClients();
  }

  createClient(input: CreateClientDto) {
    return this.repository.createClient(input);
  }

  async updateClient(clientId: string, input: UpdateClientDto) {
    const client = await this.repository.updateClient(clientId, input);
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async findProjectsByClient(clientId: string) {
    const client = await this.repository.findClientById(clientId);
    if (!client) throw new NotFoundException('Client not found');
    const projects = await this.repository.findProjects(clientId);
    return { client, projects };
  }

  findProjects(clientId?: string) {
    return this.repository.findProjects(clientId);
  }

  async createProject(input: CreateProjectDto) {
    await this.assertClientExists(input.clientId);
    this.validateProjectDates(input);
    return this.repository.createProject(input);
  }

  async updateProject(projectId: string, input: UpdateProjectDto) {
    const current = await this.repository.findProjectById(projectId);
    if (!current) throw new NotFoundException('Project not found');
    if (input.clientId) await this.assertClientExists(input.clientId);

    this.validateProjectDates({
      startDate: input.startDate ?? current.startDate ?? undefined,
      plannedEndDate:
        input.plannedEndDate ?? current.plannedEndDate ?? undefined,
      actualEndDate: input.actualEndDate ?? current.actualEndDate ?? undefined,
    });
    return this.repository.updateProject(projectId, input);
  }

  findTeams() {
    return this.repository.findTeams();
  }

  async findEmployees(teamId?: string) {
    if (teamId && !(await this.repository.findTeamOrganization(teamId))) {
      throw new NotFoundException('Team not found');
    }
    return this.repository.findEmployees(teamId);
  }

  findRoles() {
    return this.repository.findRoles();
  }

  async findTeamOrganization(teamId: string) {
    const organization = await this.repository.findTeamOrganization(teamId);
    if (!organization) throw new NotFoundException('Team not found');
    return organization;
  }

  async assertTeamAccess(
    teamId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const organization = await this.repository.findTeamOrganization(teamId);
    if (!organization) throw new NotFoundException('Team not found');

    if (user.role !== 'Admin' && user.teamId !== teamId) {
      throw new ForbiddenException(
        'No tiene permisos para acceder a este equipo',
      );
    }
  }

  async assignTeamProjectMember(
    teamId: string,
    assignmentId: string,
    input: CreateTeamProjectMembershipDto,
    currentUser: AuthenticatedUser,
  ) {
    const assignment = await this.repository.findTeamProjectAssignment(
      teamId,
      assignmentId,
    );
    if (!assignment)
      throw new NotFoundException('Team project assignment not found');
    if (!(await this.repository.findEmployeeById(input.employeeId))) {
      throw new NotFoundException('Employee not found');
    }
    if (!(await this.repository.findRoleById(input.roleId))) {
      throw new NotFoundException('Role not found');
    }
    this.validateMembershipDate(
      input.startedAt,
      assignment.started_at,
      assignment.ended_at,
    );
    return this.repository.createTeamProjectMembership({
      teamProjectId: assignmentId,
      employeeId: input.employeeId,
      roleId: input.roleId,
      startedAt: input.startedAt,
      createdBy: currentUser.supabaseUserId,
    });
  }

  async endTeamProjectMember(
    teamId: string,
    assignmentId: string,
    membershipId: string,
    input: EndTeamProjectMembershipDto,
  ) {
    if (
      !(await this.repository.findTeamProjectAssignment(teamId, assignmentId))
    ) {
      throw new NotFoundException('Team project assignment not found');
    }
    const membership = await this.repository.findTeamProjectMembership(
      assignmentId,
      membershipId,
    );
    if (!membership)
      throw new NotFoundException('Team project membership not found');
    if (!membership.is_active)
      throw new BadRequestException(
        'Team project membership is already inactive',
      );
    if (
      new Date(input.endedAt).getTime() <
      new Date(membership.started_at).getTime()
    ) {
      throw new BadRequestException('endedAt cannot be earlier than startedAt');
    }
    await this.repository.endTeamProjectMembership(membershipId, input.endedAt);
    return { id: membershipId, endedAt: input.endedAt, isActive: false };
  }

  private async assertClientExists(clientId: string) {
    if (!(await this.repository.findClientById(clientId))) {
      throw new NotFoundException('Client not found');
    }
  }

  private validateProjectDates(input: {
    startDate?: string;
    plannedEndDate?: string;
    actualEndDate?: string;
  }) {
    if (!input.startDate) return;
    const start = new Date(input.startDate).getTime();
    if (
      input.plannedEndDate &&
      new Date(input.plannedEndDate).getTime() < start
    ) {
      throw new BadRequestException(
        'plannedEndDate cannot be earlier than startDate',
      );
    }
    if (
      input.actualEndDate &&
      new Date(input.actualEndDate).getTime() < start
    ) {
      throw new BadRequestException(
        'actualEndDate cannot be earlier than startDate',
      );
    }
  }

  private validateMembershipDate(
    startedAt: string,
    assignmentStart: string,
    assignmentEnd?: string | null,
  ) {
    const date = new Date(startedAt).getTime();
    if (date < new Date(assignmentStart).getTime()) {
      throw new BadRequestException(
        'startedAt cannot be earlier than the team project assignment',
      );
    }
    if (assignmentEnd && date > new Date(assignmentEnd).getTime()) {
      throw new BadRequestException(
        'startedAt cannot be later than the team project assignment',
      );
    }
  }
}
