export const ESTADOS = {
  Planificada: 'planned',
  'En progreso': 'in_progress',
  Bloqueada: 'blocked',
  Completada: 'completed',
} as const;

export const ESTADOS_INVERSOS: Readonly<Record<string, string>> = {
  planned: 'Planificada',
  in_progress: 'En progreso',
  blocked: 'Bloqueada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export interface Historia {
  codigo?: string;
  nombre?: string;
  descripcion?: string;
  puntos?: number;
  dias_estimados?: number;
  responsable?: string;
  estado?: keyof typeof ESTADOS;
}

export function aHistoriaApi(h: Historia) {
  return {
    ...(h.codigo === undefined ? {} : { code: h.codigo }),
    ...(h.nombre === undefined ? {} : { name: h.nombre }),
    ...(h.descripcion === undefined ? {} : { description: h.descripcion }),
    ...(h.puntos === undefined ? {} : { storyPoints: h.puntos }),
    ...(h.dias_estimados === undefined
      ? {}
      : { estimatedWorkDays: h.dias_estimados }),
    ...(h.responsable === undefined ? {} : { assigneeEmail: h.responsable }),
    ...(h.estado === undefined ? {} : { status: ESTADOS[h.estado] }),
  };
}

export interface HistoriaApi {
  code: string | null;
  name: string;
  storyPoints: number;
  status: string;
  assignedEmployeeId: string | null;
  addedAfterStart: boolean;
}

export function deHistoriaApi(
  s: HistoriaApi,
  emailPorId: Readonly<Record<string, string>>,
) {
  return {
    codigo: s.code,
    nombre: s.name,
    puntos: s.storyPoints,
    estado: ESTADOS_INVERSOS[s.status] ?? s.status,
    responsable: s.assignedEmployeeId
      ? (emailPorId[s.assignedEmployeeId] ?? null)
      : null,
    agregada_despues_de_iniciar: s.addedAfterStart,
  };
}
