import { ExecutionContext } from '@nestjs/common';
import { McpThrottlerGuard } from './mcp-throttler.guard';

describe('McpThrottlerGuard', () => {
  it('limita por usuario, separa personas con la misma IP y reinicia la ventana', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const guard = new McpThrottlerGuard();
    const response = { setHeader: jest.fn() };
    const ctx = (id: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ ip: 'office', user: { supabaseUserId: id } }),
          getResponse: () => response,
        }),
      }) as ExecutionContext;
    try {
      for (let i = 0; i < 60; i++)
        expect(guard.canActivate(ctx('a'))).toBe(true);
      try {
        guard.canActivate(ctx('a'));
        throw new Error('Se esperaba 429');
      } catch (error) {
        expect(error).toMatchObject({ status: 429 });
      }
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(guard.canActivate(ctx('b'))).toBe(true);
      now.mockReturnValue(61000);
      expect(guard.canActivate(ctx('a'))).toBe(true);
    } finally {
      now.mockRestore();
    }
  });
});
