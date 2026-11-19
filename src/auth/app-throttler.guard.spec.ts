import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppThrottlerGuard } from './app-throttler.guard';
import { InternalCallService } from './internal-call.service';

class TestAppThrottlerGuard extends AppThrottlerGuard {
  skip(context: ExecutionContext) {
    return this.shouldSkip(context);
  }
}

describe('AppThrottlerGuard', () => {
  let guard: TestAppThrottlerGuard;
  let internalCall: InternalCallService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      providers: [TestAppThrottlerGuard, InternalCallService],
    }).compile();
    guard = module.get(TestAppThrottlerGuard);
    internalCall = module.get(InternalCallService);
  });

  function context(url: string, header?: string | string[]) {
    const request = {
      url,
      headers: { [internalCall.headerName]: header },
    } as unknown as Request;
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('salta una llamada interna confiable', async () => {
    await expect(
      guard.skip(context('/api/auth/me', internalCall.secret())),
    ).resolves.toBe(true);
  });

  it.each(['/mcp', '/mcp?session=abc', '/MCP', '/mcp/', '/MCP/?session=abc'])(
    'salta la ruta exacta %s',
    async (url) => {
      await expect(guard.skip(context(url))).resolves.toBe(true);
    },
  );

  it.each([
    '/api/auth/me',
    '/mcp/tools',
    '/mcpx',
    '/api/mcp',
    '/api/auth/me?next=/mcp',
  ])('aplica el límite a %s', async (url) => {
    await expect(guard.skip(context(url))).resolves.toBe(false);
  });

  it.each(['inventado', 'x'.repeat(64), ['inventado']])(
    'aplica con cabecera falsa %s',
    async (header) => {
      await expect(guard.skip(context('/api/auth/me', header))).resolves.toBe(
        false,
      );
    },
  );
});
