import {
  Controller,
  Get,
  Logger,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PortalAccessGuard } from '../auth/portal-access.guard';
import { AuthService } from '../auth/auth.service';
import { SupabaseClient } from '../supabase/supabase.client';
import * as factory from './mcp-server.factory';
import * as writeTools from './tools/write-tools';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import request from 'supertest';
import { McpController } from './mcp.controller';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { InternalCallService } from '../auth/internal-call.service';
import { InternalApi } from './internal-api';
import { PreviewCache } from './preview-cache';
import { createServer } from './mcp-server.factory';

describe('MCP', () => {
  it.each([
    ['Scrum Master', 5],
    ['Arquitecto', 6],
    ['Admin', 11],
    ['Ingeniero de Software', 5],
  ])('tools/list de %s', async (role, count) => {
    const server = createServer(
      new InternalApi('http://unused', 'token', {
        name: 'internal',
        value: 'secret',
      }),
      { role, supabaseUserId: 'user' },
      new PreviewCache(),
    );
    const client = new Client({ name: 'test', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(count);
      for (const name of [
        'crear_usuarios',
        'cambiar_rol',
        'mover_de_equipo',
        'designar_lider',
        'listar_usuarios',
      ]) {
        expect(tools.some((tool) => tool.name === name)).toBe(role === 'Admin');
      }
      for (const name of [
        'cargar_historias',
        'actualizar_historia',
        ...(role === 'Admin' || role === 'Arquitecto' ? ['crear_sprint'] : []),
      ]) {
        expect(
          tools
            .find((tool) => tool.name === name)
            ?.description?.startsWith(writeTools.CONFIRMATION_INSTRUCTIONS),
        ).toBe(true);
      }
      expect(tools.some((tool) => tool.name === 'crear_sprint')).toBe(
        role === 'Admin' || role === 'Arquitecto',
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('tools/call conserva el 403 y el mensaje de la API', async () => {
    const fetchFn = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new globalThis.Response(
          JSON.stringify({ message: 'No tienes acceso a este equipo' }),
          { status: 403 },
        ),
      );
    const api = new InternalApi(
      'http://127.0.0.1:3001/api',
      'token',
      { name: 'x-bluecore-mcp-internal', value: 'secret' },
      fetchFn,
    );
    const server = createServer(
      api,
      { role: 'Scrum Master', supabaseUserId: 'a' },
      new PreviewCache(),
    );
    const client = new Client({ name: 'test', version: '1' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      const result = await client.callTool({
        name: 'listar_sprints',
        arguments: { equipo_id: '11111111-1111-4111-8111-111111111111' },
      });
      expect(result).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('No tienes acceso a este equipo'),
          },
        ],
      });
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('http://127.0.0.1:3001/api/'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer token',
            'x-bluecore-mcp-internal': 'secret',
          },
        }),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('crea transporte por petición, pasa el body y cierra al terminar la respuesta', async () => {
    const handle = jest
      .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockResolvedValue();
    const transportClose = jest.spyOn(
      StreamableHTTPServerTransport.prototype,
      'close',
    );
    const serverClose = jest.spyOn(McpServer.prototype, 'close');
    const internal = new InternalCallService();
    const controller = new McpController(
      new ConfigService({ PORT: 3001 }),
      internal,
      new PreviewCache(),
    );
    const req = {
      headers: { authorization: 'Bearer token' },
      user: { role: 'Arquitecto', supabaseUserId: 'a' },
      body: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    } as AuthenticatedRequest;
    try {
      const responses = [new EventEmitter(), new EventEmitter()];
      for (const res of responses) {
        await controller.handle(req, res as Response);
        expect(handle).toHaveBeenLastCalledWith(req, res, req.body);
        res.emit('close');
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(handle.mock.instances[0]).not.toBe(handle.mock.instances[1]);
      expect(transportClose).toHaveBeenCalled();
      expect(serverClose).toHaveBeenCalledTimes(2);
    } finally {
      jest.restoreAllMocks();
    }
  });
  it.each(['get', 'delete'] as const)(
    '%s responde 405 sin autenticación',
    async (method) => {
      const module = await Test.createTestingModule({
        controllers: [McpController],
        providers: [
          PreviewCache,
          InternalCallService,
          {
            provide: ConfigService,
            useValue: new ConfigService({ PORT: 3001 }),
          },
        ],
      })
        .overrideGuard(McpAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(McpThrottlerGuard)
        .useValue({ canActivate: () => true })
        .compile();
      const app = module.createNestApplication();
      await app.init();
      try {
        await request(app.getHttpServer() as Server)
          [method]('/mcp')
          .expect(405);
      } finally {
        await app.close();
      }
    },
  );
});

@Controller('auth')
class ProtectedController {
  @Get('me')
  me() {
    return { ok: true };
  }
}

describe('Regresiones de MCP', () => {
  afterEach(() => jest.restoreAllMocks());
  const req = () =>
    ({
      headers: { authorization: 'Bearer token' },
      user: { role: 'Arquitecto', supabaseUserId: 'usuario-supabase' },
      body: {},
    }) as AuthenticatedRequest;
  const controller = (cache = new PreviewCache()) =>
    new McpController(
      new ConfigService({ PORT: 3001 }),
      new InternalCallService(),
      cache,
    );

  it('pasa el ID Supabase a las escrituras y reutiliza la caché entre peticiones', async () => {
    jest
      .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockResolvedValue();
    const writes = jest.spyOn(writeTools, 'createWriteTools');
    const cache = new PreviewCache();
    const c = controller(cache);
    for (let i = 0; i < 2; i++) {
      const response = new EventEmitter();
      await c.handle(req(), response as Response);
      response.emit('close');
    }
    expect(writes).toHaveBeenCalledTimes(2);
    for (const call of writes.mock.calls) {
      expect(call[1]).toBe(cache);
      expect(call[2]).toBe('usuario-supabase');
    }
  });

  it('rechaza una identidad vacía antes de crear el servidor', async () => {
    const create = jest.spyOn(factory, 'createServer');
    const r = req();
    r.user.supabaseUserId = '';
    await expect(
      controller().handle(r, new EventEmitter() as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'maneja errores con headersSent=%s y cierra recursos',
    async (headersSent) => {
      const error = new Error('transporte roto');
      jest
        .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
        .mockRejectedValue(error);
      const transportClose = jest.spyOn(
        StreamableHTTPServerTransport.prototype,
        'close',
      );
      const serverClose = jest.spyOn(McpServer.prototype, 'close');
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const response = Object.assign(new EventEmitter(), {
        headersSent,
        end: jest.fn(),
      });
      const result = controller().handle(
        req(),
        response as unknown as Response,
      );
      if (headersSent) {
        await expect(result).resolves.toBeUndefined();
        expect(log).toHaveBeenCalled();
        expect(response.end).toHaveBeenCalledTimes(1);
      } else {
        await expect(result).rejects.toBe(error);
        expect(response.end).not.toHaveBeenCalled();
      }
      expect(transportClose).toHaveBeenCalled();
      expect(serverClose).toHaveBeenCalled();
    },
  );

  it('HTTP: OAuth llega al guard MCP, se rechaza en /api/auth/me y no existe /api/mcp', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        globalThis.Response.json({ keys: [{ kid: 'local', kty: 'EC' }] }),
      );
    const token = `${Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'local' })).toString('base64url')}.${Buffer.from(JSON.stringify({ client_id: 'ia' })).toString('base64url')}.signature`;
    const validateAuthorizationHeader = jest
      .fn()
      .mockImplementation(
        (_header: string, options?: { allowOAuthClient?: boolean }) => {
          if (!options?.allowOAuthClient)
            throw new UnauthorizedException(
              'Este acceso de IA solo sirve en /mcp',
            );
          return {
            role: 'Arquitecto',
            supabaseUserId: 'usuario',
            oauthClientId: 'ia',
          };
        },
      );
    const guard = jest.spyOn(McpAuthGuard.prototype, 'canActivate');
    jest
      .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementation(async (_req, res) => {
        res.statusCode = 200;
        res.end();
      });
    const module = await Test.createTestingModule({
      controllers: [McpController, ProtectedController],
      providers: [
        PreviewCache,
        InternalCallService,
        McpAuthGuard,
        McpThrottlerGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            PORT: 3001,
            PUBLIC_API_URL: 'http://localhost:3001',
            SUPABASE_URL: 'http://supabase.test',
          }),
        },
        { provide: AuthService, useValue: { validateAuthorizationHeader } },
        {
          provide: SupabaseClient,
          useValue: {
            getClient: () => ({
              auth: {
                getClaims: jest
                  .fn()
                  .mockResolvedValue({ data: { claims: {} }, error: null }),
              },
            }),
          },
        },
        { provide: APP_GUARD, useClass: PortalAccessGuard },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'mcp', method: RequestMethod.ALL },
        {
          path: '.well-known/oauth-protected-resource',
          method: RequestMethod.ALL,
        },
        {
          path: '.well-known/oauth-protected-resource/mcp',
          method: RequestMethod.ALL,
        },
      ],
    });
    await app.init();
    try {
      await request(app.getHttpServer() as Server)
        .post('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(validateAuthorizationHeader).toHaveBeenCalledWith(
        `Bearer ${token}`,
        { allowOAuthClient: true },
      );
      await request(app.getHttpServer() as Server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Este acceso de IA solo sirve en /mcp');
        });
      const res = await request(app.getHttpServer() as Server)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([404, 401]).toContain(res.status);
      expect(guard).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
