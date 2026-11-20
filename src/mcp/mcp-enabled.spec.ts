/* eslint-disable @typescript-eslint/no-require-imports */
import type { Server } from 'node:http';
import request from 'supertest';

describe.each(['false', 'true'])('AppModule con MCP_ENABLED=%s', (enabled) => {
  it('controla MCP y metadata sin permitir OAuth en el portal', async () => {
    const originalEnv = { ...process.env };
    process.env.MCP_ENABLED = enabled;
    process.env.SUPABASE_URL = 'http://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    process.env.NODE_ENV = 'test';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Red prohibida en este test'));
    try {
      await jest.isolateModulesAsync(async () => {
        const { Test } =
          require('@nestjs/testing') as typeof import('@nestjs/testing');
        const { AppModule } =
          require('../app.module') as typeof import('../app.module');
        const { SupabaseClient } =
          require('../supabase/supabase.client') as typeof import('../supabase/supabase.client');
        const { SupabaseDataService } =
          require('../supabase/supabase-data.service') as typeof import('../supabase/supabase-data.service');
        const { configureApplication } =
          require('../main') as typeof import('../main');
        const module = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(SupabaseClient)
          .useValue({
            getClient: () => ({
              auth: {
                getUser: jest.fn().mockResolvedValue({
                  data: { user: { id: 'user', email: 'user@example.com' } },
                  error: null,
                }),
              },
            }),
          })
          .overrideProvider(SupabaseDataService)
          .useValue({
            getPersonnelByAuthUserId: jest.fn().mockResolvedValue({
              id: 'person',
              role: 'Arquitecto',
              status: 'activo',
            }),
          })
          .compile();
        const app =
          module.createNestApplication<
            import('@nestjs/platform-express').NestExpressApplication
          >();
        configureApplication(app);
        await app.init();
        try {
          await request(app.getHttpServer() as Server)
            .post('/mcp')
            .send({})
            .expect(enabled === 'true' ? 401 : 404);
          for (const path of [
            '/.well-known/oauth-protected-resource',
            '/.well-known/oauth-protected-resource/mcp',
          ]) {
            await request(app.getHttpServer() as Server)
              .get(path)
              .expect(enabled === 'true' ? 200 : 404);
          }
          const token = `header.${Buffer.from(JSON.stringify({ client_id: 'ia' })).toString('base64url')}.signature`;
          await request(app.getHttpServer() as Server)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .expect(401)
            .expect((res) =>
              expect(res.body.message).toBe(
                'Este acceso de IA solo sirve en /mcp',
              ),
            );
          expect(fetchMock).not.toHaveBeenCalled();
        } finally {
          await app.close();
        }
      });
    } finally {
      process.env = originalEnv;
      jest.restoreAllMocks();
    }
  });
});
