import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InternalCallService } from './internal-call.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';

describe('AuthGuard', () => {
  const authService = { validateAuthorizationHeader: jest.fn() };
  let guard: AuthGuard;
  let internalCall: InternalCallService;
  let request: AuthenticatedRequest;
  let context: ExecutionContext;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        Reflector,
        InternalCallService,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    guard = module.get(AuthGuard);
    internalCall = module.get(InternalCallService);
    request = {
      headers: { authorization: 'Bearer token' },
    } as AuthenticatedRequest;
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  });

  it('no revalida el token si request.user ya existe', async () => {
    const user = { role: 'Admin' } as AuthenticatedRequest['user'];
    request.user = user;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validateAuthorizationHeader).not.toHaveBeenCalled();
    expect(request.user).toBe(user);
  });

  it('valida el token y asigna el usuario si aún no existe', async () => {
    const user = { role: 'Admin' };
    authService.validateAuthorizationHeader.mockResolvedValue(user);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validateAuthorizationHeader).toHaveBeenCalledWith(
      'Bearer token',
      { allowOAuthClient: false },
    );
    expect(request.user).toBe(user);
  });

  it('propaga el error de autenticación', async () => {
    const error = new UnauthorizedException('Token inválido o ausente');
    authService.validateAuthorizationHeader.mockRejectedValue(error);
    await expect(guard.canActivate(context)).rejects.toBe(error);
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
      await expect(guard.canActivate(context)).rejects.toThrow(
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
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.oauthClientId).toBe('abc');
    expect(authService.validateAuthorizationHeader).toHaveBeenCalledWith(
      'Bearer token',
      { allowOAuthClient: true },
    );
  });
});
