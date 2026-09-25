import { RotationService } from './rotation.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('RotationService', () => {
  let service: RotationService;
  let dataService: { manageEmployeeMovement: jest.Mock };

  beforeEach(() => {
    dataService = {
      manageEmployeeMovement: jest
        .fn()
        .mockResolvedValue({ ok: true, movementId: 'movement-id' }),
    };
    service = new RotationService(
      dataService as unknown as SupabaseDataService,
    );
  });

  it('uses the transactional v2 operation to rotate an employee', async () => {
    await service.rotatePersonnel(
      {
        personnelId: 'employee-code',
        sourceTeamId: 'gb-web',
        destinationTeamId: 'gb-movil',
      },
      'auth-user-id',
    );

    expect(dataService.manageEmployeeMovement).toHaveBeenCalledWith({
      action: 'rotate',
      personnelId: 'employee-code',
      sourceTeamId: 'gb-web',
      destinationTeamId: 'gb-movil',
      createdBy: 'auth-user-id',
    });
  });

  it('includes a multi-team employee in the vacation pool context', async () => {
    const multiTeamEmployee = {
      id: 'replacement-code',
      name: 'Replacement',
      role: 'Ingeniero de Software',
      email: null,
      teamId: 'delivery-team',
      teamIds: ['delivery-team', 'pool-de-vacaciones'],
      status: 'activo' as const,
      onVacation: false,
      replacementStartSprintId: null,
    };
    Object.assign(dataService, {
      getTeams: jest.fn().mockResolvedValue([]),
      getPersonnel: jest.fn().mockResolvedValue([multiTeamEmployee]),
      getVacationingPersonnel: jest.fn().mockResolvedValue([]),
      getRotationHistory: jest.fn().mockResolvedValue([]),
    });

    await expect(service.getContext()).resolves.toMatchObject({
      vacationPool: [multiTeamEmployee],
    });
  });

  it('registers the replacement when starting a vacation', async () => {
    await service.sendOnVacation({
      personnelId: 'employee-code',
      sourceTeamId: 'gb-web',
      replacementId: 'replacement-code',
    });

    expect(dataService.manageEmployeeMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vacation_start',
        replacementId: 'replacement-code',
      }),
    );
  });

  it('does not trust the legacy pool source when ending a vacation', async () => {
    await service.reintegratePersonnel({
      personnelId: 'employee-code',
      sourceTeamId: 'pool-de-vacaciones',
      destinationTeamId: 'gb-web',
    });

    expect(dataService.manageEmployeeMovement).toHaveBeenCalledWith({
      action: 'vacation_end',
      personnelId: 'employee-code',
      destinationTeamId: 'gb-web',
      createdBy: undefined,
    });
  });
});
