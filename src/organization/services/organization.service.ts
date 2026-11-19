import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HISTORICAL_ROLE_CODES } from '../../auth/auth.constants';
import { ReplaceTeamLeaderDto } from '../dto/team-leader.dto';
import type {
  TeamLeaders,
  TeamLeaderOverview,
  LeaderCandidates,
  ReplaceTeamLeaderResult,
} from '../interfaces/organization.interface';
import { OrganizationRepository } from '../repositories/organization.repository';
import { CreateClientDto, UpdateClientDto } from '../dto/client.dto';
import { CreateProjectDto, UpdateProjectDto } from '../dto/project.dto';
import {
  CreateTeamProjectMembershipDto,
  EndTeamProjectMembershipDto,
} from '../dto/team-project-membership.dto';
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

  findTeamsForUser(user: AuthenticatedUser) {
    if (user.role?.toLowerCase() === 'admin')
      return this.repository.findTeams();
    if (!user.employeeId) return Promise.resolve([]);
    return this.repository.findTeamsForEmployee(user.employeeId);
  }

  async findEmployees(teamId?: string) {
    if (teamId && !(await this.repository.findTeamOrganization(teamId))) {
      throw new NotFoundException('Team not found');
    }
    return this.repository.findEmployees(teamId);
  }

  async findEmployeesForUser(user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    const teams = await this.repository.findTeamsForEmployee(user.employeeId);
    const employees = await Promise.all(
      teams.map((team) => this.repository.findEmployees(team.id)),
    );
    return [
      ...new Map(
        employees.flat().map((employee) => [employee.id, employee]),
      ).values(),
    ];
  }

  async findRoles() {
    const roles = await this.repository.findRoles();
    return roles.filter(
      (role) => !HISTORICAL_ROLE_CODES.some((code) => code === role.code),
    );
  }

  findTeamLeaders(teamId: string): Promise<TeamLeaders> {
    return this.repository.findTeamLeaders(teamId);
  }

  async findAllTeamLeaders(): Promise<TeamLeaderOverview[]> {
    const teams = await this.repository.findTeams();
    return Promise.all(
      teams.map(async ({ id, code, name }) => ({
        team: { id, code, name },
        ...(await this.findTeamLeaders(id)),
      })),
    );
  }

  findLeaderCandidates(): Promise<LeaderCandidates> {
    return this.repository.findLeaderCandidates();
  }

  async replaceTeamLeader(
    teamId: string,
    role: string,
    input: ReplaceTeamLeaderDto,
    currentUser: AuthenticatedUser,
  ): Promise<ReplaceTeamLeaderResult> {
    if (role !== 'architect' && role !== 'scrum-master') {
      throw new BadRequestException('El rol debe ser architect o scrum-master');
    }
    return this.repository.replaceTeamLeader(
      teamId,
      role === 'architect' ? 'ARCHITECT' : 'SCRUM_MASTER',
      input.employeeId,
      currentUser.supabaseUserId,
    );
  }

  async findTeamOrganization(teamId: string) {
    const organization = await this.repository.findTeamOrganization(teamId);
    if (!organization) throw new NotFoundException('Team not found');
    return organization;
  }

  async assertTeamLeader(
    teamId: string,
    user: AuthenticatedUser,
    roles: ('ARCHITECT' | 'SCRUM_MASTER')[],
  ): Promise<void> {
    if (user.role === 'Admin') return;
    const leaders = await this.findTeamLeaders(teamId);
    if (
      user.employeeId &&
      roles.some(
        (role) =>
          (role === 'ARCHITECT' ? leaders.architect : leaders.scrumMaster)
            ?.id === user.employeeId,
      )
    )
      return;
    throw new ForbiddenException(
      roles.length === 1
        ? 'Solo el Arquitecto del equipo puede realizar esta acción'
        : 'Solo los líderes del equipo pueden realizar esta acción',
    );
  }

  async assertTeamAccess(
    teamId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const organization = await this.repository.findTeamOrganization(teamId);
    if (!organization) throw new NotFoundException('Team not found');

    if (
      user.role !== 'Admin' &&
      user.employeeId &&
      !(await this.repository.isEmployeeInTeam(user.employeeId, teamId))
    ) {
      throw new ForbiddenException(
        'No tiene permisos para acceder a este equipo',
      );
    }
    if (user.role !== 'Admin' && !user.employeeId) {
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
    const employee = await this.repository.findEmployeeById(input.employeeId);
    const role = await this.repository.findRoleById(input.roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (HISTORICAL_ROLE_CODES.some((code) => code === role.code)) {
      throw new BadRequestException(
        `El rol ${role.name} es histórico y no se puede asignar`,
      );
    }
    const isLeaderRole =
      role.code === 'ARCHITECT' || role.code === 'SCRUM_MASTER';
    if (!employee && !isLeaderRole) {
      throw new NotFoundException('Employee not found');
    }
    if (isLeaderRole) {
      if (
        !(await this.repository.hasActiveEmployeeRole(
          input.employeeId,
          input.roleId,
        ))
      ) {
        const roleName =
          role.code === 'ARCHITECT' ? 'Arquitecto' : 'Scrum Master';
        throw new BadRequestException(
          `La persona no tiene el rol ${roleName} vigente. Cámbiale primero el rol en Usuarios.`,
        );
      }
      const leaders = await this.findTeamLeaders(teamId);
      const leader =
        role.code === 'ARCHITECT' ? leaders.architect : leaders.scrumMaster;
      if (leader && leader.id !== input.employeeId) {
        throw new ConflictException(
          `El equipo ya tiene otro líder con este rol: ${leader.fullName}. Usa Reemplazar en Equipos.`,
        );
      }
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
    const role = await this.repository.findRoleById(membership.role_id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'ARCHITECT') {
      throw new BadRequestException(
        'El arquitecto no se puede quitar. Usa Reemplazar en Equipos.',
      );
    }
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
