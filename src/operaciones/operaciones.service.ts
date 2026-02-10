import { Injectable } from '@nestjs/common';

@Injectable()
export class OperacionesService {

    calcularRendimientoUltimoSprintCerrado(
        sprints: any[],
        historialData: any[],
        ingenierosActuales: any[]
    ) {
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

        const evaluados = integrantes.filter((data: any) => {
            if (data.calificacion === 'Arquitecto') return false;

            const persona = ingenierosActuales.find(p => p.nombre === data.nombre);
            console.log('persona encontrada:', persona);
            if (!persona) return false;

            if (persona.inicioReemplazoSprintId) {
                const fechaIngreso = this.obtenerFechaIngresoDeHistorial(historialData, persona.id);
                if (fechaIngreso && sprintCerrado.sprint_cerrado && fechaIngreso > sprintCerrado.sprint_cerrado) {
                    return false;
                }
            }

            return true;
        });

        const promedio =
            evaluados.reduce(
                (acc: number, i: any) => acc + (i.total_final || 0),
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
        historialData: any[],
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

    private calificar(promedio: number): string {
        if (promedio >= 90) return '🌟 Rendimiento excelente';
        if (promedio >= 75) return '👍 Buen rendimiento';
        if (promedio >= 60) return '⚠️ Rendimiento moderado';
        return '🔴 Bajo rendimiento';
    }

    calcularRendimientoSprints(
        sprints: any[],
        historialData: any[],
        ingenierosActuales: any[]
    ) {
        if (!sprints?.length) return null;

        const ordenados = [...sprints].sort(
            (a, b) =>
                new Date(a.fechaInicio ?? 0).getTime() -
                new Date(b.fechaInicio ?? 0).getTime()
        );

        const ultimos = ordenados.slice(-8).reverse();

        const labels: string[] = [];
        const valores: number[] = [];
        for (const sprint of ultimos) {
            const integrantes = sprint.integrantes ?? [];
            const evaluados = integrantes.filter((data: any) => {
                if (data.calificacion === 'Arquitecto') return false;

                const persona = ingenierosActuales.find(p => p.nombre === data.nombre);
                if (!persona) return false;

                if (persona.inicioReemplazoSprintId) {
                    const fechaIngreso = this.obtenerFechaIngresoDeHistorial(historialData, persona.id);
                    if (fechaIngreso && sprint.sprint_cerrado && fechaIngreso > sprint.sprint_cerrado) {
                        return false;
                    }
                }

                return true;
            });

            const promedio = evaluados.reduce(
                (acc: number, i: any) => acc + (i.total_final || 0),
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

