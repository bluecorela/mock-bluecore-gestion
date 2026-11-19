import { InternalApi } from '../internal-api';
import { PreviewCache, previewKey } from '../preview-cache';
import { createUserTools, userDescriptions, userSchemas } from './user-tools';

const id = '12345678-1234-4234-8234-123456789abc';
const usuarios = ['ana', 'bea', 'eva'].map((nombre) => ({
  nombre,
  correo: nombre + '@x.com',
  rol: 'Arquitecto' as const,
  equipo_id: id,
}));
const missing =
  'La vista previa venció o cambió; genera la vista previa de nuevo';
function setup() {
  const cache = new PreviewCache();
  const post = jest.fn().mockResolvedValue({
    rows: usuarios.map((input, i) => ({
      row: i + 1,
      input,
      action: 'crear',
      summary: input.nombre,
      errors: [],
      warnings: ['Aviso literal del servidor'],
      noop: false,
      confirmationToken: 'token-' + i,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    })),
    errors: 0,
  });
  const api = new InternalApi('http://unused', 'token', {
    name: 'x',
    value: 's',
  });
  jest.spyOn(api, 'post').mockImplementation(post);
  const get = jest.spyOn(api, 'get').mockResolvedValue([]);
  return { post, get, cache, tools: createUserTools(api, cache, 'admin') };
}
it('incluye avisos literales y errores sin exponer tokens', async () => {
  const { tools } = setup();
  const result = await tools.crear_usuarios({ usuarios });
  expect(result.content[0].text).toContain('Aviso literal del servidor');
  expect(result.content[0].text).toContain('Errores: 0');
  expect(result.content[0].text).not.toContain('token-');
});
it('no aplica ninguna fila si falta un token', async () => {
  const { tools, post, cache } = setup();
  await tools.crear_usuarios({ usuarios });
  cache.take(
    previewKey('admin', 'user_create', usuarios[1].correo, usuarios[1]),
  );
  post.mockClear();
  expect(
    (await tools.crear_usuarios({ usuarios, confirmar: true })).content[0].text,
  ).toBe(missing);
  expect(post).not.toHaveBeenCalled();
});
it('continúa tras un fallo y conserva el orden y los reintentos', async () => {
  const { tools, post } = setup();
  await tools.crear_usuarios({ usuarios });
  post
    .mockResolvedValueOnce({
      row: 1,
      correo: usuarios[0].correo,
      estado: 'creada',
    })
    .mockRejectedValueOnce(new Error('No disponible'))
    .mockResolvedValueOnce({
      row: 1,
      correo: usuarios[2].correo,
      estado: 'creada',
    });
  const text = (await tools.crear_usuarios({ usuarios, confirmar: true }))
    .content[0].text;
  const lines = text.split('\n');
  expect(lines[0]).toContain('1: ana@x.com: creada');
  expect(lines[1]).toContain('2: bea@x.com: falló: No disponible');
  expect(lines[2]).toContain('3: eva@x.com: creada');
  expect(lines[3]).toBe('Reintentar: bea@x.com');
});
it.each([
  { usuarios: [] },
  { usuarios: Array.from({ length: 11 }, () => usuarios[0]) },
  { usuarios: [{ ...usuarios[0], rol: 'Admin' }] },
  { usuarios: [{ ...usuarios[0], equipo_id: 'no-uuid' }] },
])('rechaza datos inválidos %j', (input) => {
  expect(userSchemas.crear_usuarios.safeParse(input).success).toBe(false);
});
it('busca usuarios con filtros codificados', async () => {
  const { tools, get } = setup();
  await tools.listar_usuarios({ texto: 'Ana & Bea', equipo_id: id });
  expect(get).toHaveBeenCalledWith(
    '/v2/admin/users?texto=Ana+%26+Bea&equipo_id=' + id,
  );
});

