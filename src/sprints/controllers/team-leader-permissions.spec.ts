import { Test } from '@nestjs/testing';
import { SprintsController } from './sprints.controller';
import { SprintsService } from '../services/sprints.service';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationRepository } from '../../organization/repositories/organization.repository';
import { StoryLoadController } from '../load/story-load.controller';
import { StoryLoadService } from '../load/story-load.service';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';

// Exercise the real authorization service before any write is delegated.
describe('Permisos de líderes en REST', () => {
  it.each(['create', 'preview', 'start', 'complete', 'remove'] as const)(
    '%s exige Arquitecto designado o Admin',
    async (action) => {
      const service = { [action]: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          OrganizationService,
          {
            provide: OrganizationRepository,
            useValue: {
              findTeamLeaders: jest
                .fn()
                .mockResolvedValue({
                  architect: { id: 'designado' },
                  scrumMaster: { id: 'sm' },
                }),
            },
          },
        ],
      }).compile();
      const controller = new SprintsController(
        service as unknown as SprintsService,
        module.get(OrganizationService),
      );
      for (const [role, employeeId, allowed] of [
        ['Arquitecto', 'designado', true],
        ['Arquitecto', 'integrante', false],
        ['Admin', null, true],
      ] as const) {
        const user = { role, employeeId } as AuthenticatedUser;
        const call =
          action === 'create' || action === 'preview'
            ? controller[action]('team', {} as never, user)
            : controller[action]('team', 'sprint', user);
        if (allowed) await expect(call).resolves.toBeUndefined();
        else
          await expect(call).rejects.toMatchObject({
            status: 403,
            message: 'Solo el Arquitecto del equipo puede realizar esta acción',
          });
      }
      expect(service[action]).toHaveBeenCalledTimes(2);
    },
  );
  it('cargar HU exige SM designado y rechaza SM integrante', async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrganizationService,
        {
          provide: OrganizationRepository,
          useValue: {
            findTeamLeaders: jest
              .fn()
              .mockResolvedValue({
                architect: null,
                scrumMaster: { id: 'sm' },
              }),
          },
        },
      ],
    }).compile();
    const service = { preview: jest.fn() };
    const controller = new StoryLoadController(
      service as unknown as StoryLoadService,
      module.get(OrganizationService),
    );
    for (const employeeId of ['sm', 'integrante']) {
      const call = controller.preview(
        'team',
        'sprint',
        { role: 'Scrum Master', employeeId } as AuthenticatedUser,
        {} as never,
      );
      if (employeeId === 'sm') await expect(call).resolves.toBeUndefined();
      else
        await expect(call).rejects.toMatchObject({
          status: 403,
          message: 'Solo los líderes del equipo pueden realizar esta acción',
        });
    }
    expect(service.preview).toHaveBeenCalledTimes(1);
  });
});
