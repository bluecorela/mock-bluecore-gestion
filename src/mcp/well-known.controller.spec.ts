import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { WellKnownController } from './well-known.controller';

describe('metadata OAuth', () => {
  it('sirve ambas rutas públicas fuera de api', async () => {
    const module = await Test.createTestingModule({
      controllers: [WellKnownController],
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            PUBLIC_API_URL: 'https://api.example.com',
            SUPABASE_URL: 'https://example.supabase.co',
          }),
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      for (const path of [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
      ]) {
        await request(app.getHttpServer() as Server)
          .get(path)
          .expect(200)
          .expect({
            resource: 'https://api.example.com/mcp',
            authorization_servers: ['https://example.supabase.co/auth/v1'],
            bearer_methods_supported: ['header'],
          });
      }
    } finally {
      await app.close();
    }
  });
});
