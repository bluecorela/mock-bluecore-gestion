import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

describe('TeamsController', () => {
  it('delegates sprint evaluation creation to the service', async () => {
    const teamsService = {
      saveEvaluation: jest.fn().mockResolvedValue({ ok: true, sprintClosed: false }),
    } as unknown as TeamsService;
    const controller = new TeamsController(teamsService);
    const body = { teamId: 'sgb-evolucion', sprintId: 'sprint-17', evaluatorEmail: 'spoofed@example.com' };
    const user = { email: 'architect@bluecorela.com' } as AuthenticatedUser;

    await expect(controller.saveSprintEvaluation(body, user))
      .resolves.toEqual({ ok: true, sprintClosed: false });
    expect(teamsService.saveEvaluation).toHaveBeenCalledWith({
      ...body,
      evaluatorEmail: user.email,
    });
  });
});
