import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ANY_AUTHENTICATED_ROLE_KEY,
  PUBLIC_ROUTE_KEY,
  OAUTH_CLIENT_ROUTE_KEY,
} from './access.decorators';
import {
  PORTAL_ACCESS_DENIED_MESSAGE,
  PORTAL_ACCESS_ROLES,
} from './auth.constants';
import { AuthenticatedRequest } from './auth.guard';
import { AuthService, readOAuthClientId } from './auth.service';
import { InternalCallService } from './internal-call.service';

@Injectable()
export class PortalAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly internalCall: InternalCallService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets)) {
      if (
        this.reflector.getAllAndOverride<boolean>(
          OAUTH_CLIENT_ROUTE_KEY,
          targets,
        )
      ) {
        return true;
      }
      const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
      if (
        scheme === 'Bearer' &&
        token &&
        !this.internalCall.isTrusted(request)
      ) {
        let oauthClientId: string | null;
        try {
          oauthClientId = readOAuthClientId(token);
        } catch {
          // Una ruta pública no exige un token válido.
          return true;
        }
        if (oauthClientId !== null) {
          throw new UnauthorizedException(
            'Este acceso de IA solo sirve en /mcp',
          );
        }
      }
      return true;
    }

    request.user = await this.authService.validateAuthorizationHeader(
      request.headers.authorization,
      { allowOAuthClient: this.internalCall.isTrusted(request) },
    );

    if (
      this.reflector.getAllAndOverride<boolean>(
        ANY_AUTHENTICATED_ROLE_KEY,
        targets,
      )
    ) {
      return true;
    }

    if (!PORTAL_ACCESS_ROLES.some((role) => role === request.user.role)) {
      throw new ForbiddenException({ message: PORTAL_ACCESS_DENIED_MESSAGE });
    }

    return true;
  }
}
