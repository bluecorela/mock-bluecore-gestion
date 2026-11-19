import { Test } from '@nestjs/testing';
import { InternalCallService } from './internal-call.service';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AnyAuthenticatedRole,
  OAuthClientRoute,
  PublicRoute,
} from './access.decorators';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.guard';
import { AuthenticatedUser } from './interfaces/auth-user.interface';
import { PortalAccessGuard } from './portal-access.guard';
import { WellKnownController } from '../mcp/well-known.controller';

@PublicRoute()
class PublicController {}

@PublicRoute()
@OAuthClientRoute()
class OAuthController {}

class Routes {
  normal() {}

  @PublicRoute()
  public() {}

  @PublicRoute()
  @OAuthClientRoute()
  oauth() {}

  @AnyAuthenticatedRole()
  bootstrap() {}
}

function token(payload: unknown) {
  return `cabecera.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma`;
}

describe('PortalAccessGuard', () => {
  const authService = { validateAuthorizationHeader: jest.fn() };
  let guard: PortalAccessGuard;
  let internalCall: InternalCallService;
  let request: AuthenticatedRequest;

  function context(
    handler: ((...args: never[]) => unknown) | undefined = Routes.prototype
      .normal,
    controller: new (...args: never[]) => unknown = Routes,
  ) {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function authenticate(role: string | null) {
    const user: AuthenticatedUser = {
      supabaseUserId: 'usuario-1',
      oauthClientId: null,
      email: 'usuario@example.com',
      personnelId: null,
      employeeId: null,
      name: null,
      role,
      teamId: null,
      teamIds: [],
      mustChangePassword: false,
    };
    authService.validateAuthorizationHeader.mockResolvedValue(user);
    return user;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PortalAccessGuard,
        Reflector,
        InternalCallService,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    guard = module.get(PortalAccessGuard);
    internalCall = module.get(InternalCallService);
    request = {
      headers: { authorization: 'Bearer token' },
    } as AuthenticatedRequest;
  });

  it.each([
    [undefined, OAuthController],
    [Routes.prototype.oauth, Routes],
  ])(
    'permite OAuth con metadata de handler o clase sin autenticar en el guard global (%s)',
    async (handler, controller) => {
      request.headers.authorization = `Bearer ${token({ client_id: 'abc' })}`;
      await expect(
        guard.canActivate(context(handler, controller)),
      ).resolves.toBe(true);
      expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
    },
  );

  it('permite metadata MCP con un Bearer que lleva client_id', async () => {
    request.headers.authorization = `Bearer ${token({ client_id: 'mcp-client' })}`;
    await expect(
      guard.canActivate(
        context(WellKnownController.prototype.metadata, WellKnownController),
      ),
    ).resolves.toBe(true);
    expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
  });

  it('permite una ruta pública sin validar el token', async () => {
    await expect(
      guard.canActivate(context(Routes.prototype.public)),
    ).resolves.toBe(true);
    expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
  });

  it('respeta la marca pública de la clase', async () => {
    await expect(
      guard.canActivate(context(undefined, PublicController)),
    ).resolves.toBe(true);
    expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
  });

  it.each([undefined, 'inventada', 'x'.repeat(64)])(
    'rechaza OAuth en una ruta pública con cabecera interna %s sin autenticar',
    async (header) => {
      request.headers.authorization = `Bearer ${token({ client_id: 'abc' })}`;
      request.headers[internalCall.headerName] = header;
      await expect(
        guard.canActivate(context(Routes.prototype.public)),
      ).rejects.toThrow(
        new UnauthorizedException('Este acceso de IA solo sirve en /mcp'),
      );
      expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
    },
  );

  it('rechaza OAuth también con la marca pública de la clase', async () => {
    request.headers.authorization = `Bearer ${token({ client_id: '' })}`;
    await expect(
      guard.canActivate(context(undefined, PublicController)),
    ).rejects.toThrow(
      new UnauthorizedException('Este acceso de IA solo sirve en /mcp'),
    );
    expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
  });

  it('permite OAuth en una ruta pública con cabecera interna válida sin autenticar', async () => {
    request.headers.authorization = `Bearer ${token({ client_id: 'abc' })}`;
    request.headers[internalCall.headerName] = internalCall.secret();
    await expect(
      guard.canActivate(context(Routes.prototype.public)),
    ).resolves.toBe(true);
    expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    `Bearer ${token({ sub: 'usuario-1', exp: 1 })}`,
    `Bearer ${token({ client_id: 123 })}`,
    'Bearer token',
    'Bearer cabecera.bm8tZXMtanNvbg.firma',
    `Bearer ${token(null)}`,
  ])(
    'permite una ruta pública con Authorization %s sin autenticar',
    async (authorization) => {
      request.headers.authorization = authorization;
      await expect(
        guard.canActivate(context(Routes.prototype.public)),
      ).resolves.toBe(true);
      expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
    },
  );

  it('propaga UnauthorizedException cuando falla la autenticación', async () => {
    const error = new UnauthorizedException('Token inválido o ausente');
    authService.validateAuthorizationHeader.mockRejectedValue(error);
    await expect(guard.canActivate(context())).rejects.toBe(error);
    expect(request.user).toBeUndefined();
  });

  it.each(['Admin', 'Arquitecto', 'Scrum Master'])(
    'permite %s y asigna el usuario autenticado',
    async (role) => {
      const user = authenticate(role);
      await expect(guard.canActivate(context())).resolves.toBe(true);
      expect(authService.validateAuthorizationHeader).toHaveBeenCalledWith(
        'Bearer token',
        { allowOAuthClient: false },
      );
      expect(request.user).toBe(user);
    },
  );

  it.each([
    'Ingeniero de Software',
    'Ingeniero de QA',
    'Pasante',
    'Creador de Bienestar',
    null,
  ])('deniega %s con el cuerpo y mensaje exactos', async (role) => {
    authenticate(role);
    const error: unknown = await guard
      .canActivate(context())
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
    expect((error as ForbiddenException).getResponse()).toEqual({
      message: 'Todavía no disponible, estamos trabajando :D',
    });
  });

  it.each(['Pasante', null])(
    'permite %s con AnyAuthenticatedRole',
    async (role) => {
      const user = authenticate(role);
      await expect(
        guard.canActivate(context(Routes.prototype.bootstrap)),
      ).resolves.toBe(true);
      expect(authService.validateAuthorizationHeader).toHaveBeenCalledTimes(1);
      expect(request.user).toBe(user);
    },
  );

  it('exige autenticación incluso con AnyAuthenticatedRole', async () => {
    const error = new UnauthorizedException('Token inválido o ausente');
    authService.validateAuthorizationHeader.mockRejectedValue(error);
    await expect(
      guard.canActivate(context(Routes.prototype.bootstrap)),
    ).rejects.toBe(error);
  });
  it.each([undefined, 'cabecera-inventada', 'x'.repeat(64)])(
    'rechaza el token OAuth con cabecera interna %s',
    async (header) => {
      request.headers[internalCall.headerName] = header;
      authService.validateAuthorizationHeader.mockImplementation(
        (_authorization: string, options?: { allowOAuthClient?: boolean }) => {
          if (!options?.allowOAuthClient)
            throw new UnauthorizedException(
              'Este acceso de IA solo sirve en /mcp',
            );
          return { role: 'Admin', oauthClientId: 'abc' };
        },
      );
      await expect(guard.canActivate(context())).rejects.toThrow(
        new UnauthorizedException('Este acceso de IA solo sirve en /mcp'),
      );
      expect(request.user).toBeUndefined();
    },
  );

  it('permite el token OAuth con cabecera interna válida y conserva client_id', async () => {
    request.headers[internalCall.headerName] = internalCall.secret();
    authService.validateAuthorizationHeader.mockImplementation(
      (_authorization: string, options?: { allowOAuthClient?: boolean }) => {
        if (!options?.allowOAuthClient) throw new UnauthorizedException();
        return { role: 'Admin', oauthClientId: 'abc' };
      },
    );
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(request.user.oauthClientId).toBe('abc');
    expect(authService.validateAuthorizationHeader).toHaveBeenCalledWith(
      'Bearer token',
      { allowOAuthClient: true },
    );
  });
});
