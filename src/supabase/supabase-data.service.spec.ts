import { OrganizationRepository } from '../organization/repositories/organization.repository';
import { Test } from '@nestjs/testing';
import { SupabaseDataService } from './supabase-data.service';
import { SupabaseClient } from './supabase.client';
import { TeamDirectoryRepository } from './repositories/team-directory.repository';
import { NavigationRepository } from './repositories/navigation.repository';

describe('SupabaseDataService: escritura de roles', () => {
  let service: SupabaseDataService;
  const rpc = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SupabaseDataService,
        { provide: OrganizationRepository, useValue: {} },
        {
          provide: SupabaseClient,
          useValue: { getV2Client: jest.fn(() => ({ rpc })) },
        },
        { provide: TeamDirectoryRepository, useValue: {} },
        { provide: NavigationRepository, useValue: {} },
      ],
    }).compile();
    service = module.get(SupabaseDataService);
    rpc.mockResolvedValue({ data: 'empleado-id', error: null });
    jest.spyOn(service, 'getPersonnelById').mockResolvedValue(null);
  });

  it.each(['Pasante', 'Creador de Bienestar'])(
    'rechaza el rol histórico %s en las escrituras públicas',
    async (role) => {
      await expect(
        service.updatePersonnel('empleado-id', { role }),
      ).rejects.toThrow(`Unsupported personnel role: ${role}`);
      await expect(
        service.createPersonnel({
          name: 'Ana',
          email: 'ana@example.com',
          role,
        }),
      ).rejects.toThrow(`Unsupported personnel role: ${role}`);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['Pasante', 'INTERN'],
    ['Creador de Bienestar', 'WELLBEING_CREATOR'],
  ])(
    'restaura %s con el código %s solo con la opción interna',
    async (role, roleCode) => {
      await service.updatePersonnel(
        'empleado-id',
        { role },
        { allowHistoricalRoles: true },
      );

      expect(rpc).toHaveBeenCalledWith('update_employee_with_assignments', {
        p_payload: { employeeId: 'empleado-id', roleCode },
      });
      expect(service.getPersonnelById).toHaveBeenCalledWith('empleado-id');
    },
  );

  it('conserva el código de un rol vigente sin opciones', async () => {
    await service.updatePersonnel('empleado-id', { role: 'Ingeniero de QA' });

    expect(rpc).toHaveBeenCalledWith('update_employee_with_assignments', {
      p_payload: { employeeId: 'empleado-id', roleCode: 'QA_ENGINEER' },
    });
  });
});

describe('SupabaseDataService: identidad del empleado', () => {
  it.each(['px4vN55npYtPR3YnEERp', null])(
    'conserva el id público y expone el UUID con employee_code=%s',
    async (employeeCode) => {
      const employeeId = '11111111-1111-4111-8111-111111111111';
      const employee = {
        id: employeeId,
        employee_code: employeeCode,
        full_name: 'Ana',
        email: 'ana@example.com',
        status: 'active',
      };
      const from = jest.fn((table: string) => {
        const result = {
          data: table === 'employees' ? [employee] : [],
          error: null,
        };
        const query = {
          select: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return query;
      });
      const module = await Test.createTestingModule({
        providers: [
          SupabaseDataService,
          { provide: OrganizationRepository, useValue: {} },
          {
            provide: SupabaseClient,
            useValue: { getV2Client: () => ({ from }) },
          },
          { provide: TeamDirectoryRepository, useValue: {} },
          { provide: NavigationRepository, useValue: {} },
        ],
      }).compile();
      await expect(
        module.get(SupabaseDataService).getPersonnel(),
      ).resolves.toEqual([
        expect.objectContaining({ id: employeeCode ?? employeeId, employeeId }),
      ]);
    },
  );
});
