import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SupabaseClient } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { PORTAL_ACCESS_ROLES } from '../auth/auth.constants';

type ClaimsOptions = NonNullable<
  Parameters<ReturnType<SupabaseClient['getClient']>['auth']['getClaims']>[1]
>;
type KeySet = NonNullable<ClaimsOptions['jwks']>;
type TokenStatus = 'valid' | 'invalid' | 'unverifiable';

const MAX_FAILURE_ENTRIES = 10_000;

@Injectable()
export class McpAuthGuard implements CanActivate {
  // shortcut: contador en memoria por proceso, mover a un store compartido si la API corre en varias instancias
  private readonly failures = new Map<
    string,
    { count: number; expires: number }
  >();

  private lastFailureCleanup = Date.now();

  private jwks?: { value: KeySet; expires: number };
  private loadingKeys?: Promise<KeySet>;
  private lastForcedRefresh?: number;

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    if (now - this.lastFailureCleanup >= 60_000) {
      this.cleanupFailures(now);
    }
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const authorization = request.headers.authorization;
    const status = await this.checkToken(authorization);
    if (status !== 'valid') {
      const failedAt = Date.now();
      const entry = this.failures.get(ip);
      if (entry && entry.expires > failedAt && entry.count >= 30) {
        response.setHeader(
          'Retry-After',
          String(Math.ceil((entry.expires - failedAt) / 1000)),
        );
        throw new HttpException('Demasiados intentos de autenticación', 429);
      }
      if (status === 'invalid') {
        this.recordFailure(ip);
        this.challenge(response);
        throw new UnauthorizedException('Token inválido o ausente');
      }
      // shortcut: con claves simétricas o sin JWKS, el tope por IP vuelve a afectar a tokens válidos; usar claves asimétricas en la nube
    }
    try {
      request.user = await this.auth.validateAuthorizationHeader(
        authorization,
        { allowOAuthClient: true },
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        if (status === 'unverifiable') this.recordFailure(ip);
        this.challenge(response);
      }
      throw error;
    }
    if (!PORTAL_ACCESS_ROLES.some((role) => role === request.user.role)) {
      throw new ForbiddenException(
        'Tu rol no tiene acceso a la conexión con IA',
      );
    }
    return true;
  }
  private recordFailure(ip: string): void {
    const now = Date.now();
    const entry = this.failures.get(ip);
    if (!entry || entry.expires <= now) {
      this.failures.delete(ip);
      if (this.failures.size >= MAX_FAILURE_ENTRIES) this.cleanupFailures(now);
      if (this.failures.size >= MAX_FAILURE_ENTRIES) {
        // shortcut: con un ataque distribuido masivo, el tope deja de contar algunas IP; aplicar el límite en el proxy o la CDN si se necesita protección distribuida
        const oldest = this.failures.keys().next();
        if (!oldest.done) this.failures.delete(oldest.value);
      }
    }
    this.failures.set(
      ip,
      entry && entry.expires > now
        ? { ...entry, count: entry.count + 1 }
        : { count: 1, expires: now + 60_000 },
    );
  }

  private cleanupFailures(now: number): void {
    for (const [ip, entry] of this.failures) {
      if (entry.expires <= now) this.failures.delete(ip);
    }
    this.lastFailureCleanup = now;
  }

  private async checkToken(authorization?: string): Promise<TokenStatus> {
    const match = /^Bearer ([^ ]+)$/.exec(authorization ?? '');
    if (!match) return 'invalid';
    const token = match[1];
    let header: { alg?: string; kid?: string };
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || parts.some((part) => !/^[\w-]+$/.test(part)))
        return 'invalid';
      const decodedHeader: unknown = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString(),
      );
      const payload: unknown = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString(),
      );
      if (
        !decodedHeader ||
        typeof decodedHeader !== 'object' ||
        Array.isArray(decodedHeader) ||
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
      )
        return 'invalid';
      header = decodedHeader;
    } catch {
      return 'invalid';
    }
    if (
      !['ES256', 'RS256'].includes(header.alg ?? '') ||
      !header.kid ||
      !globalThis.crypto?.subtle
    )
      return 'unverifiable';

    let jwks: KeySet;
    try {
      jwks = await this.signingKeys();
      if (!jwks.keys.some((key) => key.kid === header.kid)) {
        jwks = await this.signingKeys(true);
      }
    } catch {
      return 'unverifiable';
    }
    // Evitar el fallback remoto de getClaims si la clave sigue sin conocerse.
    if (!jwks.keys.some((key) => key.kid === header.kid)) return 'unverifiable';
    try {
      const { data, error } = await this.supabase
        .getClient()
        .auth.getClaims(token, { jwks });
      return !error && data ? 'valid' : 'invalid';
    } catch {
      return 'invalid';
    }
  }

  private async signingKeys(force = false): Promise<KeySet> {
    const now = Date.now();
    if (this.loadingKeys) return this.loadingKeys;
    const canForce =
      force &&
      (this.lastForcedRefresh === undefined ||
        now - this.lastForcedRefresh >= 60_000);
    if (this.jwks && this.jwks.expires > now && !canForce)
      return this.jwks.value;
    if (force && !canForce) throw new Error('Recarga de claves en espera');
    if (canForce) this.lastForcedRefresh = now;
    if (!this.loadingKeys) {
      this.loadingKeys = (async () => {
        const url = this.config
          .getOrThrow<string>('SUPABASE_URL')
          .replace(/\/$/, '');
        const response = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok)
          throw new Error('No se pudieron cargar las claves públicas');
        const value = (await response.json()) as KeySet;
        this.jwks = { value, expires: Date.now() + 600_000 };
        return value;
      })().finally(() => {
        this.loadingKeys = undefined;
      });
    }
    return this.loadingKeys;
  }

  private challenge(response: Response): void {
    response.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${this.config.getOrThrow<string>('PUBLIC_API_URL')}/.well-known/oauth-protected-resource/mcp"`,
    );
  }
}
