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
    expect(environmentFilePaths()).toEqual([
      '.env.test.local',
      '.env.test',
      '.env',
    ]);
  });

  it('accepts a complete production configuration', () => {
    expect(
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        PUBLIC_API_URL: 'https://api.example.com',
        CORS_ORIGINS: 'https://portal.example.com',
        FRONTEND_URL: 'https://portal.example.com',
        SWAGGER_ENABLED: 'false',
        LOAD_CONFIRMATION_SECRET: 'a'.repeat(32),
      }),
    ).toMatchObject({ NODE_ENV: 'production', PORT: 3000 });
  });

  it('rejects production without explicit CORS origins', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        PUBLIC_API_URL: 'https://api.example.com',
        FRONTEND_URL: 'https://portal.example.com',
      }),
    ).toThrow('CORS_ORIGINS is required in production');
  });

  it('rejects invalid ports', () => {
    expect(() => validateEnvironment({ ...base, PORT: '70000' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });
  const production = {
    ...base,
    NODE_ENV: 'production',
    PUBLIC_API_URL: 'https://api.example.com',
    CORS_ORIGINS: 'https://portal.example.com',
    FRONTEND_URL: 'https://portal.example.com',
  };

  it.each([undefined, '', 'a'.repeat(31), ` ${'a'.repeat(31)} `])(
    'rejects production with missing or short confirmation secret: %j',
    (secret) => {
      expect(() =>
        validateEnvironment({
          ...production,
          LOAD_CONFIRMATION_SECRET: secret,
        }),
      ).toThrow('LOAD_CONFIRMATION_SECRET must have at least 32 characters');
    },
  );

  it('accepts a confirmation secret with 32 characters after trim', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        LOAD_CONFIRMATION_SECRET: ` ${'a'.repeat(32)} `,
      }),
    ).not.toThrow();
  });

  it.each(['development', 'test'])(
    'allows missing or blank local secret in %s',
    (NODE_ENV) => {
      expect(() => validateEnvironment({ ...base, NODE_ENV })).not.toThrow();
      expect(() =>
        validateEnvironment({
          ...base,
          NODE_ENV,
          LOAD_CONFIRMATION_SECRET: '  ',
        }),
      ).not.toThrow();
    },
  );

  it('rejects an explicitly configured short local secret as a configuration error', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'development',
        LOAD_CONFIRMATION_SECRET: 'a'.repeat(31),
      }),
    ).toThrow('LOAD_CONFIRMATION_SECRET must have at least 32 characters');
  });
});

describe('PUBLIC_API_URL', () => {
  const base = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'secret',
    CORS_ORIGINS: 'https://portal.example.com',
    FRONTEND_URL: 'https://portal.example.com',
    LOAD_CONFIRMATION_SECRET: 'a'.repeat(32),
  };
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('es obligatoria en producción', () => {
    expect(() =>
      validateEnvironment({ ...base, NODE_ENV: 'production' }),
    ).toThrow('PUBLIC_API_URL is required in production');
  });
  it('rechaza un valor inválido', () => {
    expect(() =>
      validateEnvironment({ ...base, PUBLIC_API_URL: 'invalid' }),
    ).toThrow('PUBLIC_API_URL must be a valid URL');
  });
  it('recorta la barra final', () => {
    expect(
      validateEnvironment({
        ...base,
        PUBLIC_API_URL: 'https://api.example.com/',
      }).PUBLIC_API_URL,
    ).toBe('https://api.example.com');
  });
  it.each([undefined, '', '  '])(
    'avisa en development sin PUBLIC_API_URL utilizable: %j',
    (PUBLIC_API_URL) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(
          validateEnvironment({
            ...base,
            NODE_ENV: 'development',
            PORT: 3001,
            PUBLIC_API_URL,
          }).PUBLIC_API_URL,
        ).toBe('http://localhost:3001');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          'PUBLIC_API_URL no está definida: se usa http://localhost:3001. Los clientes MCP rechazarán la conexión si la API no corre en local.',
        );
      } finally {
        warn.mockRestore();
      }
    },
  );
  it.each(['development', 'test'])(
    'no avisa con una URL explícita en %s',
    (NODE_ENV) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        validateEnvironment({
          ...base,
          NODE_ENV,
          PUBLIC_API_URL: 'https://api.example.com',
        });
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );
  it('usa el puerto local sin avisar en test', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(
        validateEnvironment({ ...base, NODE_ENV: 'test', PORT: 3001 })
          .PUBLIC_API_URL,
      ).toBe('http://localhost:3001');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('interruptor MCP y proxies', () => {
  const base = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'secret',
  };

  it.each(['MCP_ENABLED', 'LOG_FORWARDED_FOR'])(
    '%s usa false si falta y solo acepta true o false',
    (name) => {
      expect(validateEnvironment(base)[name]).toBe('false');
      for (const value of ['true', 'false']) {
        expect(validateEnvironment({ ...base, [name]: value })[name]).toBe(
          value,
        );
      }
      for (const value of [`{${name}}`, '1', 'yes', '', 'TRUE', true, null]) {
        expect(() => validateEnvironment({ ...base, [name]: value })).toThrow(
          name,
        );
      }
    },
  );

  it('TRUST_PROXY usa cero si falta y devuelve saltos numéricos', () => {
    expect(validateEnvironment(base).TRUST_PROXY).toBe(0);
    for (const value of ['0', '1', '2']) {
      expect(
        validateEnvironment({ ...base, TRUST_PROXY: value }).TRUST_PROXY,
      ).toBe(Number(value));
    }
  });

  it.each([
    '-1',
    'abc',
    '{TRUST_PROXY}',
    'true',
    '1.5',
    '',
    ' ',
    '1e2',
    '0x10',
    null,
    true,
  ])('rechaza TRUST_PROXY=%j', (TRUST_PROXY) => {
    expect(() => validateEnvironment({ ...base, TRUST_PROXY })).toThrow(
      'TRUST_PROXY',
    );
  });
});
