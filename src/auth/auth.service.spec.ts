import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseClient } from '../supabase/supabase.client';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('AuthService', () => {
  const authUser = {
    id: 'auth-user-id',
    email: 'ana@bluecorela.com',
    user_metadata: { mustChangePassword: true },
  };
  const personnel = {
    id: 'employee-id', name: 'Ana Pérez', email: authUser.email,
    role: 'Arquitecto', teamId: null, status: 'activo', onVacation: false,
    replacementStartSprintId: null,
  };
  const authApi = {
    getUser: jest.fn(),
    signInWithPassword: jest.fn(),
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
  } as unknown as SupabaseDataService;
  const service = new AuthService(supabaseClient, dataService);

  beforeEach(() => {
    jest.clearAllMocks();
    authApi.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
  });

  it('resolves the profile using the Supabase Auth user ID', async () => {
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(personnel as any);

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
    jest.spyOn(dataService, 'getPersonnelByEmail').mockResolvedValue(personnel as any);

    await service.validateAccessToken('token');

    expect(dataService.linkPersonnelToAuthUser)
      .toHaveBeenCalledWith(personnel.id, authUser.id);
  });

  it('rejects an Auth user without a personnel profile', async () => {
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(null);
    jest.spyOn(dataService, 'getPersonnelByEmail').mockResolvedValue(null);

    await expect(service.validateAccessToken('token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns an access token for API documentation outside production', async () => {
    authApi.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'jwt-token', token_type: 'bearer', expires_at: 123 } },
      error: null,
    });
    jest.spyOn(dataService, 'getPersonnelByAuthUserId').mockResolvedValue(personnel as any);

    await expect(service.loginForApiDocumentation({
      email: authUser.email,
      password: 'Password123!',
    })).resolves.toMatchObject({ accessToken: 'jwt-token', user: { personnelId: personnel.id } });
  });

  it('returns the authenticated application bootstrap in one response', async () => {
    jest.spyOn(dataService, 'getModulesByRole').mockResolvedValue([{ id: 'home' }] as any);
    jest.spyOn(dataService, 'getMaintenanceStatus').mockResolvedValue({ active: false });

    await expect(service.getBootstrap({
      supabaseUserId: authUser.id,
      email: authUser.email,
      personnelId: personnel.id,
      name: personnel.name,
      role: personnel.role,
      teamId: null,
      mustChangePassword: false,
    })).resolves.toMatchObject({
      sidebarModules: [{ id: 'home' }],
      maintenance: { active: false },
      user: { personnelId: personnel.id },
    });
  });
});
