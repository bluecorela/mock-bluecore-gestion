import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InternalApi } from './internal-api';
import { PreviewCache } from './preview-cache';
import {
  createWriteTools,
  writeSchemas,
  writeDescriptions,
} from './tools/write-tools';
import { createReadTools } from './tools/read-tools';
import {
  createUserTools,
  userSchemas,
  userDescriptions,
} from './tools/user-tools';

export function createServer(
  api: InternalApi,
  me: { role: string | null; supabaseUserId: string },
  cache: PreviewCache,
): McpServer {
  const server = new McpServer({
    name: 'bluecore-gestion-mcp',
    version: '0.1.0',
  });
  const tools = createReadTools(api);
  const writes = createWriteTools(api, cache, me.supabaseUserId);
  server.registerTool(
    'cargar_historias',
    {
      description: writeDescriptions.cargar_historias,
      inputSchema: writeSchemas.cargar_historias.shape,
    },
    writes.cargar_historias,
  );
  server.registerTool(
    'actualizar_historia',
    {
      description: writeDescriptions.actualizar_historia,
      inputSchema: writeSchemas.actualizar_historia.shape,
    },
    writes.actualizar_historia,
  );
  if (me.role === 'Admin' || me.role === 'Arquitecto') {
    server.registerTool(
      'crear_sprint',
      {
        description: writeDescriptions.crear_sprint,
        inputSchema: writeSchemas.crear_sprint.shape,
      },
      writes.crear_sprint,
    );
  }
  server.registerTool(
    'listar_equipos',
    {
      description: 'Lista tus equipos y los proyectos con asignación activa.',
      inputSchema: {},
    },
    tools.listar_equipos,
  );
  server.registerTool(
    'listar_sprints',
    {
      description: 'Lista los sprints de un equipo.',
      inputSchema: { equipo_id: z.guid() },
    },
    tools.listar_sprints,
  );
  server.registerTool(
    'listar_historias',
    {
      description:
        'Lista las historias de un sprint y el correo de sus responsables.',
      inputSchema: { equipo_id: z.guid(), sprint_id: z.guid() },
    },
    tools.listar_historias,
  );
  if (me.role === 'Admin') {
    const users = createUserTools(api, cache, me.supabaseUserId);
    server.registerTool(
      'crear_usuarios',
      {
        description: userDescriptions.crear_usuarios,
        inputSchema: userSchemas.crear_usuarios.shape,
      },
      users.crear_usuarios,
    );
    server.registerTool(
      'cambiar_rol',
      {
        description: userDescriptions.cambiar_rol,
        inputSchema: userSchemas.cambiar_rol.shape,
      },
      users.cambiar_rol,
    );
    server.registerTool(
      'mover_de_equipo',
      {
        description: userDescriptions.mover_de_equipo,
        inputSchema: userSchemas.mover_de_equipo.shape,
      },
      users.mover_de_equipo,
    );
    server.registerTool(
      'designar_lider',
      {
        description: userDescriptions.designar_lider,
        inputSchema: userSchemas.designar_lider.shape,
      },
      users.designar_lider,
    );
    server.registerTool(
      'listar_usuarios',
      {
        description: userDescriptions.listar_usuarios,
        inputSchema: userSchemas.listar_usuarios.shape,
      },
      users.listar_usuarios,
    );
  }
  return server;
}
