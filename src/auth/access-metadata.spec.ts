import { SprintsController } from '../sprints/controllers/sprints.controller';
import {
  StoryByCodeController,
  StoryLoadController,
} from '../sprints/load/story-load.controller';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from './roles.decorator';
import { AppController } from '../app.controller';
import { HealthController } from '../health/health.controller';
import { MaintenanceController } from '../maintenance/maintenance.controller';
import {
  ANY_AUTHENTICATED_ROLE_KEY,
  PUBLIC_ROUTE_KEY,
} from './access.decorators';
import { AuthController } from './auth.controller';

type Handler = (...args: never[]) => unknown;

function meta(key: string, target: object): unknown {
  return Reflect.getMetadata(key, target) as unknown;
}

function handler(controller: { prototype: object }, name: string): Handler {
  return (controller.prototype as Record<string, Handler>)[name];
}

describe('Marcas de acceso en controllers', () => {
  it.each(['preview', 'create'])(
    'sprints/%s solo Admin y Arquitecto',
    (name) => {
      expect(meta(ROLES_KEY, handler(SprintsController, name))).toEqual([
        'Admin',
        'Arquitecto',
      ]);
    },
  );
  it.each(['preview', 'apply'])('carga/%s admite Scrum Master', (name) => {
    expect(
      meta(ROLES_KEY, handler(StoryLoadController, name)) ??
        meta(ROLES_KEY, StoryLoadController),
    ).toEqual(['Admin', 'Scrum Master', 'Arquitecto']);
  });
  it.each([
    ['preview', RequestMethod.POST, 'by-code/:code/preview'],
    ['apply', RequestMethod.PATCH, 'by-code/:code'],
  ])(
    'actualizar HU por código: %s es Admin, Scrum Master y Arquitecto, responde 200',
    (name, method, path) => {
      expect(meta(ROLES_KEY, StoryByCodeController)).toEqual([
        'Admin',
        'Scrum Master',
        'Arquitecto',
      ]);
      expect(meta(PATH_METADATA, StoryByCodeController)).toBe('v2/stories');
      const h = handler(StoryByCodeController, name);
      expect(meta(METHOD_METADATA, h)).toBe(method);
      expect(meta(PATH_METADATA, h)).toBe(path);
      expect(meta(HTTP_CODE_METADATA, h)).toBe(200);
    },
  );
  it.each([
    ['AppController', AppController],
    ['HealthController', HealthController],
    ['MaintenanceController', MaintenanceController],
  ])('%s es público a nivel de clase', (_name, controller) => {
    expect(meta(PUBLIC_ROUTE_KEY, controller)).toBe(true);
  });

  it('POST auth/login es público', () => {
    expect(meta(PUBLIC_ROUTE_KEY, handler(AuthController, 'login'))).toBe(true);
  });

  it('GET auth/client-config es público', () => {
    const fn = handler(AuthController, 'clientConfig');
    expect(fn).toBeDefined();
    expect(meta(PUBLIC_ROUTE_KEY, fn)).toBe(true);
    expect(meta(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
    expect(meta(PATH_METADATA, fn)).toBe('client-config');
  });

  it('GET auth/bootstrap acepta cualquier rol autenticado y no es público', () => {
    const bootstrap = handler(AuthController, 'bootstrap');
    expect(meta(ANY_AUTHENTICATED_ROLE_KEY, bootstrap)).toBe(true);
    expect(meta(PUBLIC_ROUTE_KEY, bootstrap)).toBeUndefined();
  });

  it('AuthController no es público ni de cualquier rol a nivel de clase', () => {
    expect(meta(PUBLIC_ROUTE_KEY, AuthController)).toBeUndefined();
    expect(meta(ANY_AUTHENTICATED_ROLE_KEY, AuthController)).toBeUndefined();
  });

  it.each([
    'validate',
    'me',
    'getUsers',
    'getUsersContext',
    'createUser',
    'markPasswordChanged',
  ])('auth/%s queda restringido a roles del portal', (name) => {
    const fn = handler(AuthController, name);
    expect(fn).toBeDefined();
    expect(meta(PUBLIC_ROUTE_KEY, fn)).toBeUndefined();
    expect(meta(ANY_AUTHENTICATED_ROLE_KEY, fn)).toBeUndefined();
  });
});
