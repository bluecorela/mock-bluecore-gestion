import { z } from 'zod';
import type { InternalApi } from '../internal-api';
import { aHistoriaApi, ESTADOS_INVERSOS } from '../labels';
import { PreviewCache, previewKey } from '../preview-cache';

export const CONFIRMATION_INSTRUCTIONS =
  'Primero llama con confirmar=false y muestra al usuario la vista previa completa. Espera a que responda "sí". Solo entonces llama de nuevo con confirmar=true y exactamente los mismos datos. El usuario siempre indica el sprint destino: si no lo indicó, pregúntale; nunca asumas el sprint actual.';
const fields = {
  nombre: z.string(),
  descripcion: z
    .string()
    .max(5000, 'La descripción no puede superar los 5000 caracteres')
    .optional(),
  puntos: z.number().min(0),
  dias_estimados: z.number().min(0).optional(),
  responsable: z.email().optional(),
  estado: z
    .enum(['Planificada', 'En progreso', 'Bloqueada', 'Completada'])
    .optional(),
};
const stories = z
  .array(z.object({ codigo: z.string().optional(), ...fields }))
  .min(1)
  .max(200);
const confirmar = z.boolean().default(false);
export const writeSchemas = {
  cargar_historias: z.object({
    equipo_id: z.guid(),
    sprint_id: z.guid(),
    historias: stories,
    confirmar,
  }),
  crear_sprint: z.object({
    equipo_id: z.guid(),
    proyecto_id: z.guid(),
    fecha_inicio: z.iso.date(),
    fecha_fin: z.iso.date(),
    objetivo: z.string().optional(),
    historias: stories.optional(),
    confirmar,
  }),
  actualizar_historia: z.object({
    codigo: z.string().trim().min(1),
    ...fields,
    nombre: fields.nombre.optional(),
    puntos: fields.puntos.optional(),
    confirmar,
  }),
};
export const writeDescriptions = {
  cargar_historias:
    CONFIRMATION_INSTRUCTIONS + ' Carga historias en un sprint existente.',
  crear_sprint:
    CONFIRMATION_INSTRUCTIONS +
    ' Crea un sprint con historias opcionales. Si el sprint ya existe, no lo crees: usa listar_sprints y cargar_historias.',
  actualizar_historia:
    CONFIRMATION_INSTRUCTIONS + ' Actualiza una historia por su código.',
};

type Changes = Record<string, { from: unknown; to: unknown }>;
interface Preview {
  creates?: { row: number; code: string | null; name: string }[];
  updates?: { row: number; code: string; name: string; changes: Changes }[];
  errors: (string | { row: number; code?: string; message: string })[];
  confirmationToken: string | null;
  expiresAt: string | null;
  sprint?: {
    projectId: string;
    startDate: string;
    endDate: string;
    objective?: string;
    architect: { id: string; name: string };
    scrumMaster: { id: string; name: string } | null;
  };
  story?: {
    code: string;
    sprintId: string;
    sprintName: string;
    teamId: string;
    teamName: string;
  };
  changes?: Changes;
}
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'nombre',
  description: 'descripcion',
  storyPoints: 'puntos',
  estimatedWorkDays: 'dias_estimados',
  assigneeEmail: 'responsable',
  assignedEmployeeId: 'responsable',
  status: 'estado',
};
const display = (value: unknown, field: string) => {
  if (value == null) return '—';
  if (typeof value === 'string')
    return field === 'status' ? (ESTADOS_INVERSOS[value] ?? value) : value;
  return JSON.stringify(value) ?? '—';
};
const changesText = (changes: Changes) =>
  Object.entries(changes)
    .map(
      ([field, change]) =>
        '  ' +
        (FIELD_LABELS[field] ?? field) +
        ': ' +
        display(change.from, field) +
        ' → ' +
        display(change.to, field),
    )
    .join('\n');
function summary(p: Preview): string {
  const lines: string[] = [];
  if (p.sprint) {
    const s = p.sprint;
    lines.push(
      'Sprint: proyecto ' + s.projectId,
      'Fechas: ' + s.startDate + ' → ' + s.endDate,
      'Objetivo: ' + (s.objective ?? '—'),
      'Arquitecto: ' + s.architect.name + ' (' + s.architect.id + ')',
      'SM: ' +
        (s.scrumMaster
          ? s.scrumMaster.name + ' (' + s.scrumMaster.id + ')'
          : 'Sin asignar'),
    );
  }
  if (p.story)
    lines.push(
      'Historia: ' + p.story.code,
      'Sprint: ' + p.story.sprintName + ' (' + p.story.sprintId + ')',
      'Equipo: ' + p.story.teamName + ' (' + p.story.teamId + ')',
    );
  lines.push('Se crearán ' + (p.creates?.length ?? 0));
  for (const row of p.creates ?? [])
    lines.push((row.code ?? '(nueva)') + ': ' + row.name);
  const hasChanges = Object.keys(p.changes ?? {}).length > 0;
  lines.push(
    'Se actualizarán ' +
      (p.story
        ? p.errors.length === 0 && hasChanges
          ? 1
          : 0
        : (p.updates?.length ?? 0)),
  );
  if (p.story && !hasChanges && p.errors.length === 0)
    lines.push('Sin cambios: la historia ya tiene esos valores');
  for (const row of p.updates ?? [])
    lines.push(row.code + ': ' + row.name, changesText(row.changes));
  if (p.changes) lines.push(changesText(p.changes));
  lines.push('Errores: ' + p.errors.length);
  for (const error of p.errors)
    lines.push(
      typeof error === 'string'
        ? error
        : 'Fila ' +
            error.row +
            (error.code ? ' (' + error.code + ')' : '') +
            ': ' +
            error.message,
    );
  return lines.join('\n');
}