it.each(['cambiar_rol', 'mover_de_equipo', 'designar_lider'] as const)(
  '%s usa su ruta de vista previa y confirma con el token',
  async (name) => {
    const { tools, post } = setup();
    const row = {
      correo: usuarios[0].correo,
      rol: 'Arquitecto' as const,
      equipo_id: id,
      equipo_destino_id: id,
    };
    const paths = {
      cambiar_rol: '/v2/admin/users/role',
      mover_de_equipo: '/v2/admin/users/move',
      designar_lider: '/v2/admin/team-leaders',
    };
    post.mockResolvedValueOnce({
      errors: 0,
      rows: [
        {
          row: 1,
          action: 'mover',
          summary: 'Vista previa',
          errors: [],
          warnings: [],
          confirmationToken: 'firmado',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      ],
    });
    await tools[name](row);
    expect(post).toHaveBeenLastCalledWith(paths[name] + '/preview', row);
    post.mockResolvedValueOnce({
      row: 1,
      correo: row.correo,
      estado: 'aplicado',
    });
    await tools[name]({ ...row, confirmar: true });
    expect(post).toHaveBeenLastCalledWith(paths[name], {
      ...row,
      confirmationToken: 'firmado',
    });
    post.mockClear();
    expect(
      (await tools[name]({ ...row, confirmar: true })).content[0].text,
    ).toBe(missing);
    expect(post).not.toHaveBeenCalled();
  },
);
it('las filas omitidas y sin cambios no llaman a aplicación', async () => {
  const { tools, post } = setup();
  post.mockResolvedValueOnce({
    errors: 0,
    rows: usuarios.map((input, i) => ({
      row: i + 1,
      input,
      action: i === 0 ? 'omitir' : 'crear',
      noop: i === 0,
      summary: i === 0 ? 'Ya existe; se omite' : input.nombre,
      errors: [],
      warnings: [],
      confirmationToken: i === 0 ? null : 'token-' + i,
      expiresAt: i === 0 ? null : new Date(Date.now() + 60000).toISOString(),
    })),
  });
  await tools.crear_usuarios({ usuarios });
  post
    .mockClear()
    .mockResolvedValue({ row: 1, correo: 'x@x.com', estado: 'creada' });
  const result = await tools.crear_usuarios({ usuarios, confirmar: true });
  expect(result.content[0].text).toContain(
    '1: ana@x.com: omitida: Omitida según la vista previa',
  );
  expect(post).toHaveBeenCalledTimes(2);
});
it('una vista previa con errores invalida los tokens anteriores', async () => {
  const { tools, post } = setup();
  await tools.crear_usuarios({ usuarios });
  post.mockResolvedValueOnce({
    errors: 1,
    rows: usuarios.map((input, i) => ({
      row: i + 1,
      input,
      action: 'crear',
      summary: input.nombre,
      errors: ['Equipo inactivo'],
      warnings: [],
      confirmationToken: 'no-usar',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    })),
  });
  expect((await tools.crear_usuarios({ usuarios })).content[0].text).toContain(
    'Errores: 1',
  );
  post.mockClear();
  expect(
    (await tools.crear_usuarios({ usuarios, confirmar: true })).content[0].text,
  ).toBe(missing);
  expect(post).not.toHaveBeenCalled();
});
it.each(['vencida', 'cambiada', 'otro Admin'])(
  'bloquea una confirmación %s',
  async (kind) => {
    const { tools, post, cache } = setup();
    await tools.crear_usuarios({ usuarios });
    if (kind === 'vencida') {
      for (const row of usuarios)
        cache.remember(
          previewKey('admin', 'user_create', row.correo, row),
          'viejo',
          new Date(Date.now() - 1).toISOString(),
        );
    }
    post.mockClear();
    const changed =
      kind === 'cambiada'
        ? usuarios.map((row, i) => (i === 1 ? { ...row, nombre: 'Otro' } : row))
        : usuarios;
    const otherTools =
      kind === 'otro Admin'
        ? createUserTools(
            new InternalApi('http://unused', 't', { name: 'x', value: 's' }),
            cache,
            'otro',
          )
        : tools;
    expect(
      (await otherTools.crear_usuarios({ usuarios: changed, confirmar: true }))
        .content[0].text,
    ).toBe(missing);
    expect(post).not.toHaveBeenCalled();
  },
);
it('conserva los resultados parciales devueltos por la API', async () => {
  const { tools, post } = setup();
  await tools.crear_usuarios({ usuarios });
  for (const [i, row] of usuarios.entries())
    post.mockResolvedValueOnce({
      row: 1,
      correo: row.correo,
      estado: i === 1 ? 'falló' : 'creada',
      ...(i === 1 ? { detalle: 'Conflicto' } : {}),
    });
  const result = await tools.crear_usuarios({ usuarios, confirmar: true });
  expect(result.content[0].text.split('\n')).toEqual([
    '1: ana@x.com: creada',
    '2: bea@x.com: falló: Conflicto',
    '3: eva@x.com: creada',
    'Reintentar: bea@x.com',
  ]);
});
it('rechaza Admin y equipos inválidos en todas las operaciones', () => {
  expect(
    userSchemas.cambiar_rol.safeParse({ correo: 'a@x.com', rol: 'Admin' })
      .success,
  ).toBe(false);
  expect(
    userSchemas.designar_lider.safeParse({
      correo: 'a@x.com',
      rol: 'Ingeniero de QA',
      equipo_id: id,
    }).success,
  ).toBe(false);
  expect(
    userSchemas.designar_lider.safeParse({
      correo: 'a@x.com',
      rol: 'Arquitecto',
      equipo_id: 'no',
    }).success,
  ).toBe(false);
  expect(
    userSchemas.mover_de_equipo.safeParse({
      correo: 'a@x.com',
      equipo_destino_id: 'no',
    }).success,
  ).toBe(false);
  expect(
    userSchemas.mover_de_equipo.safeParse({
      correo: 'a@x.com',
      equipo_destino_id: id,
      equipo_origen_id: 'no',
    }).success,
  ).toBe(false);
});

it.each([
  [
    'creada, correo no enviado',
    'reenviar_correo',
    'Reenvía el correo desde la web',
    'designar_lider',
  ],
  [
    'aplicado, cargo de origen sin cerrar',
    'quitar_sm_origen',
    'Quita el SM del equipo de origen en Equipos',
    'Usa designar_lider',
  ],
  [
    'creada, designación fallida',
    'designar_lider',
    'Usa designar_lider',
    'Reenvía el correo',
  ],
  [
    'aplicado, designación fallida',
    'designar_lider',
    'Usa designar_lider',
    'Reenvía el correo',
  ],
])(
  'indica el pendiente correspondiente a %s',
  async (estado, pendiente, suggestion, unrelated) => {
    const { tools, post } = setup();
    await tools.crear_usuarios({ usuarios });
    post.mockResolvedValue({
      row: 1,
      correo: usuarios[0].correo,
      estado,
      pendientes: [pendiente],
    });
    const result = await tools.crear_usuarios({ usuarios, confirmar: true });
    const pending = result.content[0].text.split('Pendientes: ')[1];
    expect(pending).toContain(estado);
    expect(pending).toContain(suggestion);
    expect(pending).not.toContain(unrelated);
  },
);
it.each([false, undefined])(
  'distingue designar_como_lider %s del otro valor al confirmar',
  async (designation) => {
    const { tools, post } = setup();
    const rows = usuarios.map((row) =>
      designation === undefined
        ? row
        : { ...row, designar_como_lider: designation },
    );
    await tools.crear_usuarios({ usuarios: rows });
    const changed = usuarios.map((row) =>
      designation === undefined ? { ...row, designar_como_lider: false } : row,
    );
    post.mockClear();
    expect(
      (await tools.crear_usuarios({ usuarios: changed, confirmar: true }))
        .content[0].text,
    ).toBe(missing);
    expect(post).not.toHaveBeenCalled();
  },
);

it('designar acepta y valida el origen UUID', () => {
  const row = {
    correo: 'ana@x.com',
    equipo_id: id,
    rol: 'Scrum Master',
    equipo_origen_id: id,
  };
  expect(userSchemas.designar_lider.parse(row)).toHaveProperty(
    'equipo_origen_id',
    id,
  );
  expect(
    userSchemas.designar_lider.safeParse({ ...row, equipo_origen_id: 'no' })
      .success,
  ).toBe(false);
});

it.each([false, true])(
  'informa el cierre de SM pendiente tras designación fallida: %s',
  async (pendingSource) => {
    const { tools, post } = setup();
    const row = {
      correo: usuarios[0].correo,
      rol: 'Arquitecto' as const,
      equipo_id: id,
    };
    post.mockResolvedValueOnce({
      errors: 0,
      rows: [
        {
          row: 1,
          action: 'designar',
          summary: 'Mover y designar',
          errors: [],
          warnings: [],
          confirmationToken: 'firmado',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      ],
    });
    await tools.designar_lider(row);
    post.mockResolvedValueOnce({
      row: 1,
      correo: row.correo,
      estado: 'aplicado, designación fallida',
      // El texto del detalle no decide el pendiente; solo el campo pendientes.
      detalle: 'Movimiento aplicado, designación fallida: No disponible',
      pendientes: pendingSource
        ? ['designar_lider', 'quitar_sm_origen']
        : ['designar_lider'],
    });
    const result = await tools.designar_lider({ ...row, confirmar: true });
    const pending = result.content[0].text.split('Pendientes: ')[1];
    expect(pending).toContain('Usa designar_lider');
    expect(
      pending.includes('Quita el SM del equipo de origen en Equipos'),
    ).toBe(pendingSource);
  },
);
it('describe los equipos liderados en listar_usuarios', () => {
  expect(userDescriptions.listar_usuarios).toContain(
    'equipos que lidera (campo lidera)',
  );
});
it('no deduce pendientes del estado ni del detalle', async () => {
  const { tools, post } = setup();
  await tools.crear_usuarios({ usuarios });
  post.mockResolvedValue({
    row: 1,
    correo: usuarios[0].correo,
    estado: 'aplicado',
    detalle: 'El SM de A cambió durante la operación; no se modificó',
  });
  const result = await tools.crear_usuarios({ usuarios, confirmar: true });
  expect(result.content[0].text).not.toContain('Pendientes');
});
