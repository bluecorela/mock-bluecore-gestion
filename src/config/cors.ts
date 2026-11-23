import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function buildCorsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'MCP-Protocol-Version',
      'MCP-Session-Id',
      'X-Firebase-AppCheck',
    ],
    exposedHeaders: ['WWW-Authenticate', 'Retry-After', 'MCP-Session-Id'],
    credentials: true,
  };
}
