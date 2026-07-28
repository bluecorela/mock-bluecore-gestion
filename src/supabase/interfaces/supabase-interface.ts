export interface ResumenIntegrante {
  id?: string;
  nombre: string;
  total1: number;
  total2: number;
  total3: number;
  total_final: number;
  calificacion: string;
  comentarios?: string;
}

export interface Equipo {
  id: string;
  nombre: string;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface Personal {
  id: string;
  nombre: string | null;
  rol: string | null;
  correo: string | null;
  equipo_id: string | null;
  estatus: 'activo' | 'inactivo' | null;
  vacaciones: boolean | null;
  inicio_reemplazo_sprint_id: string | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface Sprint {
  id: string;
  firebase_id: string;
  equipo_id: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  sprint_cerrado: boolean | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface SprintIntegrante {
  id: string;
  firebase_id: string;
  sprint_id: string;
  equipo_id: string;
  nombre: string | null;
  tareas_asignadas: number | null;
  tareas_entregadas: number | null;
  tareas_devueltas: number | null;
  calidad_codigo: number | null;
  total1: number | null;
  total2: number | null;
  total3: number | null;
  total_final: number | null;
  calificacion: string | null;
  comentarios: string | null;
  evaluado_por: string | null;
  fecha_evaluacion: string | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface IngenieroActual {
  id: string;
  nombre: string;
  inicioReemplazoSprintId: string | null;
  vacaciones: boolean | null;
}

export interface DashboardIntegrante {
  id?: string;
  nombre: string;
  total1?: number | null;
  total2?: number | null;
  total3?: number | null;
  total_final: number | null;
  calificacion: string | null;
  comentarios?: string | null;
}

export interface DashboardSprint {
  id: string;
  fechaInicio: string | Date | null;
  fechaFin: string | Date | null;
  sprint_cerrado: boolean | string | Date | null;
  sprintsCerrado: boolean | string | Date | null;
  integrantes: DashboardIntegrante[];
}

export type SprintEstado = 'Completado' | 'En proceso';

export interface DashboardSprintConEstado extends DashboardSprint {
  estado: SprintEstado;
}

export interface BarChartData {
  labels: string[];
  datasets: Array<{ data: number[] }>;
}

export interface RendimientoResumen {
  sprintId: string;
  promedio: number;
  estado: SprintEstado;
  calificacion: string;
  totalEvaluados: number;
}

export interface TendenciaRendimiento {
  labels: string[];
  valores: number[];
}

export interface EquipoDashboardData {
  equipo: Pick<Equipo, 'id' | 'nombre'>;
  stats: {
    totalMiembros: number;
    totalSprints: number;
    promedioRendimiento: number;
    rendimientoCalificado: string;
  };
  sprints: DashboardSprintConEstado[];
  charts: {
    barChart: BarChartData;
    lineChart: TendenciaRendimiento | null;
    sprintGraficoId: string | null;
  };
}

export interface HistorialRotacion {
  id?: string;
  personalId?: string;
  tipo?: string;
  fecha?: string | Date;
}

export interface EquipoSprintResponse {
  id: string;
  nombre: string;
  fechaInicio: string | Date | null;
  fechaFin: string | Date | null;
  sprintCerrado: boolean | null;
}

export interface GuardarEvaluacionRequest {
  equipoId: string;
  sprintId: string;
  fechaInicio: string;
  fechaFin: string;
  ingeniero: string;
  metricas: Record<string, number>;
  puntuacionFinal: number;
  calificacionTexto: string;
  comentarios?: string;
  evaluadorCorreo: string;
}

export interface CreatePersonalData {
  nombre: string;
  rol: string;
  correo?: string;
  equipoId?: string;
  estatus?: 'activo' | 'inactivo';
}

export interface UpdatePersonalData {
  nombre?: string;
  rol?: string;
  correo?: string | null;
  equipoId?: string | null;
  estatus?: 'activo' | 'inactivo';
}

export interface HistorialRotacionRow {
  id: string;
  fecha: string | null;
  tipo: string | null;
  nombre: string | null;
  personal_id: string | null;
  desde: string | null;
  desde_nombre: string | null;
  hacia: string | null;
  hacia_nombre: string | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface ModuloSidebar {
  id: string;
  nombre: string | null;
  ruta: string | null;
  icon: string | null;
  orden: number | null;
  visible: boolean | null;
  roles_permitidos: string[] | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface MaintenanceStatus {
  active: boolean;
}
