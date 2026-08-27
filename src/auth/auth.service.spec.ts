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
    user_metadata: { mustChangePassword: true },
  };
  const personnel = {
    id: 'employee-id',
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

  it('resolves the profile using the Supabase Auth user ID', async () => {
    jest
      .spyOn(dataService, 'getPersonnelByAuthUserId')
      .mockResolvedValue(personnel);

    await expect(service.validateAccessToken('token')).resolves.toMatchObject({
      supabaseUserId: authUser.id,
      personnelId: personnel.id,
      role: 'Arquitecto',
      mustChangePassword: true,
    });
    expect(dataService.getPersonnelByEmail).not.toHaveBeenCalled();
  });

  it('links a migrated profile found by email', async () => {
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(null);
    jest.spyOn(dataService, 'getPersonnelByEmail').mockResolvedValue(personnel);

    await service.validateAccessToken('token');

    expect(dataService.linkPersonnelToAuthUser).toHaveBeenCalledWith(
      personnel.id,
      authUser.id,
    );
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
        email: authUser.email,
        personnelId: personnel.id,
        name: personnel.name,
        role: personnel.role,
        teamId: null,
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
});
