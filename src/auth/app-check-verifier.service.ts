import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, type App } from 'firebase-admin/app';
import type { AppCheckRejectReason } from './app-check.constants';

export class AppCheckRejection extends Error {
  constructor(readonly reason: Exclude<AppCheckRejectReason, 'missing'>) {
    super(reason);
  }
}

@Injectable()
export class AppCheckVerifier {
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('FIREBASE_PROJECT_ID'));
  }

  async verify(token: string): Promise<void> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    if (!projectId) {
      throw new AppCheckRejection('unavailable');
    }

    try {
      // Carga diferida: el SDK depende de módulos ESM que Jest no carga con import estático.
      const { getAppCheck } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('firebase-admin/app-check') as typeof import('firebase-admin/app-check');
      this.app ??= initializeApp({ projectId }, 'app-check');
      await getAppCheck(this.app).verifyToken(token);
    } catch (error) {
      const { code, message, cause } = (error ?? {}) as {
        code?: string;
        message?: string;
        cause?: { code?: string };
      };

      if (
        code === 'app-check/app-check-token-expired' ||
        (code === 'app-check/invalid-argument' &&
          /^(?:The provided )?(?:App Check )?token has expired\b/i.test(
            message ?? '',
          ))
      ) {
        throw new AppCheckRejection('expired');
      }

      // Firebase envuelve como invalid-argument los fallos al descargar las claves públicas.
      if (
        code === 'app-check/invalid-argument' &&
        cause?.code !== 'key-fetch-error' &&
        !message?.startsWith('Error fetching Json Web Keys:')
      ) {
        throw new AppCheckRejection('invalid');
      }

      throw new AppCheckRejection('unavailable');
    }
  }
}
