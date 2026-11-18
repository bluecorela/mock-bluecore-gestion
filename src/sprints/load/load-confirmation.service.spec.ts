import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { canonicalJson } from './canonical-json';
import {
  LoadConfirmationService,
  LoadOperation,
} from './load-confirmation.service';

const secret = 'a'.repeat(32);
const message =
  'La confirmación no es válida o venció; genera la vista previa de nuevo';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const input = {
  operation: 'stories_bulk' as LoadOperation,
  employeeId: 'employee-1',
  target: 'sprint-1',
  content: { title: 'Historia', storyPoints: 3 },
};
function makeService(value: string | undefined = secret, env = 'test') {
  const get = jest.fn((key: string) =>
    key === 'LOAD_CONFIRMATION_SECRET' ? value : env,
  );
  return new LoadConfirmationService({ get } as unknown as ConfigService);
}
function sign(payload: unknown, key = secret) {
  const part = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${part}.${createHmac('sha256', key).update(part).digest('base64url')}`;
}
function rejects(
  service: LoadConfirmationService,
  token: string,
  expected: Parameters<LoadConfirmationService['verify']>[1] = input,
) {
  expect(() => service.verify(token, expected)).toThrow(
    new BadRequestException(message),
  );
}

describe('LoadConfirmationService', () => {
  let service: LoadConfirmationService;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    service = makeService();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('emite y verifica una confirmación UUID v4 con vencimiento ISO a diez minutos', () => {
    const { token, expiresAt } = service.issue(input);
    expect(expiresAt).toBe('2026-11-10T12:10:00.000Z');
    expect(service.verify(token, input).confirmationId).toMatch(uuid);
    const [part, signature] = token.split('.');
    expect(signature).toBe(
      createHmac('sha256', secret).update(part).digest('base64url'),
    );
  });

  it.each([3000, 33, 0])(
    'rechaza contenido inválido al emitir (profundidad %i; 0 = undefined)',
    (depth) => {
      const content: unknown = depth
        ? JSON.parse('['.repeat(depth) + '0' + ']'.repeat(depth))
        : undefined;
      expect(() => service.issue({ ...input, content })).toThrow(
        new BadRequestException('El contenido de la carga no es válido'),
      );
    },
  );

  it('emite y verifica contenido de 32 niveles', () => {
    const content: unknown = JSON.parse('['.repeat(32) + '0' + ']'.repeat(32));
    const expected = { ...input, content };
    const { token } = service.issue(expected);
    expect(service.verify(token, expected).confirmationId).toMatch(uuid);
  });

  it('normaliza el error al verificar contenido esperado de 3000 niveles', () => {
    const { token } = service.issue(input);
    const content: unknown = JSON.parse(
      '['.repeat(3000) + '0' + ']'.repeat(3000),
    );
    expect(() => service.verify(token, { ...input, content })).toThrow(
      new BadRequestException(message),
    );
  });

  it.each([
    { content: { ...input.content, storyPoints: 5 } },
    { employeeId: 'employee-2' },
    { target: 'sprint-2' },
    { operation: 'story_update' as LoadOperation },
  ])('rechaza datos distintos: %j', (change) => {
    rejects(service, service.issue(input).token, { ...input, ...change });
  });

  it('no normaliza espacios: el contenido con espacios distintos se rechaza (lo normalizan los callers)', () => {
    const { token } = service.issue(input);
    rejects(service, token, {
      ...input,
      content: { ...input.content, title: 'Historia ' },
    });
    rejects(service, token, {
      ...input,
      content: { ...input.content, title: ' Historia' },
    });
  });

  it('el orden de un array cambia el contenido y se rechaza', () => {
    const items = { ...input, content: { stories: [{ n: 'a' }, { n: 'b' }] } };
    const { token } = service.issue(items);
    rejects(service, token, {
      ...items,
      content: { stories: [{ n: 'b' }, { n: 'a' }] },
    });
    expect(service.verify(token, items).confirmationId).toMatch(uuid);
  });

  it('acepta 9:59 y rechaza desde el minuto diez', () => {
    const { token } = service.issue(input);
    jest.advanceTimersByTime(599_000);
    expect(service.verify(token, input).confirmationId).toMatch(uuid);
    jest.advanceTimersByTime(1_000);
    rejects(service, token);
    jest.advanceTimersByTime(1_000);
    rejects(service, token);
  });

  it('verifica el mismo contenido con claves reordenadas', () => {
    const { token } = service.issue(input);
    expect(
      service.verify(token, {
        ...input,
        content: { storyPoints: 3, title: 'Historia' },
      }).confirmationId,
    ).toMatch(uuid);
  });

  it.each([
    undefined,
    null,
    42,
    {},
    '',
    'sin-punto',
    'a.b.c',
    '%%%.%%%',
    'a.',
    '.a',
  ])('normaliza el error de token %j', (token) => {
    rejects(service, token as string);
  });

  it('rechaza firma alterada, longitud incorrecta y payload firmado con otro secreto', () => {
    const { token } = service.issue(input);
    const [part, signature] = token.split('.');
    rejects(
      service,
      `${part}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`,
    );
    rejects(service, `${part}.YQ`);
    const payload = JSON.parse(
      Buffer.from(part, 'base64url').toString(),
    ) as Record<string, unknown>;
    rejects(service, sign({ ...payload, target: 'otro' }, 'b'.repeat(32)));
  });

  it('normaliza JSON inválido aun con firma válida', () => {
    const part = Buffer.from('{').toString('base64url');
    rejects(
      service,
      `${part}.${createHmac('sha256', secret).update(part).digest('base64url')}`,
    );
  });

  it('rechaza payloads incompletos o con tipos incorrectos aun con firma válida', () => {
    const [part] = service.issue(input).token.split('.');
    const payload = JSON.parse(
      Buffer.from(part, 'base64url').toString(),
    ) as Record<string, unknown>;
    for (const field of Object.keys(payload)) {
      const incomplete = { ...payload };
      delete incomplete[field];
      rejects(service, sign(incomplete));
      rejects(service, sign({ ...payload, [field]: null }));
      rejects(service, sign({ ...payload, [field]: {} }));
    }
    for (const change of [
      { v: 2 },
      { id: 'not-a-uuid' },
      { exp: '9999999999999' },
      { op: 'unknown' },
      { hash: 'invalid' },
    ]) {
      rejects(service, sign({ ...payload, ...change }));
    }
    for (const value of [null, [], 'text', 1]) rejects(service, sign(value));
  });

  it.each([undefined, '', '   '])(
    'sin secreto local genera uno por instancia y avisa (%j)',
    (value) => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      // El argumento explícito undefined no debe activar el default del helper.
      const config = {
        get: (key: string) => (key === 'NODE_ENV' ? 'development' : value),
      } as ConfigService;
      const first = new LoadConfirmationService(config);
      const second = new LoadConfirmationService(config);
      const { token } = first.issue(input);
      expect(first.verify(token, input).confirmationId).toMatch(uuid);
      rejects(second, token);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(
        'LOAD_CONFIRMATION_SECRET no definido; los tokens no sobreviven a un reinicio',
      );
    },
  );
});

describe('canonicalJson', () => {
  it.each(['array', 'objeto'])(
    'limita la profundidad de %s a 32 niveles',
    (kind) => {
      let content: unknown = 0;
      for (let depth = 0; depth < 32; depth++) {
        content = kind === 'array' ? [content] : { child: content };
      }
      expect(() => canonicalJson(content)).not.toThrow();
      content = kind === 'array' ? [content] : { child: content };
      expect(() => canonicalJson(content)).toThrow(RangeError);
    },
  );

  it('ordena claves recursivamente y omite undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 }, omitted: undefined })).toBe(
      canonicalJson({ a: { c: 2, d: 1 }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(
      '{"a":{"c":2,"d":1},"b":1}',
    );
  });
  it('conserva el orden de arrays y las reglas JSON para undefined en arrays', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, undefined, 3])).toBe(
      '[{"a":2,"b":1},null,3]',
    );
    expect(canonicalJson([3, 1])).not.toBe(canonicalJson([1, 3]));
  });
});
