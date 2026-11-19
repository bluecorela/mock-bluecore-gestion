import { InternalApi, ApiError } from '../internal-api';
import { PreviewCache } from '../preview-cache';
import {
  createWriteTools,
  CONFIRMATION_INSTRUCTIONS,
  writeDescriptions,
} from './write-tools';

const missing =
  'Primero genera la vista previa (confirmar=false) con estos mismos datos';
const input = {
  equipo_id: 't',
  sprint_id: 's',
  historias: [
    { nombre: 'Historia', puntos: 3, estado: 'En progreso' as const },
  ],
};
function setup(preview = {}) {
  const fetchFn = jest.fn().mockImplementation(async (url: string) =>
    Response.json(
      url.endsWith('/preview')
        ? {
            creates: [{ row: 1, code: 'HU-7', name: 'Historia' }],
            updates: [],
            errors: [],
            confirmationToken: 'token',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            ...preview,
          }
        : { ok: true },
    ),
  );
  const api = new InternalApi(
    'http://x/api',
    't',
    { name: 'x-bluecore-mcp-internal', value: 'secret' },
    fetchFn,
  );
  return {
    fetchFn,
    api,
    tools: createWriteTools(api, new PreviewCache(), 'a'),
  };
}
it('rechaza confirmar sin vista previa sin llamar al back', async () => {
  const { tools, fetchFn } = setup();
  expect(await tools.cargar_historias({ ...input, confirmar: true })).toEqual({
    isError: true,
    content: [{ type: 'text', text: missing }],
  });
  expect(fetchFn).not.toHaveBeenCalled();
});
it('confirma datos iguales, traduce estado y consume el token', async () => {
  const { tools, fetchFn } = setup();
  expect((await tools.cargar_historias(input)).content[0].text).toContain(
    'Se crearán 1',
  );
  await tools.cargar_historias({ ...input, confirmar: true });
  expect(fetchFn).toHaveBeenLastCalledWith(
    'http://x/api/v2/teams/t/sprints/s/stories/bulk',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        stories: [{ name: 'Historia', storyPoints: 3, status: 'in_progress' }],
        confirmationToken: 'token',
      }),
    }),
  );
  expect(
    (await tools.cargar_historias({ ...input, confirmar: true })).isError,
  ).toBe(true);
  expect(fetchFn).toHaveBeenCalledTimes(2);
});
it('rechaza cambios de puntos', async () => {
  const { tools, fetchFn } = setup();
  await tools.cargar_historias(input);
  expect(
    (
      await tools.cargar_historias({
        ...input,
        historias: [{ nombre: 'Historia', puntos: 5 }],
        confirmar: true,
      })
    ).isError,
  ).toBe(true);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});
it('no guarda una vista previa con errores', async () => {
  const { tools, fetchFn } = setup({
    errors: [{ row: 1, code: 'HU-7', message: 'Completada' }],
  });
  expect((await tools.cargar_historias(input)).content[0].text).toContain(
    'Fila 1 (HU-7): Completada',
  );
  expect(
    (await tools.cargar_historias({ ...input, confirmar: true })).isError,
  ).toBe(true);
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(
    fetchFn.mock.calls.some(([url]) => String(url).endsWith('/bulk')),
  ).toBe(false);
});
it('no confirma con un token vencido y no llama a /bulk', async () => {
  jest.useFakeTimers();
  try {
    const { tools, fetchFn } = setup();
    await tools.cargar_historias(input);
    jest.advanceTimersByTime(601000);
    expect(
      (await tools.cargar_historias({ ...input, confirmar: true })).isError,
    ).toBe(true);
    expect(
      fetchFn.mock.calls.some(([url]) => String(url).endsWith('/bulk')),
    ).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
it('envía exactamente un POST a /bulk al confirmar', async () => {
  const { tools, fetchFn } = setup();
  await tools.cargar_historias(input);
  await tools.cargar_historias({ ...input, confirmar: true });
  const bulks = fetchFn.mock.calls.filter(
    ([url, init]) =>
      String(url).endsWith('/stories/bulk') && init.method === 'POST',
  );
  expect(bulks).toHaveLength(1);
});
it('crea sprint sin historias y sin token', async () => {
  const { tools, fetchFn } = setup({ confirmationToken: null });
  const data = {
    equipo_id: 't',
    proyecto_id: 'p',
    fecha_inicio: '2026-11-10',
    fecha_fin: '2026-11-20',
  };
  await tools.crear_sprint(data);
  await tools.crear_sprint({ ...data, confirmar: true });
  expect(fetchFn).toHaveBeenLastCalledWith(
    'http://x/api/v2/teams/t/sprints',
    expect.objectContaining({
      body: JSON.stringify({
        projectId: 'p',
        startDate: data.fecha_inicio,
        endDate: data.fecha_fin,
      }),
    }),
  );
});
it('actualiza por código normalizado con PATCH y token', async () => {
  const { tools, fetchFn } = setup({
    changes: { storyPoints: { from: 3, to: 5 } },
    story: { code: 'HU-7', sprintName: 'Sprint-4', teamName: 'Alfa' },
  });
  const data = { codigo: ' hu-7 ', puntos: 5 };
  const preview = await tools.actualizar_historia(data);
  expect(preview.content[0].text).toContain('Sprint-4');
  await tools.actualizar_historia({ ...data, confirmar: true });
  expect(fetchFn).toHaveBeenLastCalledWith(
    'http://x/api/v2/stories/by-code/HU-7',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ storyPoints: 5, confirmationToken: 'token' }),
    }),
  );
});
it.each([
  'Solo el Arquitecto del equipo puede realizar esta acción',
  'Solo los líderes del equipo pueden realizar esta acción',
])('conserva el 403: %s', async (message) => {
  const { tools, fetchFn } = setup();
  expect(
    (await tools.actualizar_historia({ codigo: 'HU-7' })).content[0].text,
  ).toBe('Indica al menos un campo a cambiar');
  fetchFn.mockResolvedValue(Response.json({ message }, { status: 403 }));
  expect((await tools.cargar_historias(input)).content[0].text).toBe(message);
});
it.each(['Scrum Master', 'Arquitecto'])(
  'registra permisos y descripciones: %s',
  async (role) => {
    for (const name of [
      'cargar_historias',
      'actualizar_historia',
      ...(role === 'Arquitecto' ? ['crear_sprint'] : []),
    ] as (keyof typeof writeDescriptions)[]) {
      expect(
        writeDescriptions[name].startsWith(CONFIRMATION_INSTRUCTIONS),
      ).toBe(true);
    }
    expect(
      writeDescriptions.crear_sprint.endsWith(
        'Si el sprint ya existe, no lo crees: usa listar_sprints y cargar_historias.',
      ),
    ).toBe(true);
    expect(CONFIRMATION_INSTRUCTIONS).toBe(
      'Primero llama con confirmar=false y muestra al usuario la vista previa completa. Espera a que responda "sí". Solo entonces llama de nuevo con confirmar=true y exactamente los mismos datos. El usuario siempre indica el sprint destino: si no lo indicó, pregúntale; nunca asumas el sprint actual.',
    );
  },
);

