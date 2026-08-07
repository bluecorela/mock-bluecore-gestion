import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrganizationV2Repository } from './organization-v2.repository';
import { OrganizationV2Service } from './organization-v2.service';

describe('OrganizationV2Service', () => {
  let service: OrganizationV2Service;
  let repository: jest.Mocked<Pick<OrganizationV2Repository,
    | 'findClientById' | 'findProjectById' | 'createProject' | 'updateProject'
    | 'findTeamProjectAssignment' | 'findEmployeeById' | 'findRoleById'
    | 'createTeamProjectMembership' | 'findTeamProjectMembership' | 'endTeamProjectMembership'
    | 'findTeamOrganization' | 'findEmployees' | 'findRoles'>>;

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
    service = new OrganizationV2Service(repository as unknown as OrganizationV2Repository);
  });

  it('rejects a project whose client does not exist', async () => {
    repository.findClientById.mockResolvedValue(null);

    await expect(service.createProject({
      clientId: '00000000-0000-4000-8000-000000000000',
      code: 'example-project',
      name: 'Example Project',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a planned end date earlier than the start date', async () => {
    repository.findClientById.mockResolvedValue({ id: 'client-id' } as any);

    await expect(service.createProject({
      clientId: '00000000-0000-4000-8000-000000000000',
      code: 'example-project',
      name: 'Example Project',
      startDate: '2026-08-05',
      plannedEndDate: '2026-08-04',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createProject).not.toHaveBeenCalled();
  });

  it('rejects an update for a project that does not exist', async () => {
    repository.findProjectById.mockResolvedValue(null);

    await expect(service.updateProject(
      '00000000-0000-4000-8000-000000000000',
      { name: 'Updated project' },
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects assigning a member to an unknown team project assignment', async () => {
    repository.findTeamProjectAssignment.mockResolvedValue(null);

    await expect(service.assignTeamProjectMember('team-id', 'assignment-id', {
      employeeId: '00000000-0000-4000-8000-000000000001',
      roleId: '00000000-0000-4000-8000-000000000002',
      startedAt: '2026-08-05',
    }, { supabaseUserId: 'user-id' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a membership start before the team project assignment', async () => {
    repository.findTeamProjectAssignment.mockResolvedValue({
      id: 'assignment-id', started_at: '2026-08-05', ended_at: null,
    });
    repository.findEmployeeById.mockResolvedValue({ id: 'employee-id' });
    repository.findRoleById.mockResolvedValue({ id: 'role-id' });

    await expect(service.assignTeamProjectMember('team-id', 'assignment-id', {
      employeeId: '00000000-0000-4000-8000-000000000001',
      roleId: '00000000-0000-4000-8000-000000000002',
      startedAt: '2026-08-04',
    }, { supabaseUserId: 'user-id' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects ending a membership before its start date', async () => {
    repository.findTeamProjectAssignment.mockResolvedValue({ id: 'assignment-id' });
    repository.findTeamProjectMembership.mockResolvedValue({
      id: 'membership-id', is_active: true, started_at: '2026-08-05',
    });

    await expect(service.endTeamProjectMember(
      'team-id', 'assignment-id', 'membership-id', { endedAt: '2026-08-04' },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects filtering employees by an unknown team', async () => {
    repository.findTeamOrganization.mockResolvedValue(null);

    await expect(service.findEmployees('unknown-team')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findEmployees).not.toHaveBeenCalled();
  });

  it('lists all active employees when no team filter is supplied', async () => {
    repository.findEmployees.mockResolvedValue([]);

    await expect(service.findEmployees()).resolves.toEqual([]);
    expect(repository.findEmployees).toHaveBeenCalledWith(undefined);
  });
});
