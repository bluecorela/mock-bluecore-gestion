import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PUBLIC_ROUTE_KEY } from './access.decorators';
import { InternalCallService } from './internal-call.service';

describe('AuthController client-config', () => {
  let controller: AuthController;
  const values: Record<string, string | undefined> = {};

  beforeEach(async () => {
    values.SUPABASE_URL = ' https://example.supabase.co ';
    values.SUPABASE_ANON_KEY = ' public-anon-key ';
    values.SUPABASE_SERVICE_ROLE_KEY = 'private-service-key';
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        InternalCallService,
        { provide: AuthService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => values[key] },
        },
      ],
    }).compile();
    controller = module.get(AuthController);
  });

  it('returns only public configuration (GET defaults to 200)', () => {
    expect(controller.clientConfig()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'public-anon-key',
    });
  });

  it.each([
    ['SUPABASE_ANON_KEY', undefined],
    ['SUPABASE_ANON_KEY', '   '],
    ['SUPABASE_URL', undefined],
    ['SUPABASE_URL', '   '],
  ])('returns 503 for missing %s (%s)', (key, value) => {
    values[key!] = value;
    try {
      controller.clientConfig();
      throw new Error('Expected unavailable configuration');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as Error).message).toBe(
        'Configuración de cliente no disponible',
      );
    }
  });

  it('has public metadata', () => {
    expect(
      Reflect.getMetadata(
        PUBLIC_ROUTE_KEY,
        AuthController.prototype.clientConfig,
      ),
    ).toBe(true);
  });
});
