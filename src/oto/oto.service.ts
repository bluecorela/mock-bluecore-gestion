import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOtoEvaluationDto } from './dto/create-oto-evaluation.dto';
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

        const rawSections = config?.sections ?? config?.secciones;
        if (!rawSections) {
            throw new NotFoundException(
                'No se encontró configuración de one-to-one en Supabase. ' +
                'Ejecuta POST /oto/seed para cargar la configuración inicial.'
            );
        }

        const sections = (rawSections as any[]).map((section) => ({
            id: section.id,
            name: section.name,
            type: section.type ?? section.tipo,
            questions: (section.questions ?? section.preguntas ?? []).map((question: any) => ({
                key: question.key ?? question.clave,
                label: question.label,
                options: (question.options ?? question.opciones ?? []).map((option: any) => ({
                    value: option.value ?? option.valor,
                    description: option.description ?? option.descripcion,
                })),
            })),
        }));

        return { sections };
    }

    /**
     * Importa la configuración inicial de preguntas a Supabase.
     * Solo necesita ejecutarse una vez.
     */
    async seedConfig() {
        const sections = [
            {
                id: 'reflectionQuestions',
                name: 'Preguntas de Reflexión',
                type: 'free_text',
                questions: [
                    { key: 'cargaTrabajo', label: '¿Cómo te sientes con tu carga de trabajo?' },
                    { key: 'apoyoLider', label: '¿Hay algo que pueda hacer para apoyarte mejor?' },
                    { key: 'retosRol', label: '¿Qué retos estás enfrentando en tu rol?' },
                    { key: 'procesosEquipo', label: '¿Cómo podemos mejorar los procesos o las dinámicas del equipo?' },
                    { key: 'feedbackLider', label: '¿Tienes algún feedback para mí como líder?' },
                ],
            },
            {
                id: 'softSkills',
                name: 'Habilidades Blandas',
                type: 'rating_with_options',
                questions: [
                    {
                        key: 'trabajoEquipo',
                        label: 'Trabajo en equipo',
                        opciones: [
                            { valor: 1, descripcion: 'No colabora en equipo.' },
                            { valor: 2, descripcion: 'Aporta e interactúa cuando es necesario.' },
                            { valor: 3, descripcion: 'Es muy participativo y fomenta la cooperación.' },
                        ],
                    },
                    {
                        key: 'comunicacionEfectiva',
                        label: 'Comunicación efectiva',
                        opciones: [
                            { valor: 1, descripcion: 'No se comunica con claridad.' },
                            { valor: 2, descripcion: 'Expresa sus ideas, pero con fallas ocasionales.' },
                            { valor: 3, descripcion: 'Se comunica claramente y escucha activamente.' },
                        ],
                    },
                    {
                        key: 'proactividad',
                        label: 'Proactividad',
                        opciones: [
                            { valor: 1, descripcion: 'Espera instrucciones para actuar.' },
                            { valor: 2, descripcion: 'Toma iniciativa ocasionalmente.' },
                            { valor: 3, descripcion: 'Busca oportunidades y actúa sin esperar.' },
                        ],
                    },
                    {
                        key: 'resolucionProblemas',
                        label: 'Resolución de problemas',
                        opciones: [
                            { valor: 1, descripcion: 'Tiene dificultades para encontrar soluciones.' },
                            { valor: 2, descripcion: 'Resuelve problemas con ayuda o tiempo extra.' },
                            { valor: 3, descripcion: 'Encuentra soluciones rápidas y efectivas.' },
                        ],
                    },
                    {
                        key: 'capacidadAprendizaje',
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
                id: 'finalSummary',
                name: 'Síntesis Final',
                type: 'free_text',
                questions: [
                    { key: 'oportunidadesMejora', label: 'Áreas de mejora:' },
                    { key: 'recomendaciones', label: 'Recomendaciones:' },
                    { key: 'fortalezas', label: 'Fortalezas:' },
                    { key: 'inquietudes', label: 'Inquietudes:' },
                    { key: 'sugerencias', label: 'Sugerencias:' },
                    { key: 'objetivosProxPeriodo', label: 'Objetivos para el próximo periodo:' },
                ],
            },
        ];

        await this.supabaseDataService.saveOtoConfig({
            sections,
            updatedAt: new Date().toISOString(),
        });

        return { ok: true, message: 'Configuración de one-to-one importada a Supabase exitosamente' };
    }

    async save(data: CreateOtoEvaluationDto) {
        return this.supabaseDataService.saveOtoEvaluation(data);
    }

    async getHistory(teamId: string) {
        return this.supabaseDataService.getOtoHistory(teamId);
    }

    async getContext(teamId: string) {
        const [team, members, sprints, config, history] = await Promise.all([
            this.supabaseDataService.getTeam(teamId),
            this.supabaseDataService.getEmployeeByTeam(teamId),
            this.supabaseDataService.getSprintsByTeam(teamId),
            this.getConfig(),
            this.getHistory(teamId),
        ]);
        if (!team) throw new NotFoundException('No existe el equipo');
        return {
            team,
            members,
            sprints: sprints.map((sprint) => ({
                id: sprint.code,
                name: sprint.code,
                startDate: sprint.start_date ?? null,
                endDate: sprint.end_date ?? null,
                sprintClosed: sprint.sprint_closed ?? null,
            })),
            config,
            history,
        };
    }

    async getAdminOverview() {
        const teams = await this.supabaseDataService.getTeams();
        const teamSummaries = await Promise.all(teams.map(async (team) => {
            const evaluations = await this.getHistory(team.id);
            return { team, evaluations, totalEvaluations: evaluations.length };
        }));
        return { teams: teamSummaries };
    }
}
