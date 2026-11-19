import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseClient } from '../supabase/supabase.client';
import { SupabaseDataService } from '../supabase/supabase-data.service';
import type {
  Personnel,
  SidebarModule,
} from '../supabase/interfaces/supabase-interface';

describe('AuthService', () => {
  const authUser = {
    id: 'auth-user-id',
    email: 'ana@bluecorela.com',
    email_confirmed_at: '2026-09-18T00:00:00Z',
    user_metadata: { mustChangePassword: true },
  };
  const personnel = {
    id: 'px4vN55npYtPR3YnEERp',
    employeeId: '11111111-1111-4111-8111-111111111111',
    name: 'Ana Pérez',
    email: authUser.email,
    role: 'Arquitecto',
    teamId: null,
    status: 'activo',
    onVacation: false,
    replacementStartSprintId: null,
  } satisfies Personnel;
  const authApi = {
    getUser: jest.fn(),
    signInWithPassword: jest.fn(),
    admin: {
      getUserById: jest.fn(),
      listUsers: jest.fn(),
      updateUserById: jest.fn(),
      createUser: jest.fn(),
    },
  };
  const supabaseClient = {
    getClient: jest.fn(() => ({ auth: authApi })),
    getPublicClient: jest.fn(() => ({ auth: authApi })),
  } as unknown as SupabaseClient;
  const dataService = {
    getPersonnelByAuthUserId: jest.fn(),
    getPersonnelByEmail: jest.fn(),
    linkPersonnelToAuthUser: jest.fn(),
    getModulesByRole: jest.fn(),
    getMaintenanceStatus: jest.fn(),
    getPersonnelById: jest.fn(),
    updatePersonnel: jest.fn(),
    getPersonnelAuthUserId: jest.fn(),
  } as unknown as SupabaseDataService;
  const service = new AuthService(supabaseClient, dataService);

  beforeEach(() => {
    jest.clearAllMocks();
    authApi.getUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
  });

  describe('tokens de clientes OAuth', () => {
    function token(payload: Record<string, unknown>) {
      return `cabecera.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma`;
    }

    beforeEach(() => {
      jest
        .spyOn(dataService, 'getPersonnelByAuthUserId')
        .mockResolvedValue(personnel);
    });

    it('rechaza el token de IA por defecto', async () => {
      const jwt = token({ client_id: 'abc' });
      await expect(
        service.validateAuthorizationHeader(`Bearer ${jwt}`),
      ).rejects.toThrow(
        new UnauthorizedException('Este acceso de IA solo sirve en /mcp'),
      );
      expect(authApi.getUser).toHaveBeenCalledWith(jwt);
    });

    it('acepta el token de IA con permiso explícito', async () => {
      await expect(
        service.validateAuthorizationHeader(
          `Bearer ${token({ client_id: 'abc' })}`,
          {
            allowOAuthClient: true,
          },
        ),
      ).resolves.toMatchObject({ oauthClientId: 'abc' });
    });

    it('rechaza un payload no JSON incluso si Supabase acepta el token', async () => {
      await expect(
        service.validateAccessToken('cabecera.bm8tZXMtanNvbg.firma'),
      ).rejects.toThrow(
        new UnauthorizedException('Token de Supabase inválido o expirado'),
      );
      expect(dataService.getPersonnelByAuthUserId).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'acepta una sesión normal con permiso %s',
      async (allowOAuthClient) => {
        await expect(
          service.validateAuthorizationHeader(
            `Bearer ${token({ sub: authUser.id })}`,
            {
              allowOAuthClient,
            },
          ),
        ).resolves.toMatchObject({ oauthClientId: null });
      },
    );

    it('no acepta un token OAuth rechazado por Supabase aunque tenga permiso', async () => {
      authApi.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Token inválido'),
      });
      await expect(
        service.validateAuthorizationHeader(
          `Bearer ${token({ client_id: 'abc' })}`,
          {
            allowOAuthClient: true,
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  it('resolves the profile using the Supabase Auth user ID', async () => {
    jest
      .spyOn(dataService, 'getPersonnelByAuthUserId')
      .mockResolvedValue(personnel);

    await expect(service.validateAccessToken('token')).resolves.toMatchObject({
      supabaseUserId: authUser.id,
      personnelId: personnel.id,
      employeeId: personnel.employeeId,
      role: 'Arquitecto',
      mustChangePassword: true,
    });
    expect(dataService.getPersonnelByEmail).not.toHaveBeenCalled();
  });

  it('links a migrated profile found by email', async () => {
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(null);
    jest.spyOn(dataService, 'getPersonnelByEmail').mockResolvedValue(personnel);
    jest.spyOn(dataService, 'linkPersonnelToAuthUser').mockResolvedValue(true);

    await service.validateAccessToken('token');

    expect(dataService.linkPersonnelToAuthUser).toHaveBeenCalledWith(
      personnel.id,
      authUser.id,
    );
  });

  it('rejects a profile already linked to another Auth account', async () => {
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(null);
    jest.spyOn(dataService, 'getPersonnelByEmail').mockResolvedValue(personnel);
    jest.spyOn(dataService, 'linkPersonnelToAuthUser').mockResolvedValue(false);
    await expect(service.validateAccessToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not link a migrated profile before email confirmation', async () => {
    authApi.getUser.mockResolvedValue({
      data: { user: { ...authUser, email_confirmed_at: null } },
      error: null,
    });
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(null);
    await expect(service.validateAccessToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(dataService.getPersonnelByEmail).not.toHaveBeenCalled();
  });

  it('rejects an Auth user without a personnel profile', async () => {
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(null);
    jest.spyOn(dataService, 'getPersonnelByEmail').mockResolvedValue(null);

    await expect(service.validateAccessToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns an access token for API documentation outside production', async () => {
    authApi.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'jwt-token',
          token_type: 'bearer',
          expires_at: 123,
        },
      },
      error: null,
    });
    jest
      .spyOn(dataService, 'getPersonnelByAuthUserId')
      .mockResolvedValue(personnel);

    await expect(
      service.loginForApiDocumentation({
        email: authUser.email,
        password: 'Password123!',
      }),
    ).resolves.toMatchObject({
      accessToken: 'jwt-token',
      user: { personnelId: personnel.id },
    });
  });

  it('returns the authenticated application bootstrap in one response', async () => {
    jest.spyOn(dataService, 'getModulesByRole').mockResolvedValue([
      {
        id: 'home',
        name: 'Inicio',
        route: '/home',
        icon: 'home',
        order: 1,
        visible: true,
        permittedRoles: ['Arquitecto'],
      } satisfies SidebarModule,
    ]);
    jest
      .spyOn(dataService, 'getMaintenanceStatus')
      .mockResolvedValue({ active: false });

    await expect(
      service.getBootstrap({
        supabaseUserId: authUser.id,
        oauthClientId: null,
        email: authUser.email,
        personnelId: personnel.id,
        employeeId: personnel.employeeId,
        name: personnel.name,
        role: personnel.role,
        teamId: null,
        teamIds: [],
        mustChangePassword: false,
      }),
    ).resolves.toMatchObject({
      sidebarModules: [{ id: 'home' }],
      maintenance: { active: false },
      user: { personnelId: personnel.id },
    });
  });

  it('rejects a role that requires a team when no team is assigned', async () => {
    jest.spyOn(dataService, 'getPersonnelById').mockResolvedValue(personnel);

    await expect(
      service.updateUser(personnel.id, {
        role: 'Ingeniero de Software',
        teamId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataService.updatePersonnel).not.toHaveBeenCalled();
  });

  it('updates an existing Supabase Auth user', async () => {
    const updatedPersonnel = {
      ...personnel,
      name: 'Ana Actualizada',
      status: 'inactivo',
    } satisfies Personnel;
    jest.spyOn(dataService, 'getPersonnelById').mockResolvedValue(personnel);
    jest
      .spyOn(dataService, 'updatePersonnel')
      .mockResolvedValue(updatedPersonnel);
    jest
      .spyOn(dataService, 'getPersonnelAuthUserId')
      .mockResolvedValue(authUser.id);
    authApi.admin.getUserById.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    authApi.admin.updateUserById.mockResolvedValue({ error: null });

    await expect(
      service.updateUser(personnel.id, {
        name: updatedPersonnel.name,
        status: 'inactivo',
      }),
    ).resolves.toMatchObject({
      ok: true,
      user: updatedPersonnel,
      emailSent: false,
    });
    expect(authApi.admin.updateUserById).toHaveBeenCalledWith(
      authUser.id,
      expect.objectContaining({
        ban_duration: '876000h',
        user_metadata: expect.objectContaining({
          name: updatedPersonnel.name,
          status: 'inactivo',
        }),
      }),
    );
  });

  it('restores the personnel profile when the Auth update fails', async () => {
    jest.spyOn(dataService, 'getPersonnelById').mockResolvedValue(personnel);
    jest
      .spyOn(dataService, 'updatePersonnel')
      .mockResolvedValue({ ...personnel, name: 'Nuevo nombre' });
    jest
      .spyOn(dataService, 'getPersonnelAuthUserId')
      .mockResolvedValue(authUser.id);
    authApi.admin.getUserById.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    authApi.admin.updateUserById.mockResolvedValue({
      error: new Error('Auth unavailable'),
    });

    await expect(
      service.updateUser(personnel.id, { name: 'Nuevo nombre' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataService.updatePersonnel).toHaveBeenLastCalledWith(
      personnel.id,
      expect.objectContaining({ name: personnel.name }),
      { allowHistoricalRoles: true },
    );
  });

  it.each([
    ['Pasante', true],
    ['Creador de Bienestar', true],
    ['Pasante', false],
    ['Creador de Bienestar', false],
  ] as const)(
    'restaura el rol histórico %s al fallar Auth (cuenta existente: %s)',
    async (role, hasAuthAccess) => {
      const historicalPersonnel = { ...personnel, role };
      const authError = new BadRequestException('Auth no disponible');
      jest
        .spyOn(dataService, 'getPersonnelById')
        .mockResolvedValue(historicalPersonnel);
      jest
        .spyOn(dataService, 'updatePersonnel')
        .mockResolvedValueOnce({
          ...personnel,
          role: 'Ingeniero de QA',
          teamId: 'equipo-qa',
        })
        .mockResolvedValueOnce(historicalPersonnel);
      jest
        .spyOn(dataService, 'getPersonnelAuthUserId')
        .mockResolvedValue(hasAuthAccess ? authUser.id : null);
      authApi.admin.getUserById.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });
      authApi.admin.listUsers.mockResolvedValue({
        data: { users: [] },
        error: null,
      });
      const authWrite = hasAuthAccess
        ? authApi.admin.updateUserById
        : authApi.admin.createUser;
      authWrite.mockRejectedValueOnce(authError);

      await expect(
        service.updateUser(personnel.id, {
          role: 'Ingeniero de QA',
          teamId: 'equipo-qa',
          password: 'Temporal123!',
        }),
      ).rejects.toBe(authError);
      expect(dataService.updatePersonnel).toHaveBeenNthCalledWith(
        1,
        personnel.id,
        expect.objectContaining({ role: 'Ingeniero de QA' }),
      );
      expect(dataService.updatePersonnel).toHaveBeenNthCalledWith(
        2,
        personnel.id,
        expect.objectContaining({ role, teamId: null }),
        { allowHistoricalRoles: true },
      );
    },
  );

  it('changes the password before clearing the initial-change flag', async () => {
    authApi.admin.getUserById.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    authApi.admin.updateUserById.mockResolvedValue({ error: null });
    await service.markPasswordChanged(
      { supabaseUserId: authUser.id } as never,
      'NewPassword123!',
    );
    expect(authApi.admin.updateUserById).toHaveBeenCalledWith(
      authUser.id,
      expect.objectContaining({
        password: 'NewPassword123!',
        user_metadata: expect.objectContaining({ mustChangePassword: false }),
      }),
    );
  });

  it('creates and links Supabase Auth access for personnel without an account', async () => {
    const updatedPersonnel = {
      ...personnel,
      email: 'new-access@bluecorela.com',
    } satisfies Personnel;
    jest.spyOn(dataService, 'getPersonnelById').mockResolvedValue(personnel);
    jest
      .spyOn(dataService, 'updatePersonnel')
      .mockResolvedValue(updatedPersonnel);
    jest.spyOn(dataService, 'getPersonnelAuthUserId').mockResolvedValue(null);
    authApi.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });
    authApi.admin.createUser.mockResolvedValue({
      data: { user: { id: 'new-auth-user-id' } },
      error: null,
    });
    jest.spyOn(dataService, 'linkPersonnelToAuthUser').mockResolvedValue(true);

    await expect(
      service.updateUser(personnel.id, {
        email: updatedPersonnel.email ?? undefined,
        password: 'Temporary123!',
        sendPasswordEmail: false,
      }),
    ).resolves.toMatchObject({
      ok: true,
      user: updatedPersonnel,
      emailSent: false,
      warning: 'Envío de correo omitido.',
    });
    expect(authApi.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: updatedPersonnel.email,
        password: 'Temporary123!',
      }),
    );
    expect(dataService.linkPersonnelToAuthUser).toHaveBeenCalledWith(
      personnel.id,
      'new-auth-user-id',
    );
  });
  it('propaga createdBy interno al alta de personal sin exponerlo en Auth', async () => {
    const createPersonnel = jest
      .fn()
      .mockResolvedValue({ id: 'new-personnel' });
    const creationData = {
      getPersonnelByEmail: jest.fn().mockResolvedValue(null),
      createPersonnel,
    };
    const creationService = new AuthService(
      supabaseClient,
      creationData as unknown as SupabaseDataService,
    );
    authApi.admin.createUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    await creationService.createUser({
      name: 'Ana',
      email: authUser.email,
      role: 'Arquitecto',
      password: 'ClaveTemporal123!',
      sendPasswordEmail: false,
      createdBy: 'admin-id',
    });
    expect(createPersonnel).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'admin-id',
        authUserId: authUser.id,
      }),
    );
    expect(authApi.admin.createUser.mock.calls.at(-1)![0]).not.toHaveProperty(
      'createdBy',
    );
  });
});
