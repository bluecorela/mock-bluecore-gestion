import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { OperacionesService } from '../operaciones/operaciones.service';

@Injectable()
export class EquiposService {
  constructor(
    private readonly firebaseClient: FirebaseClient,
    private readonly operacionesService: OperacionesService,
  ) { }

  async getDashboardData(equipoId: string) {
    const equipo = await this.firebaseClient.getEquipo(equipoId);
    if (!equipo) return null;

    const personal = await this.firebaseClient.getPersonalByEquipo(equipoId);
    const rolesPermitidos = ['Ingeniero de Software', 'Ingeniero de QA', 'Ingeniero QA'];
    const ingenierosActuales = (personal as any[])
      .filter(p => rolesPermitidos.some(rol => p.rol?.toLowerCase().includes(rol.toLowerCase())))
      .map(p => ({
        id: p.id,
        nombre: p.nombre,
        inicioReemplazoSprintId: p.inicioReemplazoSprintId || null,
        vacaciones: p.vacaciones ?? null,
      }));

    const historialData = await this.firebaseClient.getHistorialRotaciones();
    const rawSprints = await this.firebaseClient.getSprintsByEquipo(equipoId);

    // Mapear sprints al formato que espera OperacionesService y el Dashboard
    const sprints = await Promise.all((rawSprints as any[]).map(async (s) => {
      const integrantes = await this.firebaseClient.getIntegrantesBySprint(equipoId, s.id);
      return {
        id: s.id,
        fechaInicio: s.fecha_inicio?.toDate?.() ?? s.fecha_inicio ?? null,
        fechaFin: s.fecha_fin?.toDate?.() ?? s.fecha_fin ?? null,
        sprintsCerrado: s.sprint_cerrado === true ? true : (s.sprint_cerrado?.toDate?.() ?? s.sprint_cerrado ?? null),
        integrantes: integrantes
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
      let estado: 'Completado' | 'En proceso' = 'En proceso';
      if (index > 0) {
        estado = 'Completado';
      } else {
        // Para el más reciente, verificamos si todos los ingenieros esperados fueron evaluados
        const evaluados = s.integrantes.filter((i: any) => {
          if (i.calificacion === 'Arquitecto') return false;
          const persona = ingenierosActuales.find((p: any) => p.nombre === i.nombre);
          if (!persona) return false;
          // Lógica simplificada de vacaciones para el dashboard resumido
          if (persona.vacaciones) return false;
          return true;
        });

        const ingenierosValidos = ingenierosActuales.filter((p: any) => !p.vacaciones);
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
    let barChartData: { labels: string[], datasets: { data: number[] }[] } = {
      labels: [],
      datasets: [{ data: [] }]
    };
    let sprintGraficoId = null;

    for (const s of ordenados) {
      const evaluados = (s.integrantes as any[]).filter((i: any) => i.calificacion !== 'Arquitecto');
      // Si el sprint está cerrado o tiene evaluaciones, lo usamos para la gráfica de barras
      if (evaluados.length > 0) {
        barChartData = {
          labels: evaluados.map((i: any) => i.nombre),
          datasets: [{
            data: evaluados.map((i: any) => i.total_final)
          }]
        };
        sprintGraficoId = s.id;
        break;
      }
    }

    return {
      equipo: {
        id: (equipo as any).id,
        nombre: (equipo as any).nombre,
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

  async findAll(onlyWithEvaluations = false) {
    return this.firebaseClient.getEquipos(onlyWithEvaluations);
  }

  async getSprintsByEquipo(equipoId: string) {
    const sprints = await this.firebaseClient.getSprintsByEquipo(equipoId);
    return sprints.map((s: any) => ({
      id: s.id,
      nombre: s.id,
      fechaInicio: s.fecha_inicio?.toDate?.() ?? null,
      fechaFin: s.fecha_fin?.toDate?.() ?? null,
      sprintCerrado: s.sprint_cerrado ?? null,
    }));
  }
  async getIntegrantesBySprint(equipoId: string, sprintId: string) {
    return this.firebaseClient.getIntegrantesBySprint(equipoId, sprintId);
  }
  async getSprint(equipoId: string, sprintId: string) {
    return this.firebaseClient.getSprint(equipoId, sprintId);
  }

  async getEquipo(equipoId: string) {
    return this.firebaseClient.getEquipo(equipoId);
  }

  async getMetricas(equipoId: string, sprintId: string) {
    return this.firebaseClient.obtenerMetricas(equipoId, sprintId);
  }

  async create(createEquipoDto: CreateEquipoDto) {
    return this.firebaseClient.createEquipo(createEquipoDto.nombre);
  }

  async getSprintEvaluationStatus(equipoId: string, sprintId?: string) {
    return this.firebaseClient.getSprintEvaluationStatus(equipoId, sprintId);
  }

}
