import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

describe('TeamsController', () => {
  it('delegates sprint evaluation creation to the service', async () => {
    const teamsService = {
      assertTeamAccess: jest.fn().mockResolvedValue(undefined),
      saveEvaluation: jest
        .fn()
        .mockResolvedValue({ ok: true, sprintClosed: false }),
    } as unknown as TeamsService;
    const controller = new TeamsController(teamsService);
    const body = {
      teamId: 'sgb-evolucion',
      sprintId: 'sprint-17',
      startDate: '2026-08-03',
      endDate: '2026-08-14',
      engineer: 'Ana Pérez',
      metrics: {},
      finalScore: 90,
      ratingLabel: 'Excelente',
    };
    const user = { email: 'architect@bluecorela.com' } as AuthenticatedUser;

    await expect(controller.saveSprintEvaluation(body, user)).resolves.toEqual({
      ok: true,
      sprintClosed: false,
    });
    expect(teamsService.saveEvaluation).toHaveBeenCalledWith({
      ...body,
      evaluatorEmail: user.email,
    });
    expect(teamsService.assertTeamAccess).toHaveBeenCalledWith(
      body.teamId,
      user,
    );
  });
});
