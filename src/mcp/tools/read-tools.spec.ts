import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InternalApi, ApiError } from '../internal-api';
import { createReadTools } from './read-tools';

it('traduce historias y resuelve el responsable por employees del equipo', async () => {
  const fetchFn = jest.fn().mockImplementation((url: string) =>
    Promise.resolve(
      Response.json(
        url.endsWith('/organization')
          ? { leaders: { architect: null, scrumMaster: null }, assignments: [] }
          : url.includes('/employees?')
            ? [{ id: 'e', email: 'dev@bluecore.co' }]
            : [
                {
                  code: 'HU-1',
                  name: 'Una HU',
                  storyPoints: 3,
                  status: 'in_progress',
                  assignedEmployeeId: 'e',
                  addedAfterStart: true,
                },
                {
                  code: 'HU-2',
                  name: 'Otra',
                  storyPoints: 0,
                  status: 'planned',
                  assignedEmployeeId: 'ausente',
                  addedAfterStart: false,
                },
              ],
      ),
    ),
  );
  const tools = createReadTools(
    new InternalApi(
      'http://x/api',
      't',
      { name: 'x-bluecore-mcp-internal', value: 'secret' },
      fetchFn,
    ),
  );
  const result = await tools.listar_historias({
    equipo_id: 't',
    sprint_id: 's',
  });
  expect(JSON.parse(result.content[0].text)).toEqual([
    {
      codigo: 'HU-1',
      nombre: 'Una HU',
      puntos: 3,
      estado: 'En progreso',
      responsable: 'dev@bluecore.co',
      agregada_despues_de_iniciar: true,
    },
    {
      codigo: 'HU-2',
      nombre: 'Otra',
      puntos: 0,
      estado: 'Planificada',
      responsable: null,
      agregada_despues_de_iniciar: false,
    },
  ]);
});

it('solo devuelve proyectos de asignaciones sin fecha de fin', async () => {
  const fetchFn = jest.fn().mockImplementation((url: string) =>
    Promise.resolve(
      Response.json(
        url.endsWith('/teams')
          ? [{ id: 't', name: 'Equipo' }]
          : {
              assignments: [
                { endedAt: null, project: { id: 'p', name: 'Activo' } },
                {
                  endedAt: '2099-01-01',
                  project: { id: 'q', name: 'Con fin' },
                },
              ],
            },
      ),
    ),
  );
  const api = new InternalApi(
    'http://x/api',
    't',
    { name: 'x-bluecore-mcp-internal', value: 'secret' },
    fetchFn,
  );
  expect(
    JSON.parse((await createReadTools(api).listar_equipos()).content[0].text),
  ).toEqual([
    { id: 't', nombre: 'Equipo', proyectos: [{ id: 'p', nombre: 'Activo' }] },
  ]);
});

it('devuelve isError con el mensaje 403 del back', async () => {
  const message = 'Todavía no disponible, estamos trabajando :D';
  const api = new InternalApi(
    'http://x/api',
    't',
    { name: 'x-bluecore-mcp-internal', value: 'secret' },
    jest.fn().mockResolvedValue(Response.json({ message }, { status: 403 })),
  );
  expect(await createReadTools(api).listar_equipos()).toEqual({
    isError: true,
    content: [{ type: 'text', text: message }],
  });
});

