import { buildCorsOptions } from './cors';

describe('buildCorsOptions', () => {
  it('permite el header de App Check y conserva la configuración de CORS', () => {
    const options = buildCorsOptions(['https://a.test']);

    expect(options.allowedHeaders).toEqual(
      expect.arrayContaining([
        'X-Firebase-AppCheck',
        'Authorization',
        'MCP-Protocol-Version',
        'MCP-Session-Id',
      ]),
    );
    expect(options.origin).toEqual(['https://a.test']);
    expect(options.credentials).toBe(true);
    expect(options.exposedHeaders).toEqual([
      'WWW-Authenticate',
      'Retry-After',
      'MCP-Session-Id',
    ]);
  });
});
