import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';
import { ReplaceTeamLeaderDto } from '../dto/team-leader.dto';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationRepository } from '../repositories/organization.repository';
import { OrganizationService } from './organization.service';
import type {
  Client,
  TeamOrganization,
} from '../interfaces/organization.interface';

describe('OrganizationService', () => {
  const authenticatedUser: AuthenticatedUser = {
    supabaseUserId: 'auth-user-id',
    oauthClientId: null,
    email: 'user@bluecorela.com',
    personnelId: 'employee-code',
    employeeId: 'employee-id',
    name: 'Example User',
    role: 'Scrum Master',
    teamId: 'team-id',
    teamIds: ['team-id'],
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
    leaders: { architect: null, scrumMaster: null },
  });

  let service: OrganizationService;
  let repository: jest.Mocked<
    Pick<
      OrganizationRepository,
      | 'findTeamLeaders'
      | 'replaceTeamLeader'
      | 'findLeaderCandidates'
      | 'hasActiveEmployeeRole'
      | 'findTeams'
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
      | 'isEmployeeInTeam'
    >
  >;

  beforeEach(() => {
    repository = {
      findTeamLeaders: jest
        .fn()
        .mockResolvedValue({ architect: null, scrumMaster: null }),
      replaceTeamLeader: jest.fn(),
      findLeaderCandidates: jest.fn(),
      hasActiveEmployeeRole: jest.fn(),
      findTeams: jest.fn(),
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
      isEmployeeInTeam: jest.fn(),
    };
    service = new OrganizationService(
      repository as unknown as OrganizationRepository,
    );
  });

  const leader = {
    id: 'leader-id',
    employeeCode: 'EMP-1',
    fullName: 'Ana Líder',
    email: 'ana@example.com',
  };

  it('consulta los líderes del equipo', async () => {
    repository.findTeamLeaders.mockResolvedValue({
      architect: leader,
      scrumMaster: null,
    });
    await expect(service.findTeamLeaders('team-id')).resolves.toEqual({
      architect: leader,
      scrumMaster: null,
    });
    expect(repository.findTeamLeaders).toHaveBeenCalledWith('team-id');
  });

  it('lista equipos con sus líderes y candidatos', async () => {
    repository.findTeams.mockResolvedValue([teamOrganization('team-id').team]);
    repository.findLeaderCandidates.mockResolvedValue({
      architects: [leader],
      scrumMasters: [],
    });
    await expect(service.findAllTeamLeaders()).resolves.toEqual([
      {
        team: { id: 'team-id', code: 'team-id', name: 'Example Team' },
        architect: null,
        scrumMaster: null,
      },
    ]);
    await expect(service.findLeaderCandidates()).resolves.toEqual({
      architects: [leader],
      scrumMasters: [],
    });
  });

  it.each([
    ['architect', 'ARCHITECT'],
    ['scrum-master', 'SCRUM_MASTER'],
  ])('reemplaza %s con el id de Auth', async (role, code) => {
    const result = {
      endedMemberships: 1,
      createdMemberships: 2,
      updatedPlannedSprints: 3,
    };
    repository.replaceTeamLeader.mockResolvedValue(result);
    await expect(
      service.replaceTeamLeader(
        'team-id',
        role,
        { employeeId: 'leader-id' },
        authenticatedUser,
      ),
    ).resolves.toEqual(result);
    expect(repository.replaceTeamLeader).toHaveBeenCalledWith(
      'team-id',
      code,
      'leader-id',
      authenticatedUser.supabaseUserId,
    );
  });

  it('rechaza un rol desconocido sin llamar a la RPC', async () => {
    await expect(
      service.replaceTeamLeader(
        'team-id',
        'otro',
        { employeeId: null },
        authenticatedUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceTeamLeader).not.toHaveBeenCalled();
  });

  it('envía arquitecto nulo a la RPC y conserva el error 400', async () => {
    const error = new BadRequestException(
      'El arquitecto no se puede quitar, solo reemplazar',
    );
    repository.replaceTeamLeader.mockRejectedValue(error);
    await expect(
      service.replaceTeamLeader(
        'team-id',
        'architect',
        { employeeId: null },
        authenticatedUser,
      ),
    ).rejects.toThrow(error);
    expect(repository.replaceTeamLeader).toHaveBeenCalledWith(
      'team-id',
      'ARCHITECT',
      null,
      authenticatedUser.supabaseUserId,
    );
  });

  it.each(['ARCHITECT', 'SCRUM_MASTER'])(
    'impide otro líder %s y permite la misma persona en otro proyecto',
    async (code) => {
      repository.findTeamProjectAssignment.mockResolvedValue({
        id: 'assignment-id',
        team_id: 'team-id',
        project_id: 'project-id',
        started_at: '2026-01-01',
        ended_at: null,
        is_primary: true,
      });
      repository.findEmployeeById.mockResolvedValue({
        id: 'employee-id',
        employee_code: 'EMP-2',
        full_name: 'Persona',
        email: 'p@example.com',
      });
      repository.findRoleById.mockResolvedValue({
        id: 'role-id',
        code,
        name: code,
      });
      repository.hasActiveEmployeeRole.mockResolvedValue(true);
      const leaders = {
        architect: null,
        scrumMaster: null,
        [code === 'ARCHITECT' ? 'architect' : 'scrumMaster']: leader,
      };
      repository.findTeamLeaders.mockResolvedValue(leaders);
      const input = {
        employeeId: 'employee-id',
        roleId: 'role-id',
        startedAt: '2026-08-05',
      };
      await expect(
        service.assignTeamProjectMember(
          'team-id',
          'assignment-id',
          input,
          authenticatedUser,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'El equipo ya tiene otro líder con este rol: Ana Líder. Usa Reemplazar en Equipos.',
        ),
      );
      expect(repository.createTeamProjectMembership).not.toHaveBeenCalled();
      await service.assignTeamProjectMember(
        'team-id',
        'assignment-id',
        { ...input, employeeId: leader.id },
        authenticatedUser,
      );
      expect(repository.createTeamProjectMembership).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: leader.id }),
      );
    },
  );

  describe('rol vigente en el alta directa', () => {
    const input = {
      employeeId: 'employee-id',
      roleId: 'role-id',
      startedAt: '2026-08-05',
    };

    beforeEach(() => {
      repository.findTeamProjectAssignment.mockResolvedValue({
        id: 'assignment-id',
        team_id: 'team-id',
        project_id: 'project-id',
        started_at: '2026-01-01',
        ended_at: null,
        is_primary: true,
      });
      repository.findEmployeeById.mockResolvedValue({
        id: input.employeeId,
        employee_code: 'EMP-2',
        full_name: 'Nueva contratación',
        email: 'persona@example.com',
      });
      repository.findRoleById.mockResolvedValue({
        id: input.roleId,
        code: 'ARCHITECT',
        name: 'Arquitecto',
      });
    });

    it.each([
      ['ARCHITECT', 'Arquitecto', 'ingeniero sin el rol'],
      ['SCRUM_MASTER', 'Scrum Master', 'ingeniero sin el rol'],
      ['ARCHITECT', 'Arquitecto', 'rol expirado'],
      ['ARCHITECT', 'Arquitecto', 'rol futuro'],
      ['ARCHITECT', 'Arquitecto', 'empleado inactivo'],
      ['ARCHITECT', 'Arquitecto', 'empleado eliminado'],
    ])(
      'rechaza %s para %s: %s antes del conflicto con otro líder',
      async (code, name) => {
        repository.findRoleById.mockResolvedValue({
          id: input.roleId,
          code,
          name,
        });
        if (code === 'ARCHITECT') {
          repository.findRoleById.mockResolvedValue({
            id: input.roleId,
            code,
            name: 'Architect',
          });
        }
        repository.hasActiveEmployeeRole.mockResolvedValue(false);
        repository.findTeamLeaders.mockResolvedValue({
          architect: leader,
          scrumMaster: leader,
        });

        await expect(
          service.assignTeamProjectMember(
            'team-id',
            'assignment-id',
            input,
            authenticatedUser,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            `La persona no tiene el rol ${name} vigente. Cámbiale primero el rol en Usuarios.`,
          ),
        );
        expect(repository.hasActiveEmployeeRole).toHaveBeenCalledWith(
          input.employeeId,
          input.roleId,
        );
        expect(repository.findTeamLeaders).not.toHaveBeenCalled();
        expect(repository.createTeamProjectMembership).not.toHaveBeenCalled();
      },
    );

    it('rechaza con 400 al líder eliminado aunque la búsqueda del empleado lo excluya', async () => {
      repository.findEmployeeById.mockResolvedValue(null);
      repository.hasActiveEmployeeRole.mockResolvedValue(false);

      await expect(
        service.assignTeamProjectMember(
          'team-id',
          'assignment-id',
          input,
          authenticatedUser,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'La persona no tiene el rol Arquitecto vigente. Cámbiale primero el rol en Usuarios.',
        ),
      );
      expect(repository.createTeamProjectMembership).not.toHaveBeenCalled();
    });

    it('asigna una nueva contratación con rol Arquitecto vigente', async () => {
      repository.hasActiveEmployeeRole.mockResolvedValue(true);
      repository.createTeamProjectMembership.mockResolvedValue({
        id: 'membership-id',
      } as Awaited<
        ReturnType<OrganizationRepository['createTeamProjectMembership']>
      >);

      await expect(
        service.assignTeamProjectMember(
          'team-id',
          'assignment-id',
          input,
          authenticatedUser,
        ),
      ).resolves.toEqual({ id: 'membership-id' });
      expect(repository.hasActiveEmployeeRole).toHaveBeenCalledWith(
        input.employeeId,
        input.roleId,
      );
      expect(repository.createTeamProjectMembership).toHaveBeenCalledWith({
        teamProjectId: 'assignment-id',
        ...input,
        createdBy: authenticatedUser.supabaseUserId,
      });
    });

    it('asigna SOFTWARE_ENGINEER sin consultar employee_roles', async () => {
      repository.findRoleById.mockResolvedValue({
        id: input.roleId,
        code: 'SOFTWARE_ENGINEER',
        name: 'Ingeniero de Software',
      });

      await service.assignTeamProjectMember(
        'team-id',
        'assignment-id',
        input,
        authenticatedUser,
      );
      expect(repository.hasActiveEmployeeRole).not.toHaveBeenCalled();
      expect(repository.createTeamProjectMembership).toHaveBeenCalled();
    });
  });

  it.each([
    { employeeId: null },
    { employeeId: '00000000-0000-4000-8000-000000000001' },
  ])('acepta un DTO válido %p', async (body) => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(body, { type: 'body', metatype: ReplaceTeamLeaderDto }),
    ).resolves.toEqual(body);
  });

  it.each([
    {},
    { employeeId: undefined },
    { employeeId: 'otro' },
    { employeeId: null, extra: true },
  ])('rechaza un DTO inválido %p', async (body) => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(body, { type: 'body', metatype: ReplaceTeamLeaderDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('omite los códigos históricos al listar roles', async () => {
    const activeRole = {
      id: 'qa-id',
      code: 'QA_ENGINEER',
      name: 'Ingeniero de QA',
    };
    repository.findRoles.mockResolvedValue([
      activeRole,
      { id: 'intern-id', code: 'INTERN', name: 'Pasante' },
      {
        id: 'wellbeing-id',
        code: 'WELLBEING_CREATOR',
        name: 'Creador de Bienestar',
      },
    ]);

    await expect(service.findRoles()).resolves.toEqual([activeRole]);
  });

  it.each([
    ['INTERN', 'Pasante'],
    ['WELLBEING_CREATOR', 'Creador de Bienestar'],
  ])('rechaza asignar el rol histórico %s', async (code, name) => {
    repository.findTeamProjectAssignment.mockResolvedValue({
      id: 'assignment-id',
      team_id: 'team-id',
      project_id: 'project-id',
      started_at: '2026-08-01',
      ended_at: null,
      is_primary: true,
    });
    repository.findEmployeeById.mockResolvedValue({
      id: 'employee-id',
      employee_code: 'EMP-1',
      full_name: 'Persona de prueba',
      email: 'persona@example.com',
    });
    repository.findRoleById.mockResolvedValue({ id: 'role-id', code, name });

    await expect(
      service.assignTeamProjectMember(
        'team-id',
        'assignment-id',
        {
          employeeId: 'employee-id',
          roleId: 'role-id',
          startedAt: '2026-08-05',
        },
        authenticatedUser,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `El rol ${name} es histórico y no se puede asignar`,
      ),
    );
    expect(repository.createTeamProjectMembership).not.toHaveBeenCalled();
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

  describe('endTeamProjectMember', () => {
    beforeEach(() => {
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
        role_id: 'membership-role-id',
        is_active: true,
        started_at: '2026-08-05',
        ended_at: null,
      });
    });

    it('rechaza quitar al arquitecto sin cerrar la asignación', async () => {
      repository.findRoleById.mockResolvedValue({
        id: 'membership-role-id',
        code: 'ARCHITECT',
        name: 'Arquitecto',
      });

      const result = service.endTeamProjectMember(
        'team-id',
        'assignment-id',
        'membership-id',
        { endedAt: '2026-08-06' },
      );

      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toHaveProperty(
        'message',
        'El arquitecto no se puede quitar. Usa Reemplazar en Equipos.',
      );
      expect(repository.findRoleById).toHaveBeenCalledWith(
        'membership-role-id',
      );
      expect(repository.endTeamProjectMembership).not.toHaveBeenCalled();
    });

    it.each(['SCRUM_MASTER', 'SOFTWARE_ENGINEER'])(
      'permite cerrar una asignación de %s',
      async (code) => {
        repository.findRoleById.mockResolvedValue({
          id: 'membership-role-id',
          code,
          name: code,
        });

        await expect(
          service.endTeamProjectMember(
            'team-id',
            'assignment-id',
            'membership-id',
            { endedAt: '2026-08-06' },
          ),
        ).resolves.toEqual({
          id: 'membership-id',
          endedAt: '2026-08-06',
          isActive: false,
        });
        expect(repository.endTeamProjectMembership).toHaveBeenCalledTimes(1);
        expect(repository.endTeamProjectMembership).toHaveBeenCalledWith(
          'membership-id',
          '2026-08-06',
        );
      },
    );
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

    repository.findRoleById.mockResolvedValue({
      id: 'role-id',
      code: 'SOFTWARE_ENGINEER',
      name: 'Ingeniero de software',
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
    repository.isEmployeeInTeam.mockResolvedValue(true);

    await expect(
      service.assertTeamAccess('team-id', authenticatedUser),
    ).resolves.toBeUndefined();
  });

  it('rejects a user accessing a different team', async () => {
    repository.findTeamOrganization.mockResolvedValue(
      teamOrganization('another-team'),
    );
    repository.isEmployeeInTeam.mockResolvedValue(false);

    await expect(
      service.assertTeamAccess('another-team', authenticatedUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['ARCHITECT', 'SCRUM_MASTER'] as const)(
    'autoriza solo al líder %s vigente',
    async (role) => {
      repository.findTeamLeaders.mockResolvedValue({
        architect:
          role === 'ARCHITECT' ? { id: authenticatedUser.employeeId } : null,
        scrumMaster:
          role === 'SCRUM_MASTER' ? { id: authenticatedUser.employeeId } : null,
      } as Awaited<ReturnType<OrganizationRepository['findTeamLeaders']>>);
      const roles =
        role === 'ARCHITECT'
          ? (['ARCHITECT'] as const)
          : (['ARCHITECT', 'SCRUM_MASTER'] as const);
      await expect(
        service.assertTeamLeader('team', authenticatedUser, [...roles]),
      ).resolves.toBeUndefined();
      await expect(
        service.assertTeamLeader(
          'team',
          { ...authenticatedUser, employeeId: 'otro' },
          [...roles],
        ),
      ).rejects.toThrow(
        role === 'ARCHITECT'
          ? 'Solo el Arquitecto del equipo puede realizar esta acción'
          : 'Solo los líderes del equipo pueden realizar esta acción',
      );
      await expect(
        service.assertTeamLeader(
          'team',
          { ...authenticatedUser, role: 'Admin', employeeId: null },
          [...roles],
        ),
      ).resolves.toBeUndefined();
    },
  );
});

describe('OrganizationRepository: líderes con Supabase simulado', () => {
  function setup(data: unknown = [], error: unknown = null) {
    const query = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data, error }),
      maybeSingle: jest.fn().mockResolvedValue({ data, error }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data, error }).then(resolve),
    };
    const database = {
      from: jest.fn().mockReturnValue(query),
      rpc: jest.fn().mockResolvedValue({ data, error }),
    };
    const client = { getV2Client: jest.fn().mockReturnValue(database) };
    return {
      repository: new OrganizationRepository(
        client as unknown as SupabaseClient,
      ),
      query,
      database,
    };
  }

  it.each(['replace', 'insert'])(
    'convierte P0001 en 400 para %s',
    async (operation) => {
      const message = 'El equipo ya tiene otro líder activo con este rol';
      const { repository } = setup(null, { code: 'P0001', message });
      const promise =
        operation === 'replace'
          ? repository.replaceTeamLeader(
              'team-id',
              'ARCHITECT',
              null,
              'auth-id',
            )
          : repository.createTeamProjectMembership({
              teamProjectId: 'assignment-id',
              employeeId: 'employee-id',
              roleId: 'role-id',
              startedAt: '2026-01-01',
              createdBy: 'auth-id',
            });
      await expect(promise).rejects.toThrow(new BadRequestException(message));
    },
  );

  it('pasa los cuatro parámetros exactos a la RPC y devuelve su jsonb', async () => {
    const result = {
      endedMemberships: 1,
      createdMemberships: 0,
      updatedPlannedSprints: 2,
    };
    const { repository, database } = setup(result);
    await expect(
      repository.replaceTeamLeader('team-id', 'SCRUM_MASTER', null, 'auth-id'),
    ).resolves.toEqual(result);
    expect(database.rpc).toHaveBeenCalledWith('replace_team_leader', {
      p_team_id: 'team-id',
      p_role_code: 'SCRUM_MASTER',
      p_employee_id: null,
      p_created_by: 'auth-id',
    });
  });

  it('devuelve líderes nulos en un equipo sin proyectos', async () => {
    const { repository, database } = setup([]);
    const teamQuery = setup({
      id: 'team-id',
      code: 'TEAM',
      name: 'Equipo',
    }).query;
    database.from.mockReturnValueOnce(teamQuery);
    await expect(repository.findTeamOrganization('team-id')).resolves.toEqual(
      expect.objectContaining({
        assignments: [],
        leaders: { architect: null, scrumMaster: null },
      }),
    );
  });

  it.each([
    { is_active: false },
    { started_at: '2999-01-01' },
    { ended_at: '2000-01-01' },
    {
      team_projects: {
        team_id: 'team-id',
        ended_at: '2026-01-01',
        projects: { status: 'active', deleted_at: null },
      },
    },
    { employees: { status: 'inactive', deleted_at: null } },
    { employees: { status: 'active', deleted_at: '2026-01-01' } },
  ])('excluye de los líderes la fila no vigente %p', async (invalid) => {
    const employee = {
      id: 'employee-id',
      employee_code: 'EMP',
      full_name: 'Ana',
      email: 'ana@example.com',
      status: 'active',
      deleted_at: null,
    };
    const valid = {
      is_active: true,
      started_at: '2020-01-01',
      ended_at: null,
      team_projects: {
        team_id: 'team-id',
        ended_at: null,
        projects: { status: 'active', deleted_at: null },
      },
      employees: employee,
      roles: { code: 'ARCHITECT' },
    };
    const rows = [
      valid,
      { ...valid, ...invalid, roles: { code: 'SCRUM_MASTER' } },
    ];
    // Simular los filtros de PostgREST sobre las filas, sin conexión a la base.
    const { repository, query } = setup();
    const valueAt = (row: object, path: string): unknown =>
      path
        .split('.')
        .reduce<unknown>(
          (value, key) => (value as Record<string, unknown>)[key],
          row,
        );
    query.then = (resolve) => {
      const filtered = rows.filter(
        (row) =>
          query.eq.mock.calls.every(
            ([key, value]) => valueAt(row, String(key)) === value,
          ) &&
          query.is.mock.calls.every(
            ([key, value]) => valueAt(row, String(key)) === value,
          ) &&
          query.lte.mock.calls.every(
            ([key, value]) => String(valueAt(row, String(key))) <= value,
          ) &&
          query.in.mock.calls.every(([key, values]) =>
            values.includes(valueAt(row, String(key))),
          ) &&
          query.or.mock.calls.every(([expression]) => {
            const today = expression.split('ended_at.gte.')[1];
            return row.ended_at === null || row.ended_at >= today;
          }),
      );
      return Promise.resolve({ data: filtered, error: null }).then(resolve);
    };
    await expect(repository.findTeamLeaders('team-id')).resolves.toEqual({
      architect: {
        id: employee.id,
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        email: employee.email,
      },
      scrumMaster: null,
    });
  });

  it('filtra asignaciones vigentes, proyectos abiertos y empleados activos no eliminados', async () => {
    const { repository, query } = setup([]);
    await expect(repository.findTeamLeaders('team-id')).resolves.toEqual({
      architect: null,
      scrumMaster: null,
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.lte).toHaveBeenCalledWith('started_at', today);
    expect(query.or).toHaveBeenCalledWith(
      `ended_at.is.null,ended_at.gte.${today}`,
    );
    expect(query.eq).toHaveBeenCalledWith('team_projects.team_id', 'team-id');
    expect(query.is).toHaveBeenCalledWith('team_projects.ended_at', null);
    expect(query.eq).toHaveBeenCalledWith('employees.status', 'active');
    expect(query.is).toHaveBeenCalledWith('employees.deleted_at', null);
    expect(query.in).toHaveBeenCalledWith('roles.code', [
      'ARCHITECT',
      'SCRUM_MASTER',
    ]);
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('team_projects!inner'),
    );
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('employees!inner'),
    );
  });

  it.each([
    ['vigente sin fin', '2020-01-01', null, 'active', null, true],
    [
      'vigente en los límites',
      '2026-11-07',
      '2026-11-07',
      'active',
      null,
      true,
    ],
    ['expirado', '2020-01-01', '2026-11-06', 'active', null, false],
    ['futuro', '2026-11-08', null, 'active', null, false],
    ['inactivo', '2020-01-01', null, 'inactive', null, false],
    ['eliminado', '2020-01-01', null, 'active', '2026-11-01', false],
  ])(
    'comprueba el rol del empleado: %s',
    async (_label, startedAt, endedAt, status, deletedAt, expected) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-07T00:30:00Z'));
      try {
        const { repository, query, database } = setup();
        const row: Record<string, unknown> = {
          employee_id: 'employee-id',
          role_id: 'role-id',
          started_at: startedAt,
          ended_at: endedAt,
          'employees.status': status,
          'employees.deleted_at': deletedAt,
        };
        query.then = (resolve) => {
          const matches =
            query.eq.mock.calls.every(
              ([key, value]) => row[String(key)] === value,
            ) &&
            query.is.mock.calls.every(
              ([key, value]) => row[String(key)] === value,
            ) &&
            query.lte.mock.calls.every(
              ([key, value]) => String(row[String(key)]) <= value,
            ) &&
            query.or.mock.calls.every(
              ([expression]) =>
                endedAt === null ||
                String(endedAt) >= expression.split('ended_at.gte.')[1],
            );
          return Promise.resolve({
            data: matches ? [row] : [],
            error: null,
          }).then(resolve);
        };

        await expect(
          repository.hasActiveEmployeeRole('employee-id', 'role-id'),
        ).resolves.toBe(expected);
        expect(database.from).toHaveBeenCalledWith('employee_roles');
        expect(query.select).toHaveBeenCalledWith(
          expect.stringContaining('employees!inner'),
        );
        expect(query.eq).toHaveBeenCalledWith('employee_id', 'employee-id');
        expect(query.eq).toHaveBeenCalledWith('role_id', 'role-id');
        expect(query.lte).toHaveBeenCalledWith('started_at', '2026-11-07');
        expect(query.or).toHaveBeenCalledWith(
          'ended_at.is.null,ended_at.gte.2026-11-07',
        );
        expect(query.eq).toHaveBeenCalledWith('employees.status', 'active');
        expect(query.is).toHaveBeenCalledWith('employees.deleted_at', null);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('mapea y deduplica candidatos con el rol vigente', async () => {
    const employee = {
      id: 'employee-id',
      employee_code: 'EMP',
      full_name: 'Ana',
      email: 'ana@example.com',
    };
    const row = { employees: employee, roles: { code: 'ARCHITECT' } };
    const { repository, query } = setup([
      row,
      row,
      { ...row, roles: { code: 'SCRUM_MASTER' } },
    ]);
    const summary = {
      id: employee.id,
      employeeCode: 'EMP',
      fullName: 'Ana',
      email: employee.email,
    };
    await expect(repository.findLeaderCandidates()).resolves.toEqual({
      architects: [summary],
      scrumMasters: [summary],
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(query.lte).toHaveBeenCalledWith('started_at', today);
    expect(query.or).toHaveBeenCalledWith(
      `ended_at.is.null,ended_at.gte.${today}`,
    );
    expect(query.eq).toHaveBeenCalledWith('employees.status', 'active');
    expect(query.is).toHaveBeenCalledWith('employees.deleted_at', null);
  });
});
