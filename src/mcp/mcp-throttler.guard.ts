import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard';

@Injectable()
export class McpThrottlerGuard implements CanActivate {
  // Guard propio: ventana fija por usuario compartida entre métodos, sin el tracker global por IP.
  // shortcut: contador en memoria por proceso, mover a un store compartido si la API corre en varias instancias
  private readonly requests = new Map<
    string,
    { count: number; expires: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    for (const [userId, entry] of this.requests) {
      if (entry.expires <= now) this.requests.delete(userId);
    }
    const userId = request.user.supabaseUserId;
    const entry = this.requests.get(userId) ?? {
      count: 0,
      expires: now + 60_000,
    };
    if (entry.count >= 60) {
      response.setHeader(
        'Retry-After',
        String(Math.ceil((entry.expires - now) / 1000)),
      );
      throw new HttpException('Demasiadas peticiones a MCP', 429);
    }
    entry.count++;
    this.requests.set(userId, entry);
    return true;
  }
}
