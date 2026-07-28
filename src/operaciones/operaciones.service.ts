import { Injectable } from '@nestjs/common';
import {
    DashboardSprint,
    HistorialRotacion,
    IngenieroActual,
    RendimientoResumen,
    TendenciaRendimiento,
} from '../supabase/interfaces/supabase-interface';

@Injectable()
export class OperacionesService {

    calcularRendimientoUltimoSprintCerrado(
        sprints: DashboardSprint[],
        historialData: HistorialRotacion[],
        ingenierosActuales: IngenieroActual[]
    ): RendimientoResumen | null {
        if (!sprints?.length) return null;

        const ordenados = [...sprints].sort((a, b) => {
            const numA = parseInt(a.id.replace('sprint-', ''), 10);
            const numB = parseInt(b.id.replace('sprint-', ''), 10);
            return numA - numB;
        });

        const total = ordenados.length;

        let sprintCerrado = ordenados[total - 1];

        if (!sprintCerrado.sprint_cerrado && total > 1) {
            sprintCerrado = ordenados[total - 2];
        }

        const integrantes = sprintCerrado.integrantes ?? [];

        const evaluados = integrantes.filter((data) => {
            if (data.calificacion === 'Arquitecto') return false;

            const persona = ingenierosActuales.find(p => p.nombre === data.nombre);
            if (!persona) return false;

            if (persona.inicioReemplazoSprintId) {
                const fechaIngreso = this.obtenerFechaIngresoDeHistorial(historialData, persona.id);
                const fechaCierreSprint = this.toDate(sprintCerrado.sprint_cerrado);
                if (fechaIngreso && fechaCierreSprint && fechaIngreso > fechaCierreSprint) {
                    return false;
                }
            }

            return true;
        });

        const promedio =
            evaluados.reduce(
                (acc: number, i) => acc + (i.total_final || 0),
                0
            ) / (evaluados.length || 1);

        const promedioFinal = Math.round(promedio * 100) / 100;


        return {
            sprintId: sprintCerrado.id,
            promedio: promedioFinal,
            estado: sprintCerrado.sprint_cerrado ? 'Completado' : 'En proceso',
            calificacion: this.calificar(promedioFinal),
            totalEvaluados: evaluados.length,
        };

    }

    private obtenerFechaIngresoDeHistorial(
        historialData: HistorialRotacion[],
        personaId: string
    ): Date | null {
        const historial = historialData.find(
            h =>
                h.personalId === personaId &&
                h.tipo === 'cubriendo-vacaciones' &&
                h.fecha
        );

        return historial?.fecha ? new Date(historial.fecha) : null;
    }

    private toDate(value: boolean | string | Date | null): Date | null {
        if (!value || typeof value === 'boolean') return null;

        return value instanceof Date ? value : new Date(value);
    }

    private calificar(promedio: number): string {
        if (promedio >= 90) return '🌟 Rendimiento excelente';
        if (promedio >= 75) return '👍 Buen rendimiento';
        if (promedio >= 60) return '⚠️ Rendimiento moderado';
        return '🔴 Bajo rendimiento';
    }

    calcularRendimientoSprints(
        sprints: DashboardSprint[],
        historialData: HistorialRotacion[],
        ingenierosActuales: IngenieroActual[]
    ): TendenciaRendimiento | null {
        if (!sprints?.length) return null;

        const ordenados = [...sprints].sort(
            (a, b) =>
                new Date(a.fechaInicio ?? 0).getTime() -
                new Date(b.fechaInicio ?? 0).getTime()
        );

        const ultimos = ordenados.slice(-8);

        const labels: string[] = [];
        const valores: number[] = [];
        for (const sprint of ultimos) {
            const integrantes = sprint.integrantes ?? [];
            const evaluados = integrantes.filter((data) => {
                if (data.calificacion === 'Arquitecto') return false;

                const persona = ingenierosActuales.find(p => p.nombre === data.nombre);
                if (!persona) return false;

                if (persona.inicioReemplazoSprintId) {
                    const fechaIngreso = this.obtenerFechaIngresoDeHistorial(historialData, persona.id);
                    const fechaCierreSprint = this.toDate(sprint.sprint_cerrado);
                    if (fechaIngreso && fechaCierreSprint && fechaIngreso > fechaCierreSprint) {
                        return false;
                    }
                }

                return true;
            });

            const promedio = evaluados.reduce(
                (acc: number, i) => acc + (i.total_final || 0),
                0
            ) / (evaluados.length || 1);


            labels.push(sprint.id);
            valores.push(Math.round(promedio * 100) / 100);
        }
        return {
            labels,
            valores,
        };

    }



}
