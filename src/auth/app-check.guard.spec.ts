import {
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { SkipAppCheck } from './access.decorators';
import { APP_CHECK_HEADER } from './app-check.constants';
import {
  AppCheckRejection,
  AppCheckVerifier,
} from './app-check-verifier.service';
import { AppCheckGuard } from './app-check.guard';
import { InternalCallService } from './internal-call.service';

@SkipAppCheck()
class ExemptController {}

class Routes {
  normal() {}

  @SkipAppCheck()
  exempt() {}
}

describe('AppCheckGuard', () => {
  const verifier = { isConfigured: jest.fn(), verify: jest.fn() };
  const token = 'secreto-token-123';
  let guard: AppCheckGuard;
  let internalCall: InternalCallService;
  let enforced: string;
  let warn: jest.SpiedFunction<Logger['warn']>;
  let request: Pick<Request, 'headers' | 'method' | 'path' | 'header'> &
    Partial<Pick<Request, 'headersDistinct'>>;

  function context(
    handler = Routes.prototype.normal,
    controller: new () => object = Routes,
  ) {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    enforced = 'true';
    verifier.isConfigured.mockReturnValue(true);
    verifier.verify.mockResolvedValue(undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const module = await Test.createTestingModule({
      providers: [
        AppCheckGuard,
        Reflector,
        InternalCallService,
        { provide: AppCheckVerifier, useValue: verifier },
        { provide: ConfigService, useValue: { get: () => enforced } },
      ],
    }).compile();
    guard = module.get(AppCheckGuard);
    internalCall = module.get(InternalCallService);
    request = {
      headers: {},
      method: 'GET',
      path: '/api/auth/me',
      header: jest.fn().mockReturnValue('request-123'),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('permite un token válido', async () => {
    request.headers[APP_CHECK_HEADER] = token;

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith(token);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rechaza la ausencia del header con el cuerpo 401 de App Check', async () => {
    const result = guard.canActivate(context());

    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    const error = (await result.catch(
      (cause: unknown) => cause,
    )) as UnauthorizedException;
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({
      statusCode: 401,
      code: 'APP_CHECK_INVALID',
      message: 'Verificación de App Check fallida',
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    { header: '', distinct: [''] },
    { header: ['a', 'b'], distinct: ['a', 'b'] },
    { header: 'a, b', distinct: ['a', 'b'] },
  ])(
    'trata el header vacío o repetido como missing ($header)',
    async ({ header, distinct }) => {
      request.headers[APP_CHECK_HEADER] = header;
      request.headersDistinct = { [APP_CHECK_HEADER]: distinct };

      await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verifier.verify).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('"reason":"missing"'),
      );
    },
  );

  it.each(['invalid', 'expired', 'unavailable'] as const)(
    'rechaza con 401 si la verificación devuelve %s',
    async (reason) => {
      request.headers[APP_CHECK_HEADER] = token;
      verifier.verify.mockRejectedValue(new AppCheckRejection(reason));

      await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`"reason":"${reason}"`),
      );
    },
  );

  it('permite OPTIONS sin verificar', async () => {
    request.method = 'OPTIONS';

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    [Routes.prototype.normal, ExemptController],
    [Routes.prototype.exempt, Routes],
  ])(
    'permite @SkipAppCheck() en el handler o la clase',
    async (handler, controller) => {
      await expect(
        guard.canActivate(context(handler, controller)),
      ).resolves.toBe(true);
      expect(verifier.verify).not.toHaveBeenCalled();
    },
  );

  it('permite una llamada interna con el secreto correcto', async () => {
    request.headers[internalCall.headerName] = internalCall.secret();

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rechaza una llamada interna con un secreto falso y sin token', async () => {
    request.headers[internalCall.headerName] = 'secreto-falso';

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('permite un token inválido en modo observación y registra el motivo sin el token', async () => {
    enforced = 'false';
    request.headers[APP_CHECK_HEADER] = token;
    verifier.verify.mockRejectedValue(new AppCheckRejection('invalid'));

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(request.header).toHaveBeenCalledWith('x-request-id');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'app_check_rejected',
        reason: 'invalid',
        enforced: false,
        method: 'GET',
        path: '/api/auth/me',
        requestId: 'request-123',
      }),
    );
    expect(warn.mock.calls[0][0]).not.toContain(token);
  });

  it('permite sin verificar ni registrar cuando App Check es opcional y no está configurado', async () => {
    enforced = 'false';
    verifier.isConfigured.mockReturnValue(false);
    request.headers[APP_CHECK_HEADER] = token;

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
