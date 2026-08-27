import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  function context(role: string | null) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;
  }

  it('allows a configured role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['Admin', 'Arquitecto']);
    expect(guard.canActivate(context('Arquitecto'))).toBe(true);
  });

  it('rejects a role that is not configured', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['Admin', 'Arquitecto']);
    expect(() => guard.canActivate(context('Ingeniero de Software'))).toThrow(
      ForbiddenException,
    );
  });
});
