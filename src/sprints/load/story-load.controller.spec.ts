import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  StoryByCodeController,
  StoryLoadController,
} from './story-load.controller';
import { StoryUpdateService } from './story-update.service';
import { StoryLoadService } from './story-load.service';
import { SprintItemsController } from '../controllers/sprint-items.controller';
import { OrganizationService } from '../../organization/services/organization.service';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { SprintsModule } from '../sprints.module';

describe('StoryLoadController', () => {
  it('protects both routes and registers bulk before item routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StoryLoadController)).toEqual([
      AuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata('allowedRoles', StoryLoadController)).toEqual([
      'Admin',
      'Scrum Master',
      'Arquitecto',
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, StoryLoadController)).toBe(
      'v2/teams/:teamId/sprints/:sprintId/stories/bulk',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, StoryLoadController.prototype.preview),
    ).toBe('preview');
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        StoryLoadController.prototype.preview,
      ),
    ).toBe(200);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        StoryLoadController.prototype.apply,
      ),
    ).toBe(201);
    expect(
      Reflect.getMetadata(METHOD_METADATA, StoryLoadController.prototype.apply),
    ).toBe(RequestMethod.POST);
    const controllers = Reflect.getMetadata(
      'controllers',
      SprintsModule,
    ) as unknown[];
    expect(controllers.indexOf(StoryLoadController)).toBeLessThan(
      controllers.indexOf(SprintItemsController),
    );
  });
  it.each(['preview', 'apply'] as const)(
    '%s checks team access before service',
    async (method) => {
      const service = { preview: jest.fn(), apply: jest.fn() };
      const organization = {
        assertTeamLeader: jest.fn().mockRejectedValue(new Error('denied')),
      };
      const module = await Test.createTestingModule({
        controllers: [StoryLoadController],
        providers: [
          { provide: StoryLoadService, useValue: service },
          { provide: OrganizationService, useValue: organization },
        ],
      })
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();
      const controller = module.get(StoryLoadController);
      const user = { personnelId: 'e' } as AuthenticatedUser;
      const dto = { stories: [{ name: 'Historia', storyPoints: 1 }] };
      await expect(controller[method]('t', 's', user, dto)).rejects.toThrow(
        'denied',
      );
      expect(organization.assertTeamLeader).toHaveBeenCalledWith('t', user, [
        'ARCHITECT',
        'SCRUM_MASTER',
      ]);
      expect(service[method]).not.toHaveBeenCalled();
      organization.assertTeamLeader.mockResolvedValue(undefined);
      await controller[method]('t', 's', user, dto);
      expect(service[method]).toHaveBeenCalledWith('t', 's', user, dto);
    },
  );
});

describe('StoryByCodeController', () => {
  it.each(['preview', 'apply'] as const)(
    '%s delegates code and user to scoped service',
    async (method) => {
      const service = { previewByCode: jest.fn(), applyByCode: jest.fn() };
      const module = await Test.createTestingModule({
        controllers: [StoryByCodeController],
        providers: [{ provide: StoryUpdateService, useValue: service }],
      })
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();
      const controller = module.get(StoryByCodeController);
      const user = { personnelId: 'e' } as AuthenticatedUser;
      const dto = { name: 'Nueva' };
      await controller[method]('HU-7', user, dto);
      expect(
        service[method === 'preview' ? 'previewByCode' : 'applyByCode'],
      ).toHaveBeenCalledWith('HU-7', user, dto);
    },
  );

  it.each(['preview', 'apply'] as const)(
    'protects %s and registers the route',
    (method) => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, StoryByCodeController),
      ).toEqual([AuthGuard, RolesGuard]);
      expect(
        Reflect.getMetadata('allowedRoles', StoryByCodeController),
      ).toEqual(['Admin', 'Scrum Master', 'Arquitecto']);
      expect(Reflect.getMetadata(PATH_METADATA, StoryByCodeController)).toBe(
        'v2/stories',
      );
      const handler = StoryByCodeController.prototype[method];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        method === 'preview' ? 'by-code/:code/preview' : 'by-code/:code',
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        method === 'preview' ? RequestMethod.POST : RequestMethod.PATCH,
      );
      expect(Reflect.getMetadata('controllers', SprintsModule)).toContain(
        StoryByCodeController,
      );
    },
  );
});
