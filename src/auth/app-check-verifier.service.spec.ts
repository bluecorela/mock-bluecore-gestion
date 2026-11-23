import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getAppCheck, type AppCheck } from 'firebase-admin/app-check';
import { initializeApp, type App } from 'firebase-admin/app';
import {
  AppCheckRejection,
  AppCheckVerifier,
} from './app-check-verifier.service';

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));
jest.mock('firebase-admin/app-check', () => ({ getAppCheck: jest.fn() }));

describe('AppCheckVerifier', () => {
  const projectId = 'test-project';
  const app: App = { name: 'app-check', options: { projectId } };
  const getConfig = jest.fn();
  const verifyToken = jest.fn();
  let verifier: AppCheckVerifier;

  beforeEach(async () => {
    jest.resetAllMocks();
    getConfig.mockReturnValue(projectId);
    verifyToken.mockResolvedValue({});
    jest.mocked(initializeApp).mockReturnValue(app);
    jest
      .mocked(getAppCheck)
      .mockReturnValue({ verifyToken } as unknown as AppCheck);

    const module = await Test.createTestingModule({
      providers: [
        AppCheckVerifier,
        { provide: ConfigService, useValue: { get: getConfig } },
      ],
    }).compile();
    verifier = module.get(AppCheckVerifier);
  });

  it('indica si hay un proyecto configurado sin inicializar Firebase', () => {
    expect(verifier.isConfigured()).toBe(true);
    expect(getConfig).toHaveBeenCalledWith('FIREBASE_PROJECT_ID');
    getConfig.mockReturnValue(undefined);
    expect(verifier.isConfigured()).toBe(false);
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it('resuelve cuando Firebase verifica el token', async () => {
    await expect(verifier.verify('tok')).resolves.toBeUndefined();
    expect(getAppCheck).toHaveBeenCalledWith(app);
    expect(verifyToken).toHaveBeenCalledWith('tok');
  });

  it('inicializa Firebase una vez al verificar tres tokens', async () => {
    expect(initializeApp).not.toHaveBeenCalled();
    await Promise.all([
      verifier.verify('tok'),
      verifier.verify('tok'),
      verifier.verify('tok'),
    ]);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeApp).toHaveBeenCalledWith({ projectId }, 'app-check');
    expect(verifyToken).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      {
        code: 'app-check/invalid-argument',
        message: 'The provided App Check token has expired.',
      },
      'expired',
    ],
    [{ code: 'app-check/app-check-token-expired' }, 'expired'],
    [
      {
        code: 'app-check/invalid-argument',
        message: 'The provided App Check token has invalid signature.',
      },
      'invalid',
    ],
    [
      {
        code: 'app-check/invalid-argument',
        message:
          'The provided App Check token has "kid" claim which does not correspond to a known public key. Most likely the provided App Check token is expired, so get a fresh token from your client app and try again.',
      },
      'invalid',
    ],
    [{ code: 'app/network-error' }, 'unavailable'],
    [new Error('Error fetching Json Web Keys'), 'unavailable'],
    [
      {
        code: 'app-check/invalid-argument',
        cause: { code: 'key-fetch-error' },
      },
      'unavailable',
    ],
    [
      {
        code: 'app-check/invalid-argument',
        message: 'Error fetching Json Web Keys: connection reset',
      },
      'unavailable',
    ],
  ] as const)(
    'clasifica el fallo de Firebase %p como %s',
    async (error, reason) => {
      verifyToken.mockRejectedValue(error);
      const verification = verifier.verify('tok');
      await expect(verification).rejects.toBeInstanceOf(AppCheckRejection);
      await expect(verification).rejects.toMatchObject({ reason });
    },
  );

  it('rechaza la verificación sin proyecto y sin inicializar Firebase', async () => {
    getConfig.mockReturnValue(undefined);
    const verification = verifier.verify('tok');
    await expect(verification).rejects.toBeInstanceOf(AppCheckRejection);
    await expect(verification).rejects.toMatchObject({ reason: 'unavailable' });
    expect(initializeApp).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
