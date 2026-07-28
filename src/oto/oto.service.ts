import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOtoEvaluacionDto } from './dto/create-oto-evaluacion.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class OtoService {
    constructor(private readonly supabaseDataService: SupabaseDataService) { }

    /**
     * Lee la configuración de secciones/preguntas desde Supabase.
     * Tabla: config_evaluaciones / id: one-to-one
     * Lanza NotFoundException si no existe — ejecutar POST /oto/seed primero.
     */
    async getConfig() {
        const config = await this.supabaseDataService.getOtoConfig();

        if (!config || !config.secciones) {
            throw new NotFoundException(
                'No se encontró configuración de one-to-one en Supabase. ' +
                'Ejecuta POST /oto/seed para cargar la configuración inicial.'
            );
        }

        return { secciones: config.secciones };
    }

    /**
     * Importa la configuración inicial de preguntas a Supabase.
     * Solo necesita ejecutarse una vez.
     */
    async seedConfig() {
        const secciones = [
            {
                id: 'preguntasReflexion',
                nombre: 'Preguntas de Reflexión',
                tipo: 'texto_libre',
                preguntas: [
                    { clave: 'cargaTrabajo', label: '¿Cómo te sientes con tu carga de trabajo?' },
                    { clave: 'apoyoLider', label: '¿Hay algo que pueda hacer para apoyarte mejor?' },
                    { clave: 'retosRol', label: '¿Qué retos estás enfrentando en tu rol?' },
                    { clave: 'procesosEquipo', label: '¿Cómo podemos mejorar los procesos o las dinámicas del equipo?' },
                    { clave: 'feedbackLider', label: '¿Tienes algún feedback para mí como líder?' },
                ],
            },
            {
                id: 'habilidadesBlandas',
                nombre: 'Habilidades Blandas',
                tipo: 'calificacion_con_opciones',
                preguntas: [
                    {
                        clave: 'trabajoEquipo',
                        label: 'Trabajo en equipo',
                        opciones: [
                            { valor: 1, descripcion: 'No colabora en equipo.' },
                            { valor: 2, descripcion: 'Aporta e interactúa cuando es necesario.' },
                            { valor: 3, descripcion: 'Es muy participativo y fomenta la cooperación.' },
                        ],
                    },
                    {
                        clave: 'comunicacionEfectiva',
                        label: 'Comunicación efectiva',
                        opciones: [
                            { valor: 1, descripcion: 'No se comunica con claridad.' },
                            { valor: 2, descripcion: 'Expresa sus ideas, pero con fallas ocasionales.' },
                            { valor: 3, descripcion: 'Se comunica claramente y escucha activamente.' },
                        ],
                    },
                    {
                        clave: 'proactividad',
                        label: 'Proactividad',
                        opciones: [
                            { valor: 1, descripcion: 'Espera instrucciones para actuar.' },
                            { valor: 2, descripcion: 'Toma iniciativa ocasionalmente.' },
                            { valor: 3, descripcion: 'Busca oportunidades y actúa sin esperar.' },
                        ],
                    },
                    {
                        clave: 'resolucionProblemas',
                        label: 'Resolución de problemas',
                        opciones: [
                            { valor: 1, descripcion: 'Tiene dificultades para encontrar soluciones.' },
                            { valor: 2, descripcion: 'Resuelve problemas con ayuda o tiempo extra.' },
                            { valor: 3, descripcion: 'Encuentra soluciones rápidas y efectivas.' },
                        ],
                    },
                    {
                        clave: 'capacidadAprendizaje',
                        label: 'Capacidad de aprendizaje',
                        opciones: [
                            { valor: 1, descripcion: 'Le cuesta aprender y adaptarse.' },
                            { valor: 2, descripcion: 'Aprende con apoyo y práctica.' },
                            { valor: 3, descripcion: 'Aprende rápido y aplica lo aprendido.' },
                        ],
                    },
                ],
            },
            {
                id: 'sintesisFinal',
                nombre: 'Síntesis Final',
                tipo: 'texto_libre',
                preguntas: [
                    { clave: 'oportunidadesMejora', label: 'Áreas de mejora:' },
                    { clave: 'recomendaciones', label: 'Recomendaciones:' },
                    { clave: 'fortalezas', label: 'Fortalezas:' },
                    { clave: 'inquietudes', label: 'Inquietudes:' },
                    { clave: 'sugerencias', label: 'Sugerencias:' },
                    { clave: 'objetivosProxPeriodo', label: 'Objetivos para el próximo periodo:' },
                ],
            },
        ];

        await this.supabaseDataService.saveOtoConfig({
            secciones,
            fechaActualizacion: new Date().toISOString(),
        });

        return { ok: true, message: 'Configuración de one-to-one importada a Supabase exitosamente' };
    }

    async save(data: CreateOtoEvaluacionDto) {
        return this.supabaseDataService.saveOtoEvaluacion(data);
    }

    async getHistorial(equipoId: string) {
        return this.supabaseDataService.getOtoHistorial(equipoId);
    }
}
