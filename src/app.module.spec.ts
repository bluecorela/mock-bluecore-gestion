import type { ClassProvider, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppCheckGuard } from './auth/app-check.guard';
import { AppThrottlerGuard } from './auth/app-throttler.guard';
import { PortalAccessGuard } from './auth/portal-access.guard';

describe('AppModule', () => {
  it('registra App Check después del throttling y antes del acceso al portal', () => {
    const env = jest.replaceProperty(process, 'env', {
      ...process.env,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });
    try {
      const { AppModule } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./app.module') as typeof import('./app.module');
      const providers = Reflect.getMetadata(
        'providers',
        AppModule,
      ) as Provider[];
      const guards = providers
        .filter(
          (provider): provider is ClassProvider =>
            typeof provider === 'object' &&
            'useClass' in provider &&
            provider.provide === APP_GUARD,
        )
        .map((provider) => provider.useClass);

      expect(guards).toEqual([
        AppThrottlerGuard,
        AppCheckGuard,
        PortalAccessGuard,
      ]);
    } finally {
      env.restore();
    }
  });
});
