import { InternalApi, ApiError } from './internal-api';

const header = { name: 'x-bluecore-mcp-internal', value: 'secret' };
it('envía el Bearer y la cabecera interna en cada petición', async () => {
  const fetchFn = jest
    .fn()
    .mockImplementation(async () => Response.json({ ok: true }));
  const api = new InternalApi('http://x/api', 'token', header, fetchFn);
  expect(await api.get('/auth/me')).toEqual({ ok: true });
  await api.post('/x', { a: 1 });
  await api.patch('/x', { a: 2 });
  expect(fetchFn.mock.calls).toEqual([
    [
      'http://x/api/auth/me',
      {
        method: 'GET',
        signal: expect.any(AbortSignal),
        headers: { Authorization: 'Bearer token', [header.name]: header.value },
      },
    ],
    ...['POST', 'PATCH'].map((method, i) => [
      'http://x/api/x',
      {
        method,
        signal: expect.any(AbortSignal),
        headers: {
          Authorization: 'Bearer token',
          [header.name]: header.value,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ a: i + 1 }),
      },
    ]),
  ]);
});
it('no reintenta ante un 401', async () => {
  const fetchFn = jest
    .fn()
    .mockResolvedValue(
      Response.json({ message: 'Sin acceso' }, { status: 401 }),
    );
  await expect(
    new InternalApi('http://x', 'token', header, fetchFn).get('/x'),
  ).rejects.toMatchObject({ status: 401, message: 'Sin acceso' });
  expect(fetchFn).toHaveBeenCalledTimes(1);
});
it('propaga el mensaje 403 del back', async () => {
  const message = 'Todavía no disponible, estamos trabajando :D';
  const api = new InternalApi(
    'http://x',
    'token',
    header,
    jest
      .fn()
      .mockImplementation(async () =>
        Response.json({ message }, { status: 403 }),
      ),
  );
  await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);
  await expect(api.get('/x')).rejects.toMatchObject({ status: 403, message });
});

it('limita el fetch a 30 segundos y convierte el timeout en 504', async () => {
  const timeout = jest.spyOn(AbortSignal, 'timeout');
  const fetchFn = jest
    .fn()
    .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
  await expect(
    new InternalApi('http://x', 'token', header, fetchFn).get('/x'),
  ).rejects.toMatchObject({
    status: 504,
    message: 'La API interna no respondió a tiempo',
  });
  expect(timeout).toHaveBeenCalledWith(30_000);
  timeout.mockRestore();
});
