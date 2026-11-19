import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './interfaces/auth-user.interface';
import { InternalCallService } from './internal-call.service';

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly internalCall: InternalCallService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user) {
      return true;
    }

    request.user = await this.authService.validateAuthorizationHeader(
      request.headers.authorization,
      { allowOAuthClient: this.internalCall.isTrusted(request) },
    );

    return true;
  }
}
