import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { SupabaseClient } from '../supabase/supabase.client';
import { McpAuthGuard } from './mcp-auth.guard';

function jwtHeader(header: { alg: string; kid?: string }) {
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'user', exp: 4_000_000_000 })).toString('base64url')}`;
}
const token = `${jwtHeader({ alg: 'ES256', kid: 'local' })}.signature`;
const hsInput = jwtHeader({ alg: 'HS256' });
const hsToken = `${hsInput}.${createHmac('sha256', 'test-secret').update(hsInput).digest('base64url')}`;

function context(authorization?: string, ip = 'office') {
  const request = { headers: { authorization }, ip, user: undefined };
  const response = { setHeader: jest.fn() };
  return {
    request,
    response,
    ctx: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext,
  };
}
describe('McpAuthGuard', () => {
  const validateAuthorizationHeader = jest.fn();
  const getClaims = jest.fn();
  let guard: McpAuthGuard;
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ keys: [{ kid: 'local', kty: 'EC' }] }),
      );
    getClaims
      .mockReset()
      .mockResolvedValue({ data: { claims: {} }, error: null });
    validateAuthorizationHeader
      .mockReset()
      .mockRejectedValue(new UnauthorizedException('Token inválido'));
    guard = new McpAuthGuard(
      { validateAuthorizationHeader } as unknown as AuthService,
      new ConfigService({
        PUBLIC_API_URL: 'https://api.example.com',
        SUPABASE_URL: 'http://supabase.test',
      }),
      {
        getClient: () => ({ auth: { getClaims } }),
      } as unknown as SupabaseClient,
    );
  });
  it.each([
    undefined,
    'Bearer inválido',
    'Basic abc',
    'Bearer a.b.c',
    `${token}`,
    `Bearer ${token} extra`,
    `Bearer ${jwtHeader({ alg: 'HS256' })}.`,
  ])('responde 401 con metadata para %s', async (token) => {
    const { ctx, response } = context(token);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(validateAuthorizationHeader).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });
  it('corta antes de validar después de 30 fallos, aísla IP y vence a los 60 s', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      for (let i = 0; i < 30; i++)
        await expect(guard.canActivate(context().ctx)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      validateAuthorizationHeader.mockClear();
      const { ctx, response } = context();
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        status: 429,
      });
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(validateAuthorizationHeader).not.toHaveBeenCalled();
      await expect(
        guard.canActivate(context(undefined, 'other').ctx),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      now.mockReturnValue(61000);
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    } finally {
      now.mockRestore();
    }
  });
  it('ignora una entrada vencida aunque aún no toque la limpieza periódica', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    guard['failures'].set('office', { count: 30, expires: now + 1000 });
    jest.spyOn(Date, 'now').mockReturnValue(now + 1000);
    const cleanup = jest.spyOn(guard['failures'], Symbol.iterator);
    const { ctx, response } = context();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(cleanup).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
    expect(guard['failures'].get('office')).toEqual({
      count: 1,
      expires: now + 61_000,
    });
  });
  it('limpia los vencidos a lo sumo una vez cada 60 s en las peticiones', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const cleanup = jest.spyOn(guard['failures'], Symbol.iterator);
    for (const elapsed of [0, 59_999, 60_000, 60_001, 120_000]) {
      jest.spyOn(Date, 'now').mockReturnValue(now + elapsed);
      await expect(guard.canActivate(context().ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(cleanup).toHaveBeenCalledTimes(Math.floor(elapsed / 60_000));
    }
  });
  it.each([false, true])(
    'limita a 10000 IP: limpia vencidos antes de expulsar la más antigua (vencido: %s)',
    async (expired) => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const failures = guard['failures'];
      for (let i = 0; i < 10_000; i++) {
        failures.set(`ip-${i}`, {
          count: 1,
          expires: expired && i === 1 ? now : now + 60_000,
        });
      }
      await expect(
        guard.canActivate(context(undefined, 'new-ip').ctx),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(failures.size).toBe(10_000);
      expect(failures.has('ip-0')).toBe(expired);
      expect(failures.has('ip-1')).toBe(!expired);
      expect(failures.get('new-ip')).toEqual({
        count: 1,
        expires: now + 60_000,
      });
      expect(getClaims).not.toHaveBeenCalled();
      expect(validateAuthorizationHeader).not.toHaveBeenCalled();
    },
  );
  it('acepta sesión normal y OAuth sin consumir el tope', async () => {
    for (const oauthClientId of [null, 'client']) {
      const user = { supabaseUserId: 'a', role: 'Arquitecto', oauthClientId };
      validateAuthorizationHeader.mockResolvedValue(user);
      for (let i = 0; i < 35; i++) {
        const { ctx, request } = context(`Bearer ${token}`);
        expect(await guard.canActivate(ctx)).toBe(true);
        expect(request.user).toBe(user);
      }
    }
    expect(validateAuthorizationHeader).toHaveBeenCalledWith(
      `Bearer ${token}`,
      {
        allowOAuthClient: true,
      },
    );
  });
  it('acepta un JWT válido incluso tras agotar los fallos de su IP', async () => {
    for (let i = 0; i < 30; i++)
      await expect(guard.canActivate(context().ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    validateAuthorizationHeader.mockResolvedValue({
      role: 'Arquitecto',
      supabaseUserId: 'a',
    });
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).resolves.toBe(true);
    getClaims.mockClear();
    validateAuthorizationHeader.mockClear();
    await expect(
      guard.canActivate(context('Bearer inválido').ctx),
    ).rejects.toMatchObject({ status: 429 });
    expect(getClaims).not.toHaveBeenCalled();
    expect(validateAuthorizationHeader).not.toHaveBeenCalled();
  });
  it('no cuenta los 401 de usuarios con firma válida', async () => {
    for (let i = 0; i < 35; i++)
      await expect(
        guard.canActivate(context(`Bearer ${token}`).ctx),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(validateAuthorizationHeader).toHaveBeenCalledTimes(35);
  });
  it('un error de getClaims cuenta como fallo sin validar el usuario', async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: new Error('firma inválida'),
    });
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(validateAuthorizationHeader).not.toHaveBeenCalled();
  });
  it('acepta HS256 sin consumir el tope ni usar getClaims', async () => {
    validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
    for (let i = 0; i < 35; i++)
      await expect(
        guard.canActivate(context(`Bearer ${hsToken}`).ctx),
      ).resolves.toBe(true);
    expect(validateAuthorizationHeader).toHaveBeenCalledTimes(35);
    expect(validateAuthorizationHeader).toHaveBeenCalledWith(
      `Bearer ${hsToken}`,
      { allowOAuthClient: true },
    );
    expect(getClaims).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cuenta los 401 de HS256 y corta al agotar el tope', async () => {
    for (let i = 0; i < 30; i++) {
      const { ctx, response } = context(`Bearer ${hsToken}`);
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.any(String),
      );
    }
    validateAuthorizationHeader.mockClear();
    const { ctx, response } = context(`Bearer ${hsToken}`);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
    expect(validateAuthorizationHeader).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });
  it.each(['network', 'http'])(
    'delega si fallan las JWKS por %s',
    async (failure) => {
      if (failure === 'network')
        jest.mocked(fetch).mockRejectedValue(new Error('offline'));
      else
        jest
          .mocked(fetch)
          .mockResolvedValue(new Response(null, { status: 503 }));
      validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
      await expect(
        guard.canActivate(context(`Bearer ${token}`).ctx),
      ).resolves.toBe(true);
      expect(validateAuthorizationHeader).toHaveBeenCalledWith(
        `Bearer ${token}`,
        { allowOAuthClient: true },
      );
      expect(getClaims).not.toHaveBeenCalled();
      for (let i = 0; i < 30; i++)
        await expect(guard.canActivate(context().ctx)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      validateAuthorizationHeader.mockClear();
      await expect(
        guard.canActivate(context(`Bearer ${token}`).ctx),
      ).rejects.toMatchObject({ status: 429 });
      expect(validateAuthorizationHeader).not.toHaveBeenCalled();
    },
  );
  it('delega sin WebCrypto', async () => {
    jest.replaceProperty(globalThis, 'crypto', undefined as unknown as Crypto);
    validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).resolves.toBe(true);
    expect(getClaims).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(validateAuthorizationHeader).toHaveBeenCalledTimes(1);
  });
  it('delega sin kid', async () => {
    const withoutKid = `${jwtHeader({ alg: 'ES256' })}.signature`;
    validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
    await expect(
      guard.canActivate(context(`Bearer ${withoutKid}`).ctx),
    ).resolves.toBe(true);
    expect(getClaims).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('recarga una vez un kid desconocido y verifica la clave rotada', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(Response.json({ keys: [] }))
      .mockResolvedValueOnce(
        Response.json({ keys: [{ kid: 'local', kty: 'EC' }] }),
      );
    validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
  it('delega un kid aún desconocido y espera 60 s entre recargas forzadas', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    jest
      .mocked(fetch)
      .mockImplementation(async () => Response.json({ keys: [] }));
    validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
    for (let i = 0; i < 2; i++)
      await expect(
        guard.canActivate(context(`Bearer ${token}`).ctx),
      ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    now.mockReturnValue(60_999);
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    now.mockReturnValue(61_000);
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(getClaims).not.toHaveBeenCalled();
  });
  it('respeta los 60 s aunque falle la recarga forzada', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(Response.json({ keys: [] }))
      .mockRejectedValue(new Error('offline'));
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    validateAuthorizationHeader.mockResolvedValue({ role: 'Arquitecto' });
    for (let i = 0; i < 2; i++)
      await expect(
        guard.canActivate(context(`Bearer ${token}`).ctx),
      ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getClaims).not.toHaveBeenCalled();
  });
  it('no cuenta errores internos del camino unverifiable', async () => {
    validateAuthorizationHeader.mockRejectedValue(
      new HttpException('No disponible', 503),
    );
    for (let i = 0; i < 35; i++)
      await expect(
        guard.canActivate(context(`Bearer ${hsToken}`).ctx),
      ).rejects.toMatchObject({ status: 503 });
    expect(validateAuthorizationHeader).toHaveBeenCalledTimes(35);
  });
  it('verifica ES256 real con JWKS en caché y rechaza firmas alteradas sin llamadas remotas', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    const key = {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'real',
      alg: 'ES256',
      use: 'sig',
    };
    const fetchMock = jest
      .mocked(fetch)
      .mockImplementation(async () => Response.json({ keys: [key] }));
    const client = createClient('http://supabase.test', 'anon', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const getUser = jest.spyOn(client.auth, 'getUser');
    const guard = new McpAuthGuard(
      { validateAuthorizationHeader } as unknown as AuthService,
      new ConfigService({
        PUBLIC_API_URL: 'http://api.test',
        SUPABASE_URL: 'http://supabase.test',
      }),
      { getClient: () => client } as SupabaseClient,
    );
    const jwt = (exp: number, kid = 'real') => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'user',
          exp,
          iat: Math.floor(Date.now() / 1000),
        }),
      ).toString('base64url');
      const input = `${header}.${payload}`;
      return `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    };
    const valid = jwt(Math.floor(Date.now() / 1000) + 3600);
    validateAuthorizationHeader.mockResolvedValue({
      role: 'Arquitecto',
      supabaseUserId: 'user',
    });
    await expect(
      guard.canActivate(context(`Bearer ${valid}`).ctx),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const parts = valid.split('.');
    const signature = Buffer.from(parts[2], 'base64url');
    signature[0] ^= 1;
    const invalid = `${parts[0]}.${parts[1]}.${signature.toString('base64url')}`;
    for (let i = 0; i < 30; i++)
      await expect(
        guard.canActivate(context(`Bearer ${invalid}`).ctx),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    validateAuthorizationHeader.mockClear();
    fetchMock.mockClear();
    for (const bad of [
      invalid,
      jwt(1),
      jwt(Math.floor(Date.now() / 1000) + 3600, 'desconocida'),
    ]) {
      await expect(
        guard.canActivate(context(`Bearer ${bad}`).ctx),
      ).rejects.toMatchObject({ status: 429 });
    }
    expect(validateAuthorizationHeader).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
    await expect(
      guard.canActivate(context(`Bearer ${valid}`).ctx),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('revalida el rol y la desactivación en cada petición', async () => {
    validateAuthorizationHeader
      .mockResolvedValueOnce({ role: 'Arquitecto' })
      .mockResolvedValueOnce({ role: 'Ingeniero de Software' })
      .mockRejectedValueOnce(new UnauthorizedException('Usuario inactivo'));
    expect(await guard.canActivate(context(`Bearer ${token}`).ctx)).toBe(true);
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('no convierte errores internos en 401', async () => {
    validateAuthorizationHeader.mockRejectedValue(
      new HttpException('Servicio no disponible', 503),
    );
    await expect(
      guard.canActivate(context(`Bearer ${token}`).ctx),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});
