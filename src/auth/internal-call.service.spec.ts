import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { InternalCallService } from './internal-call.service';

describe('InternalCallService', () => {
  let service: InternalCallService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [InternalCallService],
    }).compile();
    service = module.get(InternalCallService);
  });

  it('genera un secreto estable de 32 bytes en hex y distinto por instancia', async () => {
    const module = await Test.createTestingModule({
      providers: [InternalCallService],
    }).compile();
    expect(service.headerName).toBe('x-bluecore-mcp-internal');
    expect(service.secret()).toMatch(/^[a-f0-9]{64}$/);
    expect(service.secret()).toBe(service.secret());
    expect(service.secret()).not.toBe(module.get(InternalCallService).secret());
  });

  it('confía solo en el secreto de esta instancia', () => {
    expect(
      service.isTrusted({
        headers: { [service.headerName]: service.secret() },
      } as unknown as Request),
    ).toBe(true);
  });

  it.each([undefined, 'otro', 'x'.repeat(64), ['secreto'], []])(
    'rechaza una cabecera inválida: %s',
    (header) => {
      expect(
        service.isTrusted({
          headers: { [service.headerName]: header },
        } as unknown as Request),
      ).toBe(false);
    },
  );

  it('rechaza un array incluso si contiene el secreto correcto', () => {
    expect(
      service.isTrusted({
        headers: { [service.headerName]: [service.secret()] },
      } as unknown as Request),
    ).toBe(false);
  });
});