export function createWriteTools(
  api: InternalApi,
  cache: PreviewCache,
  userId: string,
) {
  async function execute({
    operation,
    target,
    content,
    body,
    path,
    confirmar,
    method,
    unsigned,
  }: {
    operation: string;
    target: string;
    content: unknown;
    body: Record<string, unknown>;
    path: string;
    confirmar: boolean;
    method: 'POST' | 'PATCH';
    unsigned: boolean;
  }) {
    try {
      const key = previewKey(userId, operation, target, content);
      if (confirmar) {
        const token = cache.take(key);
        if (token === null)
          throw new Error(
            'Primero genera la vista previa (confirmar=false) con estos mismos datos',
          );
        const payload = {
          ...body,
          ...(unsigned ? {} : { confirmationToken: token }),
        };
        const response =
          method === 'PATCH'
            ? await api.patch(path, payload)
            : await api.post(path, payload);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(response, null, 2) },
          ],
        };
      }
      // Una nueva vista previa invalida cualquier autorización anterior de estos datos.
      cache.take(key);
      const preview = await api.post<Preview>(path + '/preview', body);
      let ending =
        'No se guardó confirmación: la vista previa no incluye un token válido.';
      if (preview.errors.length)
        ending = 'No se guardó confirmación porque hay errores.';
      else if (unsigned || (preview.confirmationToken && preview.expiresAt)) {
        cache.remember(
          key,
          unsigned ? '' : preview.confirmationToken!,
          unsigned
            ? new Date(Date.now() + 600000).toISOString()
            : preview.expiresAt!,
        );
        ending =
          'Se espera la confirmación del usuario ("sí") para aplicar esta vista previa.';
      }
      return {
        content: [
          { type: 'text' as const, text: summary(preview) + '\n' + ending },
        ],
      };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return {
        isError: true,
        content: [{ type: 'text' as const, text: error.message }],
      };
    }
  }
  return {
    cargar_historias: ({
      equipo_id,
      sprint_id,
      historias,
      confirmar = false,
    }: z.input<typeof writeSchemas.cargar_historias>) =>
      execute({
        operation: 'cargar_historias',
        target: equipo_id + '/' + sprint_id,
        content: { historias },
        body: { stories: historias.map(aHistoriaApi) },
        path:
          '/v2/teams/' +
          encodeURIComponent(equipo_id) +
          '/sprints/' +
          encodeURIComponent(sprint_id) +
          '/stories/bulk',
        confirmar,
        method: 'POST',
        unsigned: false,
      }),
    crear_sprint: ({
      equipo_id,
      confirmar = false,
      ...data
    }: z.input<typeof writeSchemas.crear_sprint>) =>
      execute({
        operation: 'crear_sprint',
        target: equipo_id,
        content: data,
        body: {
          projectId: data.proyecto_id,
          startDate: data.fecha_inicio,
          endDate: data.fecha_fin,
          ...(data.objetivo === undefined ? {} : { objective: data.objetivo }),
          ...(data.historias === undefined
            ? {}
            : { stories: data.historias.map(aHistoriaApi) }),
        },
        path: '/v2/teams/' + encodeURIComponent(equipo_id) + '/sprints',
        confirmar,
        method: 'POST',
        unsigned: data.historias === undefined,
      }),
    actualizar_historia: async ({
      codigo,
      confirmar = false,
      ...data
    }: z.input<typeof writeSchemas.actualizar_historia>) => {
      if (!Object.values(data).some((value) => value !== undefined))
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'Indica al menos un campo a cambiar',
            },
          ],
        };
      const code = codigo.trim().toUpperCase();
      return execute({
        operation: 'actualizar_historia',
        target: code,
        content: data,
        body: aHistoriaApi(data),
        path: '/v2/stories/by-code/' + encodeURIComponent(code),
        confirmar,
        method: 'PATCH',
        unsigned: false,
      });
    },
  };
}
