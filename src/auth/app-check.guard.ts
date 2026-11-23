import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_APP_CHECK_KEY } from './access.decorators';
import {
  APP_CHECK_HEADER,
  APP_CHECK_INVALID_CODE,
  APP_CHECK_INVALID_MESSAGE,
  type AppCheckRejectReason,
} from './app-check.constants';
import {
  AppCheckRejection,
  AppCheckVerifier,
} from './app-check-verifier.service';
import { InternalCallService } from './internal-call.service';

@Injectable()
export class AppCheckGuard implements CanActivate {
  private readonly logger = new Logger(AppCheckGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly internalCall: InternalCallService,
    private readonly config: ConfigService,
    private readonly verifier: AppCheckVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'OPTIONS') return true;
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_APP_CHECK_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    if (this.internalCall.isTrusted(request)) return true;

    const enforced = this.config.get<string>('APP_CHECK_ENFORCED') === 'true';
    if (!enforced && !this.verifier.isConfigured()) return true;

    const token = request.headers[APP_CHECK_HEADER];
    // Node puede combinar headers repetidos en un solo string.
    const repeated =
      (request.headersDistinct?.[APP_CHECK_HEADER]?.length ?? 0) > 1;
    let reason: AppCheckRejectReason = 'missing';
    if (typeof token === 'string' && token !== '' && !repeated) {
      try {
        await this.verifier.verify(token);
        return true;
      } catch (error) {
        if (!(error instanceof AppCheckRejection)) throw error;
        reason = error.reason;
      }
    }

    this.logger.warn(
      JSON.stringify({
        event: 'app_check_rejected',
        reason,
        enforced,
        method: request.method,
        path: request.path,
        requestId: request.header('x-request-id') ?? null,
      }),
    );
    if (enforced) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: APP_CHECK_INVALID_CODE,
        message: APP_CHECK_INVALID_MESSAGE,
      });
    }
    return true;
  }
}