it('registra las tres lecturas con el SDK y valida schemas Zod 4', async () => {
  const api = new InternalApi(
    'http://x/api',
    't',
    { name: 'x-bluecore-mcp-internal', value: 'secret' },
    jest.fn().mockImplementation(() => Promise.resolve(Response.json([]))),
  );
  const server = new McpServer({ name: 'test', version: '1' });
  const reads = createReadTools(api);
  server.registerTool(
    'listar_equipos',
    { inputSchema: {} },
    reads.listar_equipos,
  );
  server.registerTool(
    'listar_sprints',
    { inputSchema: { equipo_id: z.guid() } },
    reads.listar_sprints,
  );
  server.registerTool(
    'listar_historias',
    { inputSchema: { equipo_id: z.guid(), sprint_id: z.guid() } },
    reads.listar_historias,
  );
  const client = new Client({ name: 'prueba', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'listar_equipos',
        'listar_sprints',
        'listar_historias',
      ]),
    );
    const result = await client.callTool({
      name: 'listar_sprints',
      arguments: { equipo_id: '11111111-1111-1111-1111-111111111111' },
    });
    expect(result.content).toEqual([{ type: 'text', text: '[]' }]);
    const invalid = await client.callTool({
      name: 'listar_sprints',
      arguments: { equipo_id: 'inválido' },
    });
    expect(invalid.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});

it.each(['architect', 'scrumMaster'])(
  'resuelve el correo del líder %s ausente de employees',
  async (role) => {
    const fetchFn = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/organization')) {
        return Response.json({
          leaders: {
            architect: null,
            scrumMaster: null,
            [role]: { id: 'lider', email: 'lider@bluecore.co' },
          },
          assignments: [],
        });
      }
      if (url.includes('/employees?')) return Response.json([]);
      return Response.json([
        {
          code: 'HU-1',
          name: 'Historia',
          status: 'planned',
          storyPoints: 1,
          assignedEmployeeId: 'lider',
        },
      ]);
    });
    const tools = createReadTools(
      new InternalApi(
        'http://x/api',
        't',
        { name: 'x-bluecore-mcp-internal', value: 'secret' },
        fetchFn,
      ),
    );
    const result = await tools.listar_historias({
      equipo_id: 't',
      sprint_id: 's',
    });
    expect(JSON.parse(result.content[0].text)[0].responsable).toBe(
      'lider@bluecore.co',
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'http://x/api/v2/teams/t/organization',
      expect.anything(),
    );
  },
);

it('conserva los equipos cuya organización falla con ApiError', async () => {
  const fetchFn = jest.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/teams'))
      return Response.json([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]);
    if (url.includes('/a/'))
      return Response.json({ message: 'Sin acceso' }, { status: 403 });
    return Response.json({
      assignments: [{ endedAt: null, project: { id: 'p', name: 'Proyecto' } }],
    });
  });
  const result = await createReadTools(
    new InternalApi(
      'http://x/api',
      't',
      { name: 'x-bluecore-mcp-internal', value: 'secret' },
      fetchFn,
    ),
  ).listar_equipos();
  expect(JSON.parse(result.content[0].text)).toEqual([
    { id: 'a', nombre: 'A', proyectos: [] },
    { id: 'b', nombre: 'B', proyectos: [{ id: 'p', nombre: 'Proyecto' }] },
  ]);
});

it.each([false, true])(
  'devuelve isError si fetch falla (organización: %s)',
  async (organization) => {
    const fetchFn = jest.fn().mockImplementation(async (url: string) => {
      if (organization && url.endsWith('/teams'))
        return Response.json([{ id: 't', name: 'Equipo' }]);
      throw new TypeError('fetch failed');
    });
    expect(
      await createReadTools(
        new InternalApi(
          'http://x/api',
          't',
          { name: 'x-bluecore-mcp-internal', value: 'secret' },
          fetchFn,
        ),
      ).listar_equipos(),
    ).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'fetch failed' }],
    });
  },
);

it.each([403, 404])(
  'devuelve isError cuando InternalApi lanza ApiError %s',
  async (status) => {
    const api = new InternalApi('http://x/api', 't', {
      name: 'x-bluecore-mcp-internal',
      value: 'secret',
    });
    const message = 'Sin acceso al equipo';
    jest.spyOn(api, 'get').mockRejectedValue(new ApiError(status, message));
    expect(
      await createReadTools(api).listar_sprints({ equipo_id: 't' }),
    ).toEqual({ isError: true, content: [{ type: 'text', text: message }] });
  },
);
