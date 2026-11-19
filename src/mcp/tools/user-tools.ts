import { z } from 'zod';
import type { InternalApi } from '../internal-api';
import { PreviewCache, previewKey } from '../preview-cache';
import { normalizeEmail } from '../../user-admin/user-admin.planner';
import type {
  CreateRow,
  RoleRow,
  MoveRow,
  DesignateRow,
  PreviewResponse,
  RowResult,
  UserAdminOperation,
} from '../../user-admin/user-admin.types';

const rol = z.enum([
  'Arquitecto',
  'Scrum Master',
  'Ingeniero de Software',
  'Ingeniero de QA',
]);
const correo = z.string().trim().toLowerCase().pipe(z.email());
const confirmar = z.boolean().default(false);
const createRow = z.object({
  nombre: z.string().trim().min(1),
  correo,
  rol,
  equipo_id: z.guid(),
  designar_como_lider: z.boolean().optional(),
});
export const userSchemas = {
  crear_usuarios: z.object({
    usuarios: z.array(createRow).min(1).max(10),
    confirmar,
  }),
  cambiar_rol: z.object({ correo, rol, confirmar }),
  mover_de_equipo: z.object({
    correo,
    equipo_destino_id: z.guid(),
    equipo_origen_id: z.guid().optional(),
    designar_como_lider: z.boolean().optional(),
    confirmar,
  }),
  designar_lider: z.object({
    equipo_origen_id: z.guid().optional(),
    correo,
    equipo_id: z.guid(),
    rol: z.enum(['Arquitecto', 'Scrum Master']),
    confirmar,
  }),
  listar_usuarios: z.object({
    texto: z.string().optional(),
    equipo_id: z.guid().optional(),
  }),
};
const confirmation =
  'Primero llama con confirmar=false y muestra al usuario la vista previa completa. Espera a que responda "sí". Solo entonces llama de nuevo con confirmar=true y exactamente los mismos datos.';
const files =
  ' Si el Admin entrega un archivo o una tabla, interprétalo y llama con confirmar=false; nunca inventes correos, roles ni equipos: si falta un dato o es ambiguo, pregunta.';
const leaders =
  ' Antes de marcar designar_como_lider (o de llamar a designar_lider), pregunta por cada persona: «¿Quieres designar a <nombre> como <ARQUITECTO|SCRUM MASTER> de <equipo>?» y márcalo solo si responde que sí; nunca lo deduzcas del rol.';
export const userDescriptions = {
  crear_usuarios: confirmation + files + leaders + ' Crea de 1 a 10 usuarios.',
  cambiar_rol: confirmation + files + ' Cambia el rol de una persona.',
  mover_de_equipo:
    confirmation + files + leaders + ' Mueve una persona de equipo.',
  designar_lider:
    confirmation +
    files +
    leaders +
    ' Designa al líder; si no es integrante, también lo mueve al equipo y, si era SM del origen, deja de serlo.',
  listar_usuarios:
    'Busca usuarios por correo, nombre o equipo; devuelve nombre, correo, rol, equipos y los equipos que lidera (campo lidera).',
};

type Input = CreateRow | RoleRow | MoveRow | DesignateRow;
const textResult = (text: string, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: 'text' as const, text }],
});
const missing =
  'La vista previa venció o cambió; genera la vista previa de nuevo';
const suggestions: Record<
  NonNullable<RowResult['pendientes']>[number],
  string
> = {
  reenviar_correo: 'Reenvía el correo desde la web',
  designar_lider: 'Usa designar_lider',
  quitar_sm_origen: 'Quita el SM del equipo de origen en Equipos',
};

