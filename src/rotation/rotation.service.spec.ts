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
