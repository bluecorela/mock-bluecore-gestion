import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { OperacionesService } from '../operaciones/operaciones.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';
import {
  BarChartData,
  Equipo,
  DashboardIntegrante,
  DashboardSprint,
  EquipoDashboardData,
  EquipoSprintResponse,
  GuardarEvaluacionRequest,
  HistorialRotacion,
  IngenieroActual,
  ResumenIntegrante,
  Sprint,
  SprintEstado,
} from '../supabase/interfaces/supabase-interface';

@Injectable()
export class EquiposService {
  constructor(
    private readonly operacionesService: OperacionesService,
    private readonly supabaseDataService: SupabaseDataService,
  ) { }

  async getDashboardData(equipoId: string): Promise<EquipoDashboardData | null> {
    const equipo = await this.supabaseDataService.getEquipo(equipoId);
    if (!equipo) return null;

    const personal = await this.supabaseDataService.getPersonalByEquipo(equipoId);
    const rolesPermitidos = ['Ingeniero de Software', 'Ingeniero de QA', 'Ingeniero QA'];
    const ingenierosActuales: IngenieroActual[] = personal
      .filter((p) => rolesPermitidos.some((rol) => p.rol?.toLowerCase().includes(rol.toLowerCase())))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre ?? '',
        inicioReemplazoSprintId: p.inicio_reemplazo_sprint_id || null,
        vacaciones: p.vacaciones ?? null,
      }));

    const historialData = await this.supabaseDataService.getHistorialRotaciones() as HistorialRotacion[];
    const rawSprints = await this.supabaseDataService.getSprintsByEquipo(equipoId);

    // Mapear sprints al formato que espera OperacionesService y el Dashboard
    const sprints: DashboardSprint[] = await Promise.all(rawSprints.map(async (s) => {
      const integrantes = await this.supabaseDataService.getIntegrantesBySprint(equipoId, s.firebase_id);
      return {
        id: s.firebase_id,
        fechaInicio: s.fecha_inicio ?? null,
        fechaFin: s.fecha_fin ?? null,
        sprint_cerrado: s.sprint_cerrado ?? null,
        sprintsCerrado: s.sprint_cerrado ?? null,
        integrantes: integrantes.map((integrante): DashboardIntegrante => ({
          id: integrante.id,
          nombre: integrante.nombre ?? '',
          total1: integrante.total1,
          total2: integrante.total2,
          total3: integrante.total3,
          total_final: integrante.total_final,
          calificacion: integrante.calificacion,
          comentarios: integrante.comentarios,
        })),
      };
    }));

    // Ordenar sprints por fecha de inicio descendente
    const ordenados = [...sprints].sort((a, b) => {
      const dateA = a.fechaInicio ? new Date(a.fechaInicio).getTime() : 0;
      const dateB = b.fechaInicio ? new Date(b.fechaInicio).getTime() : 0;
      return dateB - dateA;
    });

    // Calcular estado de cada sprint (Completado/En proceso)
    // Lógica espejo del frontend
    const dashboardSprints = ordenados.map((s, index) => {
      let estado: SprintEstado = 'En proceso';
      if (index > 0) {
        estado = 'Completado';
      } else {
        // Para el más reciente, verificamos si todos los ingenieros esperados fueron evaluados
        const evaluados = s.integrantes.filter((i) => {
          if (i.calificacion === 'Arquitecto') return false;
          const persona = ingenierosActuales.find((p) => p.nombre === i.nombre);
          if (!persona) return false;
          // Lógica simplificada de vacaciones para el dashboard resumido
          if (persona.vacaciones) return false;
          return true;
        });

        const ingenierosValidos = ingenierosActuales.filter((p) => !p.vacaciones);
        estado = (evaluados.length >= ingenierosValidos.length && ingenierosValidos.length > 0) ? 'Completado' : 'En proceso';
      }

      return {
        ...s,
        estado
      };
    });

    // Calcular métricas usando OperacionesService
    // Nota: OperacionesService espera camelCase en los objetos de sprint
    const rendimientoUltimo = this.operacionesService.calcularRendimientoUltimoSprintCerrado(
      sprints,
      historialData,
      ingenierosActuales
    );

    const tendencia = this.operacionesService.calcularRendimientoSprints(
      sprints,
      historialData,
      ingenierosActuales
    );

    // Gráfico de barras del último sprint completado
    let barChartData: BarChartData = {
      labels: [],
      datasets: [{ data: [] }]
    };
    let sprintGraficoId: string | null = null;

    for (const s of ordenados) {
      const evaluados = s.integrantes.filter((i) => i.calificacion !== 'Arquitecto');
      // Si el sprint está cerrado o tiene evaluaciones, lo usamos para la gráfica de barras
      if (evaluados.length > 0) {
        barChartData = {
          labels: evaluados.map((i) => i.nombre),
          datasets: [{
            data: evaluados.map((i) => i.total_final ?? 0)
          }]
        };
        sprintGraficoId = s.id;
        break;
      }
    }

    return {
      equipo: {
        id: equipo.id,
        nombre: equipo.nombre,
      },
      stats: {
        totalMiembros: ingenierosActuales.length,
        totalSprints: dashboardSprints.filter(s => s.estado === 'Completado').length,
        promedioRendimiento: rendimientoUltimo?.promedio ?? 0,
        rendimientoCalificado: rendimientoUltimo?.calificacion ?? 'Sin datos',
      },
      sprints: dashboardSprints,
      charts: {
        barChart: barChartData,
        lineChart: tendencia,
        sprintGraficoId: sprintGraficoId
      }
    };
  }

  async findAll(onlyWithEvaluations = false): Promise<Equipo[]> {
    return this.supabaseDataService.getEquipos(onlyWithEvaluations);
  }

  async getSprintsByEquipo(equipoId: string): Promise<EquipoSprintResponse[]> {
    const sprints = await this.supabaseDataService.getSprintsByEquipo(equipoId);
    return sprints.map((s) => ({
      id: s.firebase_id,
      nombre: s.firebase_id,
      fechaInicio: s.fecha_inicio ?? null,
      fechaFin: s.fecha_fin ?? null,
      sprintCerrado: s.sprint_cerrado ?? null,
    }));
  }
  async getIntegrantesBySprint(equipoId: string, sprintId: string): Promise<ResumenIntegrante[]> {
    return this.supabaseDataService.getIntegrantesBySprintLegacy(equipoId, sprintId);
  }

  async getSprint(equipoId: string, sprintId: string) {
    const sprint = await this.supabaseDataService.getSprint(equipoId, sprintId);

    if (!sprint) return null;

    return {
      id: sprint.firebase_id,
      fecha_inicio: sprint.fecha_inicio,
      fecha_fin: sprint.fecha_fin,
      sprintCerrado: sprint.sprint_cerrado ?? null,
    };
  }

  async getEquipo(equipoId: string): Promise<Equipo | null> {
    return this.supabaseDataService.getEquipo(equipoId);
  }

  async getMetricas(equipoId: string, sprintId: string) {
    return this.supabaseDataService.obtenerMetricas(equipoId, sprintId);
  }

  async create(createEquipoDto: CreateEquipoDto) {
    return this.supabaseDataService.createEquipo(createEquipoDto.nombre);
  }

  async getSprintEvaluationStatus(equipoId: string, sprintId?: string) {
    return this.supabaseDataService.getSprintEvaluationStatus(equipoId, sprintId);
  }

  async guardarEvaluacion(data: Partial<GuardarEvaluacionRequest> | undefined) {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('El cuerpo de la evaluación es obligatorio');
    }

    const requiredFields: Array<keyof GuardarEvaluacionRequest> = [
      'equipoId',
      'sprintId',
      'fechaInicio',
      'fechaFin',
      'ingeniero',
      'metricas',
      'puntuacionFinal',
      'calificacionTexto',
      'evaluadorCorreo',
    ];
    const missingFields = requiredFields.filter((field) => data[field] === undefined || data[field] === null);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Faltan campos obligatorios para guardar la evaluación: ${missingFields.join(', ')}`,
      );
    }

    return this.supabaseDataService.guardarEvaluacion(data as GuardarEvaluacionRequest);
  }
}
