import { environmentFilePaths, validateEnvironment } from './environment';

describe('environment configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const base = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  };

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('loads environment-specific files before the generic fallback', () => {
    process.env.NODE_ENV = 'test';
    expect(environmentFilePaths()).toEqual(['.env.test.local', '.env.test', '.env']);
  });

  it('accepts a complete production configuration', () => {
    expect(validateEnvironment({
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://portal.example.com',
      FRONTEND_URL: 'https://portal.example.com',
      SWAGGER_ENABLED: 'false',
    })).toMatchObject({ NODE_ENV: 'production', PORT: 3000 });
  });

  it('rejects production without explicit CORS origins', () => {
    expect(() => validateEnvironment({
      ...base,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://portal.example.com',
    })).toThrow('CORS_ORIGINS is required in production');
  });

  it('rejects invalid ports', () => {
    expect(() => validateEnvironment({ ...base, PORT: '70000' }))
      .toThrow('PORT must be an integer between 1 and 65535');
  });
});