it('muestra historias nuevas sin código', async () => {
  const { tools } = setup({
    creates: [{ row: 1, code: null, name: 'Historia' }],
  });
  expect((await tools.cargar_historias(input)).content[0].text).toContain(
    '(nueva): Historia',
  );
});
it.each([
  { changes: {}, errors: [], count: 0, unchanged: true },
  {
    changes: { storyPoints: { from: 3, to: 5 } },
    errors: ['Sin permiso'],
    count: 0,
    unchanged: false,
  },
  { changes: {}, errors: ['Sin permiso'], count: 0, unchanged: false },
  {
    changes: { storyPoints: { from: 3, to: 5 } },
    errors: [],
    count: 1,
    unchanged: false,
  },
])(
  'cuenta actualizaciones según cambios y errores: %j',
  async ({ changes, errors, count, unchanged }) => {
    const { tools } = setup({ story: { code: 'HU-7' }, changes, errors });
    const text = (
      await tools.actualizar_historia({ codigo: 'HU-7', puntos: 5 })
    ).content[0].text;
    expect(text).toContain('Se actualizarán ' + count);
    expect(
      text.includes('Sin cambios: la historia ya tiene esos valores'),
    ).toBe(unchanged);
  },
);
it.each([
  ['name', 'nombre', 'Antes', 'Después', 'Antes', 'Después'],
  ['description', 'descripcion', null, 'Detalle', '—', 'Detalle'],
  ['storyPoints', 'puntos', 0, 5, '0', '5'],
  ['estimatedWorkDays', 'dias_estimados', 1, 2, '1', '2'],
  ['assigneeEmail', 'responsable', null, 'a@b.com', '—', 'a@b.com'],
  ['assignedEmployeeId', 'responsable', 'id', null, 'id', '—'],
  ['status', 'estado', 'planned', 'in_progress', 'Planificada', 'En progreso'],
  ['status', 'estado', 'blocked', 'completed', 'Bloqueada', 'Completada'],
  ['status', 'estado', 'cancelled', 'unknown', 'Cancelada', 'unknown'],
  ['otro', 'otro', null, 0, '—', '0'],
])(
  'traduce el cambio de %s (%s)',
  async (field, label, from, to, before, after) => {
    const changes = { [field as string]: { from, to } };
    const { tools } = setup({
      story: { code: 'HU-7' },
      changes,
      updates: [{ code: 'HU-8', name: 'Otra', changes }],
    });
    const text = (
      await tools.actualizar_historia({ codigo: 'HU-7', puntos: 5 })
    ).content[0].text;
    expect(
      text.split('  ' + label + ': ' + before + ' → ' + after),
    ).toHaveLength(3);
  },
);
it('muestra valores ausentes como guion', async () => {
  const { tools } = setup({
    story: { code: 'HU-7' },
    changes: { description: { to: 'Detalle' } },
  });
  expect(
    (
      await tools.actualizar_historia({
        codigo: 'HU-7',
        descripcion: 'Detalle',
      })
    ).content[0].text,
  ).toContain('descripcion: — → Detalle');
});

it.each([403, 404])(
  'devuelve isError cuando InternalApi lanza ApiError %s',
  async (status) => {
    const api = new InternalApi('http://x/api', 't', {
      name: 'x-bluecore-mcp-internal',
      value: 'secret',
    });
    const message = 'Sin acceso al equipo';
    jest.spyOn(api, 'post').mockRejectedValue(new ApiError(status, message));
    expect(
      await createWriteTools(api, new PreviewCache(), 'a').cargar_historias(
        input,
      ),
    ).toEqual({ isError: true, content: [{ type: 'text', text: message }] });
  },
);

it('no permite confirmar la vista previa de otro usuario', async () => {
  const { api, fetchFn } = setup();
  const cache = new PreviewCache();
  const a = createWriteTools(api, cache, 'a');
  const b = createWriteTools(api, cache, 'b');
  await a.cargar_historias(input);
  expect(await b.cargar_historias({ ...input, confirmar: true })).toEqual({
    isError: true,
    content: [{ type: 'text', text: missing }],
  });
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(
    (await a.cargar_historias({ ...input, confirmar: true })).isError,
  ).toBeUndefined();
});
