import {
  Controller,
  Get,
  Logger,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { trustProxyHops } from './environment';
import { configureApplication } from '../main';

class RejectGuard {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

@Controller('probe')
class ProbeController {
  @Get()
  probe(@Req() req: Request) {
    return { ip: req.ip, socketIp: req.socket.remoteAddress };
  }

  @Get('denied')
  @UseGuards(RejectGuard)
  denied() {}
}

describe('trust proxy y diagnóstico HTTP', () => {
  afterEach(() => jest.restoreAllMocks());

  it('trustProxyHops devuelve cero por defecto y los saltos configurados', () => {
    expect(trustProxyHops(new ConfigService())).toBe(0);
    expect(trustProxyHops(new ConfigService({ TRUST_PROXY: 2 }))).toBe(2);
  });

  it.each([0, 1])(
    'TRUST_PROXY=%s limita la confianza a los saltos configurados',
    async (hops) => {
      const module = await Test.createTestingModule({
        controllers: [ProbeController],
        providers: [
          {
            provide: ConfigService,
            useValue: new ConfigService({
              TRUST_PROXY: hops,
              SWAGGER_ENABLED: 'false',
            }),
          },
        ],
      }).compile();
      const app = module.createNestApplication<NestExpressApplication>();
      const set = jest.spyOn(app, 'set');
      configureApplication(app);
      await app.init();
      try {
        const res = await request(app.getHttpServer() as Server)
          .get('/api/probe')
          .set('X-Forwarded-For', '6.6.6.6, 9.9.9.9')
          .expect(200);
        expect(res.body.ip).toBe(hops === 1 ? '9.9.9.9' : res.body.socketIp);
        if (hops > 0) expect(set).toHaveBeenCalledWith('trust proxy', hops);
        else expect(set).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it.each(['true', 'false'])(
    'LOG_FORWARDED_FOR=%s también contempla rechazos de guards',
    async (enabled) => {
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});
      const module = await Test.createTestingModule({
        controllers: [ProbeController],
        providers: [
          {
            provide: ConfigService,
            useValue: new ConfigService({
              TRUST_PROXY: 1,
              LOG_FORWARDED_FOR: enabled,
              SWAGGER_ENABLED: 'false',
            }),
          },
        ],
      }).compile();
      const app = module.createNestApplication<NestExpressApplication>();
      configureApplication(app);
      await app.init();
      log.mockClear();
      try {
        const res = await request(app.getHttpServer() as Server)
          .get('/api/probe/denied?email=persona@example.com&token=abc')
          .set('X-Forwarded-For', '6.6.6.6, 9.9.9.9')
          .expect(401);
        if (enabled === 'true') {
          expect(log).toHaveBeenCalledTimes(1);
          const message = log.mock.calls[0][0] as string;
          expect(message).not.toContain('persona@example.com');
          expect(message).not.toContain('token=abc');
          expect(JSON.parse(message)).toEqual({
            requestId: res.headers['x-request-id'],
            path: '/api/probe/denied',
            xForwardedFor: '6.6.6.6, 9.9.9.9',
            ip: '9.9.9.9',
            socketIp: expect.any(String),
          });
        } else expect(log).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );
});
