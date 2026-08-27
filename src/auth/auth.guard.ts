import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './interfaces/auth-user.interface';

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.authService.validateAuthorizationHeader(
      request.headers.authorization,
    );

    return true;
  }
}
