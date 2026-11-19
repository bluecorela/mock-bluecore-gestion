import { Body, Controller, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { configureBodyParsers } from './body-parser';

@Controller()
class LoadController {
  @Post('load')
  load(@Body() body: { stories: unknown[] }) {
    return { count: body.stories.length };
  }
}

describe('Límite del body', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LoadController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use((request: Request, response: Response, next: NextFunction) => {
      const requestId = request.header('x-request-id') || randomUUID();
      request.headers['x-request-id'] = requestId;
      response.setHeader('x-request-id', requestId);
      next();
    });
    app.enableCors({
      origin: 'http://localhost:4200',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
    configureBodyParsers(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('acepta unas 300 kB con 200 historias', async () => {
    const body = {
      stories: Array.from({ length: 200 }, () => ({
        name: 'Historia',
        storyPoints: 1,
        description: 'a'.repeat(1500),
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(300000);
    await request(app.getHttpServer())
      .post('/load')
      .send(body)
      .expect(201)
      .expect({ count: 200 });
  });
  it('responde en español cuando supera 1 MB', async () => {
    await request(app.getHttpServer())
      .post('/load')
      .send({ stories: ['a'.repeat(1024 * 1024)] })
      .expect(413)
      .expect({
        statusCode: 413,
        message: 'La carga es demasiado grande (máximo 1 MB)',
      });
  });
  it('conserva CORS, helmet y request-id al rechazar más de 1 MB', async () => {
    await request(app.getHttpServer())
      .post('/load')
      .set('Origin', 'http://localhost:4200')
      .send({ stories: ['a'.repeat(1024 * 1024)] })
      .expect(413)
      .expect({
        statusCode: 413,
        message: 'La carga es demasiado grande (máximo 1 MB)',
      })
      .expect('Access-Control-Allow-Origin', 'http://localhost:4200')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('x-request-id', /.+/);
  });
});