export function createUserTools(
  api: InternalApi,
  cache: PreviewCache,
  userId: string,
) {
  async function execute(
    op: UserAdminOperation,
    path: string,
    rows: Input[],
    confirmar: boolean,
  ) {
    const keys = rows.map((row) =>
      previewKey(userId, op, normalizeEmail(row.correo), row),
    );
    try {
      // En vista previa invalida las anteriores; en confirmación consume todas
      // antes de aplicar la primera fila.
      const tokens = keys.map((key) => cache.take(key));
      if (!confirmar) {
        const preview = await api.post<PreviewResponse>(
          path + '/preview',
          op === 'user_create' ? { usuarios: rows } : rows[0],
        );
        if (!preview.errors && preview.rows.length === rows.length) {
          preview.rows.forEach((row, i) => {
            if (row.confirmationToken && row.expiresAt)
              cache.remember(keys[i], row.confirmationToken, row.expiresAt);
            // Una fila omitida también necesita una vista previa vigente.
            else if (row.noop || row.action === 'omitir')
              cache.remember(
                keys[i],
                '',
                new Date(Date.now() + 600000).toISOString(),
              );
          });
        }
        return textResult(
          [
            ...preview.rows.map(
              (row) =>
                `${row.row}: ${row.action}: ${row.summary}` +
                (row.errors.length
                  ? '; Errores: ' + row.errors.join('; ')
                  : '') +
                (row.warnings.length
                  ? '; Avisos: ' + row.warnings.join('; ')
                  : ''),
            ),
            'Errores: ' + preview.errors,
          ].join('\n'),
        );
      }
      if (tokens.some((token) => token === null))
        return textResult(missing, true);
      const results: RowResult[] = [];
      for (const [i, row] of rows.entries()) {
        let result: RowResult;
        if (tokens[i] === '')
          result = {
            row: i + 1,
            correo: row.correo,
            estado: 'omitida',
            detalle: 'Omitida según la vista previa',
          };
        else {
          try {
            result = await api.post<RowResult>(path, {
              ...(op === 'user_create' ? { usuario: row } : row),
              confirmationToken: tokens[i],
            });
          } catch (error) {
            if (!(error instanceof Error)) throw error;
            result = {
              row: i + 1,
              correo: row.correo,
              estado: 'falló',
              detalle: error.message,
            };
          }
        }
        results.push({ ...result, row: i + 1 });
      }
      const retry = results
        .filter((row) => row.estado === 'falló')
        .map((row) => row.correo);
      const followup = results
        .filter((row) => row.pendientes?.length)
        .map(
          (row) =>
            `${row.correo}: ${row.estado}. ${row.pendientes!.map((p) => suggestions[p]).join('; ')}`,
        );
      return textResult(
        [
          ...results.map(
            (row) =>
              `${row.row}: ${row.correo}: ${row.estado}` +
              (row.detalle ? ': ' + row.detalle : ''),
          ),
          'Reintentar: ' + (retry.join(', ') || 'ninguno'),
          ...(followup.length
            ? ['Pendientes: ' + followup.join('; ') + '.']
            : []),
        ].join('\n'),
      );
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return textResult(error.message, true);
    }
  }
  return {
    crear_usuarios: ({
      usuarios,
      confirmar = false,
    }: z.input<typeof userSchemas.crear_usuarios>) =>
      execute('user_create', '/v2/admin/users', usuarios, confirmar),
    cambiar_rol: ({
      confirmar = false,
      ...row
    }: z.input<typeof userSchemas.cambiar_rol>) =>
      execute('user_role', '/v2/admin/users/role', [row], confirmar),
    mover_de_equipo: ({
      confirmar = false,
      ...row
    }: z.input<typeof userSchemas.mover_de_equipo>) =>
      execute('user_move', '/v2/admin/users/move', [row], confirmar),
    designar_lider: ({
      confirmar = false,
      ...row
    }: z.input<typeof userSchemas.designar_lider>) =>
      execute('leader_designate', '/v2/admin/team-leaders', [row], confirmar),
    listar_usuarios: async (
      query: z.input<typeof userSchemas.listar_usuarios>,
    ) => {
      try {
        const params = new URLSearchParams();
        if (query.texto !== undefined) params.set('texto', query.texto);
        if (query.equipo_id !== undefined)
          params.set('equipo_id', query.equipo_id);
        const suffix = params.size ? '?' + params.toString() : '';
        return textResult(
          JSON.stringify(await api.get('/v2/admin/users' + suffix), null, 2),
        );
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return textResult(error.message, true);
      }
    },
  };
}
