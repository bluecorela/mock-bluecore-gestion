import { PreviewCache, previewKey } from './preview-cache';
afterEach(() => jest.useRealTimers());
it('vence después de diez minutos', () => {
  jest.useFakeTimers();
  const cache = new PreviewCache();
  cache.remember('k', 't', new Date(Date.now() + 600000).toISOString());
  jest.advanceTimersByTime(601000);
  expect(cache.take('k')).toBeNull();
});
it('sigue vigente justo antes de los diez minutos', () => {
  jest.useFakeTimers();
  const cache = new PreviewCache();
  cache.remember('k', 't', new Date(Date.now() + 600000).toISOString());
  jest.advanceTimersByTime(599000);
  expect(cache.take('k')).toBe('t');
  expect(cache.take('k')).toBeNull();
});
it('consume incluso un token vacío una sola vez', () => {
  const cache = new PreviewCache();
  cache.remember('k', '', new Date(Date.now() + 600000).toISOString());
  expect(cache.take('k')).toBe('');
  expect(cache.take('k')).toBeNull();
});
it('ordena claves recursivamente y omite undefined', () => {
  expect(
    previewKey('a', 'op', 't', { b: [{ z: 1, a: 2 }], a: undefined }),
  ).toBe(previewKey('a', 'op', 't', { b: [{ a: 2, z: 1 }] }));
  expect(previewKey('a', 'op', 't', { puntos: 1 })).not.toBe(
    previewKey('a', 'op', 't', { puntos: 2 }),
  );
});

it('purga al guardar todas las entradas vencidas y conserva las vigentes', () => {
  jest.useFakeTimers();
  const cache = new PreviewCache();
  cache.remember('vieja', 'a', new Date(Date.now() + 1000).toISOString());
  cache.remember('vigente', 'b', new Date(Date.now() + 5000).toISOString());
  jest.advanceTimersByTime(1000);
  cache.remember('nueva', 'c', new Date(Date.now() + 5000).toISOString());
  expect(cache['entries'].size).toBe(2);
  expect(cache.take('vigente')).toBe('b');
  expect(cache.take('nueva')).toBe('c');
});
