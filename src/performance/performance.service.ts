import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';
import { CreatePerformanceEvaluacionDto } from './dto/performance-evaluacion.dto';

@Injectable()
export class PerformanceService {
    constructor(private readonly firebaseClient: FirebaseClient) { }

    /**
     * Lee la configuración de preguntas y respuestas desde Firestore.
     * Colección: config_evaluaciones / Documento: performance
     *
     * Las preguntas en Firestore NO llevan número (ej: "¿Cómo evalúa...?").
     * El número se agrega aquí dinámicamente según el orden del array,
     * así si cambias el orden en Firestore los números se ajustan solos.
     */
    async getConfig() {
        const config = await this.firebaseClient.getPerformanceConfig();

        if (!config || !config.preguntas || !config.respuestas) {
            throw new NotFoundException(
                'No se encontró configuración de evaluación en Firestore. ' +
                'Ejecuta POST /performance/seed para cargar la configuración inicial.'
            );
        }

        const preguntas = (config.preguntas as any[]).map((p, index) => ({
            clave: p.clave,
            label: `${index + 1}. ${p.label}`
        }));

        return { preguntas, respuestas: config.respuestas };
    }

    // /**
    //  * Importa la configuración inicial de preguntas a Firestore.
    //  * Solo necesita ejecutarse una vez (o cuando se quiera resetear la config).
    //  */
    async seedConfig() {
        const preguntas = [
            { clave: 'conocimientoTecnico', label: '¿Cómo evalúa el conocimiento del colaborador en lenguajes de programación / base de datos?' },
            { clave: 'usoGit', label: '¿Cómo evalúa el conocimiento del colaborador en uso de sistemas de control de versiones (Git)?' },
            { clave: 'calidadCodigo', label: '¿Cómo evalúa la calidad del código desarrollado por el colaborador?' },
            { clave: 'agilMetodologia', label: '¿Cómo evalúa el conocimiento y aplicación de metodologías ágiles (Scrum) por parte del colaborador?' },
            { clave: 'colaboracionEquipo', label: '¿Cómo evalúa la colaboración y participación del colaborador en el equipo de trabajo?' },
            { clave: 'rapidezPrecision', label: '¿Cómo evalúas la rapidez y precisión del colaborador para ejecutar sus tareas y cumplir con los tiempos establecidos sin comprometer la calidad?' },
            { clave: 'resolucionProblemas', label: '¿Cómo evalúa la capacidad del colaborador para resolver problemas técnicos y tomar decisiones?' },
            { clave: 'atencionDetalle', label: '¿Cómo evalúa la atención al detalle del colaborador en sus tareas y su capacidad para seguir indicaciones con precisión?' },
            { clave: 'proactividad', label: '¿Cómo evalúas la capacidad del colaborador para identificar oportunidades, anticiparse a problemas y asumir responsabilidades adicionales sin necesidad de ser solicitado?' },
            { clave: 'autonomia', label: '¿Qué tan efectivo consideras que el colaborador trabaja de manera autónoma, comprendiendo claramente sus responsabilidades y ejecutándolas sin necesidad de instrucciones constantes?' },
            { clave: 'comunicacion', label: '¿Cómo evalúa la comunicación del colaborador con el equipo y los clientes?' },
            { clave: 'disponibilidadRemota', label: '¿Cómo evalúa la disponibilidad del colaborador para responder mensajes directos de manera instantánea durante su jornada de trabajo remoto?' },
            { clave: 'liderazgo', label: '¿Cómo evalúa el potencial de liderazgo del colaborador en el equipo?' }
        ];

        const respuestas = {
            conocimientoTecnico: [
                { valor: 7.7, descripcion: 'Alto (7.7 puntos)' },
                { valor: 5, descripcion: 'Medio (5 puntos)' },
                { valor: 2.5, descripcion: 'Bajo (2.5 puntos)' }
            ],
            usoGit: [
                { valor: 7.7, descripcion: 'Alto (7.7 puntos)' },
                { valor: 5, descripcion: 'Medio (5 puntos)' },
                { valor: 2.5, descripcion: 'Bajo (2.5 puntos)' }
            ],
            calidadCodigo: [
                { valor: 7.7, descripcion: 'Cumple con estándares y mejores prácticas (7.7 puntos)' },
                { valor: 5, descripcion: 'Requiere algunas mejoras (5 puntos)' },
                { valor: 2.5, descripcion: 'Necesita mejorar significativamente (2.5 puntos)' }
            ],
            agilMetodologia: [
                { valor: 7.7, descripcion: 'Alto (7.7 puntos)' },
                { valor: 5, descripcion: 'Medio (5 puntos)' },
                { valor: 2.5, descripcion: 'Bajo (2.5 puntos)' }
            ],
            colaboracionEquipo: [
                { valor: 7.7, descripcion: 'Alto (7.7 puntos)' },
                { valor: 5, descripcion: 'Medio (5 puntos)' },
                { valor: 2.5, descripcion: 'Bajo (2.5 puntos)' }
            ],
            rapidezPrecision: [
                { valor: 7.7, descripcion: '👌 Excelente: rapidez y precisión constantes (7.7 puntos)' },
                { valor: 5, descripcion: '👍 Bien: cumple tiempos con ocasionales mejoras (5 puntos)' },
                { valor: 2.5, descripcion: '😔 Necesita mejorar: errores frecuentes o demoras (2.5 puntos)' }
            ],
            resolucionProblemas: [
                { valor: 7.7, descripcion: 'Resuelve con rapidez y autonomía (7.7 puntos)' },
                { valor: 5, descripcion: 'Requiere apoyo en algunos casos (5 puntos)' },
                { valor: 2.5, descripcion: 'Dificultades frecuentes (2.5 puntos)' }
            ],
            atencionDetalle: [
                { valor: 7.7, descripcion: 'Excelente atención al detalle (7.7 puntos)' },
                { valor: 5, descripcion: 'Buena, con pequeños descuidos (5 puntos)' },
                { valor: 2.5, descripcion: 'Frecuentes omisiones (2.5 puntos)' }
            ],
            proactividad: [
                { valor: 7.7, descripcion: 'Identifica oportunidades y se adelanta (7.7 puntos)' },
                { valor: 5, descripcion: 'Actúa con iniciativa ocasionalmente (5 puntos)' },
                { valor: 2.5, descripcion: 'Actúa solo bajo instrucción (2.5 puntos)' }
            ],
            autonomia: [
                { valor: 7.7, descripcion: '👌 Excelente: Siempre comprende sus tareas y las realiza de manera autónoma (7.7 puntos)' },
                { valor: 5, descripcion: '👍 Bien: Generalmente entiende sus responsabilidades y las ejecuta con mínima orientación (5 puntos)' },
                { valor: 2.5, descripcion: '😔 Necesita mejorar: A menudo requiere que le indiquen qué debe hacer o cómo realizar sus tareas (2.5 puntos)' }
            ],
            comunicacion: [
                { valor: 7.7, descripcion: '👌 Excelente: El colaborador se comunica de manera clara y efectiva, liderando reuniones con seguridad y manteniendo un enfoque estructurado (7.7 puntos)' },
                { valor: 5, descripcion: '👍 Bien: El colaborador participa activamente en reuniones, aunque ocasionalmente necesita un poco más de seguridad al exponer sus ideas (5 puntos)' },
                { valor: 2.5, descripcion: '😔 Necesita mejorar: El colaborador muestra dificultad para expresarse en reuniones, ya sea por falta de claridad, inseguridad o poca iniciativa para compartir sus ideas (2.5 puntos)' }
            ],
            disponibilidadRemota: [
                { valor: 7.7, descripcion: '👌 Excelente: Responde de manera rápida y oportuna (7.7 puntos)' },
                { valor: 5, descripcion: '👍 Bien: Responde en un tiempo adecuado (5 puntos)' },
                { valor: 2.5, descripcion: '😔 Necesita mejorar: Responde con demoras ocasionales, su participación es limitada (2.5 puntos)' }
            ],
            liderazgo: [
                { valor: 7.7, descripcion: 'Alto potencial de liderazgo (7.7 puntos)' },
                { valor: 5, descripcion: 'En desarrollo, con oportunidades de mejora (5 puntos)' },
                { valor: 2.5, descripcion: 'No demuestra habilidades de liderazgo (2.5 puntos)' }
            ]
        };

        await this.firebaseClient.savePerformanceConfig({
            preguntas,
            respuestas,
            fechaActualizacion: new Date().toISOString()
        });

        return { ok: true, message: 'Configuración de performance importada a Firestore exitosamente' };
    }

    async save(data: CreatePerformanceEvaluacionDto) {
        return this.firebaseClient.savePerformanceEvaluacion(data);
    }

    async getHistorial(equipoId: string) {
        return this.firebaseClient.getPerformanceHistorial(equipoId);
    }

    async habilitarEvaluacion(equipoId: string, nombreAdmin: string) {
        return this.firebaseClient.habilitarPerformance(equipoId, nombreAdmin);
    }

    async getHabilitaciones(equipoId?: string) {
        return this.firebaseClient.getHabilitacionesPerformance(equipoId);
    }

    async getHabilitacionActiva(equipoId: string) {
        return this.firebaseClient.getHabilitacionActiva(equipoId);
    }
}
