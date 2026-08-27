import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';
import type {
  Client,
  TeamOrganization,
} from './interfaces/organization.interface';

describe('OrganizationService', () => {
  const authenticatedUser: AuthenticatedUser = {
    supabaseUserId: 'auth-user-id',
    email: 'user@bluecorela.com',
    personnelId: 'employee-id',
    name: 'Example User',
    role: 'Scrum Master',
    teamId: 'team-id',
    mustChangePassword: false,
  };
  const teamOrganization = (teamId: string): TeamOrganization => ({
    team: {
      id: teamId,
      code: teamId,
      name: 'Example Team',
      description: null,
      status: 'active',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      deletedAt: null,
    },
    assignments: [],
  });

  let service: OrganizationService;
  let repository: jest.Mocked<
    Pick<
      OrganizationRepository,
      | 'findClientById'
      | 'findProjectById'
      | 'createProject'
      | 'updateProject'
      | 'findTeamProjectAssignment'
      | 'findEmployeeById'
      | 'findRoleById'
      | 'createTeamProjectMembership'
      | 'findTeamProjectMembership'
      | 'endTeamProjectMembership'
      | 'findTeamOrganization'
      | 'findEmployees'
      | 'findRoles'
    >
  >;

  beforeEach(() => {
    repository = {
      findClientById: jest.fn(),
      findProjectById: jest.fn(),
      createProject: jest.fn(),
      updateProject: jest.fn(),
      findTeamProjectAssignment: jest.fn(),
      findEmployeeById: jest.fn(),
      findRoleById: jest.fn(),
      createTeamProjectMembership: jest.fn(),
      findTeamProjectMembership: jest.fn(),
      endTeamProjectMembership: jest.fn(),
      findTeamOrganization: jest.fn(),
      findEmployees: jest.fn(),
      findRoles: jest.fn(),
    };
    service = new OrganizationService(
      repository as unknown as OrganizationRepository,
    );
  });

  it('rejects a project whose client does not exist', async () => {
    repository.findClientById.mockResolvedValue(null);

    await expect(
      service.createProject({
        clientId: '00000000-0000-4000-8000-000000000000',
        code: 'example-project',
        name: 'Example Project',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a planned end date earlier than the start date', async () => {
    repository.findClientById.mockResolvedValue({
      id: 'client-id',
      code: 'client-code',
      name: 'Example Client',
      status: 'active',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      deletedAt: null,
    } satisfies Client);

    await expect(
      service.createProject({
        clientId: '00000000-0000-4000-8000-000000000000',
        code: 'example-project',
        name: 'Example Project',
        startDate: '2026-08-05',
        plannedEndDate: '2026-08-04',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createProject).not.toHaveBeenCalled();
  });

  it('rejects an update for a project that does not exist', async () => {
    repository.findProjectById.mockResolvedValue(null);

    await expect(
      service.updateProject('00000000-0000-4000-8000-000000000000', {
        name: 'Updated project',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects assigning a member to an unknown team project assignment', async () => {
    repository.findTeamProjectAssignment.mockResolvedValue(null);

    await expect(
      service.assignTeamProjectMember(
        'team-id',
        'assignment-id',
        {
          employeeId: '00000000-0000-4000-8000-000000000001',
          roleId: '00000000-0000-4000-8000-000000000002',
          startedAt: '2026-08-05',
        },
        authenticatedUser,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a membership start before the team project assignment', async () => {
    repository.findTeamProjectAssignment.mockResolvedValue({
      id: 'assignment-id',
      team_id: 'team-id',
      project_id: 'project-id',
      started_at: '2026-08-05',
      ended_at: null,
      is_primary: true,
    });
    repository.findEmployeeById.mockResolvedValue({
      id: 'employee-id',
      employee_code: 'EMP-1',
      full_name: 'Test Employee',
      email: 'employee@example.com',
    });
    repository.findRoleById.mockResolvedValue({
      id: 'role-id',
      code: 'DEV',
      name: 'Developer',
    });

    await expect(
      service.assignTeamProjectMember(
        'team-id',
        'assignment-id',
        {
          employeeId: '00000000-0000-4000-8000-000000000001',
          roleId: '00000000-0000-4000-8000-000000000002',
          startedAt: '2026-08-04',
        },
        authenticatedUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects ending a membership before its start date', async () => {
    repository.findTeamProjectAssignment.mockResolvedValue({
      id: 'assignment-id',
      team_id: 'team-id',
      project_id: 'project-id',
      started_at: '2026-08-01',
      ended_at: null,
      is_primary: true,
    });
    repository.findTeamProjectMembership.mockResolvedValue({
      id: 'membership-id',
      team_project_id: 'assignment-id',
      employee_id: 'employee-id',
      role_id: 'role-id',
      is_active: true,
      started_at: '2026-08-05',
      ended_at: null,
    });

    await expect(
      service.endTeamProjectMember(
        'team-id',
        'assignment-id',
        'membership-id',
        { endedAt: '2026-08-04' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects filtering employees by an unknown team', async () => {
    repository.findTeamOrganization.mockResolvedValue(null);

    await expect(service.findEmployees('unknown-team')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.findEmployees).not.toHaveBeenCalled();
  });

  it('lists all active employees when no team filter is supplied', async () => {
    repository.findEmployees.mockResolvedValue([]);

    await expect(service.findEmployees()).resolves.toEqual([]);
    expect(repository.findEmployees).toHaveBeenCalledWith(undefined);
  });

  it('rejects access to a team that does not exist', async () => {
    repository.findTeamOrganization.mockResolvedValue(null);

    await expect(
      service.assertTeamAccess('unknown-team', authenticatedUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows an administrator to access any existing team', async () => {
    repository.findTeamOrganization.mockResolvedValue(
      teamOrganization('another-team'),
    );

    await expect(
      service.assertTeamAccess('another-team', {
        ...authenticatedUser,
        role: 'Admin',
        teamId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows a user to access their assigned team', async () => {
    repository.findTeamOrganization.mockResolvedValue(
      teamOrganization('team-id'),
    );

    await expect(
      service.assertTeamAccess('team-id', authenticatedUser),
    ).resolves.toBeUndefined();
  });

  it('rejects a user accessing a different team', async () => {
    repository.findTeamOrganization.mockResolvedValue(
      teamOrganization('another-team'),
    );

    await expect(
      service.assertTeamAccess('another-team', authenticatedUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
