import { RotationHistoryController } from './rotation-history.controller';
import type { RotationHistoryService } from './rotation-history.service';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

describe('RotationHistoryController authorization', () => {
  it('shows only rotations involving the authenticated team', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'own', fromTeam: 'team-a', toTeam: 'team-b' },
        { id: 'other', fromTeam: 'team-c', toTeam: 'team-d' },
      ]),
    } as unknown as RotationHistoryService;
    const controller = new RotationHistoryController(service);
    const user = {
      role: 'Arquitecto',
      teamId: 'team-a',
      teamIds: ['team-a'],
    } as AuthenticatedUser;

    await expect(controller.findAll(user)).resolves.toEqual([
      expect.objectContaining({ id: 'own' }),
    ]);
  });

  it('includes rotations involving a secondary active team', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'secondary', fromTeam: 'team-c', toTeam: 'TEAM-B' },
        { id: 'other', fromTeam: 'team-c', toTeam: 'team-d' },
      ]),
    } as unknown as RotationHistoryService;
    const controller = new RotationHistoryController(service);
    const user = {
      role: 'Arquitecto',
      teamId: 'team-a',
      teamIds: ['team-a', 'team-b'],
    } as AuthenticatedUser;

    await expect(controller.findAll(user)).resolves.toEqual([
      expect.objectContaining({ id: 'secondary' }),
    ]);
  });
});
