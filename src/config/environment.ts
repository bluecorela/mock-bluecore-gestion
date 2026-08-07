export type ApplicationEnvironment = 'development' | 'test' | 'production';

const environments: ApplicationEnvironment[] = ['development', 'test', 'production'];

export function environmentFilePaths(): string[] {
  const environment = (process.env.NODE_ENV || 'development') as ApplicationEnvironment;
  return [`.env.${environment}.local`, `.env.${environment}`, '.env'];
}

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const config = { ...input };
  const environment = String(config.NODE_ENV || 'development') as ApplicationEnvironment;
  if (!environments.includes(environment)) {
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  }
  config.NODE_ENV = environment;

  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  config.PORT = port;

  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!String(config[name] ?? '').trim()) throw new Error(`${name} is required`);
  }

  try {
    new URL(String(config.SUPABASE_URL));
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL');
  }

  config.SUPABASE_V2_SCHEMA = String(config.SUPABASE_V2_SCHEMA || 'bluecore_v2');
  config.SWAGGER_ENABLED = String(config.SWAGGER_ENABLED ?? environment !== 'production');

  if (environment === 'production') {
    if (!String(config.CORS_ORIGINS ?? '').trim()) {
      throw new Error('CORS_ORIGINS is required in production');
    }
    if (!String(config.FRONTEND_URL ?? '').trim()) {
      throw new Error('FRONTEND_URL is required in production');
    }
  }

  if (config.AUTH_EMAIL_PROVIDER === 'supabase' && !String(config.SUPABASE_ANON_KEY ?? '').trim()) {
    throw new Error('SUPABASE_ANON_KEY is required when AUTH_EMAIL_PROVIDER=supabase');
  }

  return config;
}
