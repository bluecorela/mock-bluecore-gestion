import { Injectable } from '@nestjs/common';
import { SupabaseClient } from './supabase.client';
import {
  CreatePersonalData,
  Equipo,
  GuardarEvaluacionRequest,
  HistorialRotacionRow,
  MaintenanceStatus,
  ModuloSidebar,
  Personal,
  Sprint,
  SprintIntegrante,
  UpdatePersonalData,
} from './interfaces/supabase-interface';
import { CreatePerformanceEvaluacionDto } from '../performance/dto/performance-evaluacion.dto';
import { CreateOtoEvaluacionDto } from '../oto/dto/create-oto-evaluacion.dto';

@Injectable()
export class SupabaseDataService {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  private client() {
    return this.supabaseClient.getClient();
  }

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');
  }

  private sprintPrimaryId(equipoId: string, sprintId: string): string {
    return `${equipoId}__${sprintId}`;
  }

  private getSprintNumero(sprintId: string): number {
    const parts = String(sprintId).split('-');
    return parts.length > 1 ? parseInt(parts[1], 10) : 0;
  }

  private mapPersonal(row: Personal | null) {
    if (!row) return null;

    return {
      ...row,
      inicioReemplazoSprintId: row.inicio_reemplazo_sprint_id,
      equipo: row.equipo_id ? { id: row.equipo_id, path: `equipos/${row.equipo_id}` } : null,
    };
  }

  private mapSprintIntegrante(row: SprintIntegrante) {
    return {
      id: row.firebase_id,
      nombre: row.nombre ?? '',
      total1: row.total1 ?? 0,
      total2: row.total2 ?? 0,
      total3: row.total3 ?? 0,
      total_final: row.total_final ?? 0,
      calificacion: row.calificacion ?? '',
      comentarios: row.comentarios ?? undefined,
      tareasAsignadas: row.tareas_asignadas ?? undefined,
      tareasEntregadas: row.tareas_entregadas ?? undefined,
      tareasDevueltas: row.tareas_devueltas ?? undefined,
      calidadCodigo: row.calidad_codigo ?? undefined,
      evaluado_por: row.evaluado_por ?? undefined,
      fecha_evaluacion: row.fecha_evaluacion ?? undefined,
    };
  }

  private mapHistorial(row: HistorialRotacionRow) {
    return {
      id: row.id,
      fecha: row.fecha,
      tipo: row.tipo,
      nombre: row.nombre,
      desde: row.desde,
      desdeNombre: row.desde_nombre,
      hacia: row.hacia,
      haciaNombre: row.hacia_nombre,
      personalId: row.personal_id,
    };
  }

  async getEquipos(onlyWithEvaluations = false): Promise<Equipo[]> {
    if (onlyWithEvaluations) {
      const { data: integrantes, error: integrantesError } = await this.client()
        .from('sprint_integrantes')
        .select('equipo_id');

      if (integrantesError) {
        throw integrantesError;
      }

      const equipoIds = [...new Set((integrantes ?? []).map((integrante) => integrante.equipo_id))];

      if (!equipoIds.length) {
        return [];
      }

      const { data, error } = await this.client()
        .from('equipos')
        .select('id, nombre')
        .in('id', equipoIds)
        .order('nombre', { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    }

    const query = this.client()
      .from('equipos')
      .select('id, nombre');

    const { data, error } = await query.order('nombre', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getEquipo(equipoId: string): Promise<Equipo | null> {
    const { data, error } = await this.client()
      .from('equipos')
      .select('*')
      .eq('id', equipoId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async searchTeamByName(name: string): Promise<Equipo | null> {
    const { data, error } = await this.client()
      .from('equipos')
      .select('*')
      .eq('nombre', name)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async createEquipo(nombre: string): Promise<{ id: string; nombre: string }> {
    const equipoId = this.slug(nombre);
    const existing = await this.getEquipo(equipoId);

    if (existing) {
      throw new Error('Ya existe un equipo con ese nombre');
    }

    const { error } = await this.client()
      .from('equipos')
      .insert({
        id: equipoId,
        nombre,
        raw_data: { nombre },
      });

    if (error) {
      throw error;
    }

    return { id: equipoId, nombre };
  }

  async getPersonal(): Promise<Personal[]> {
    const { data, error } = await this.client()
      .from('personal')
      .select('*');

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getPersonalByEmail(email: string) {
    const { data, error } = await this.client()
      .from('personal')
      .select('*')
      .eq('correo', email)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return this.mapPersonal(data);
  }

  async getPersonalById(id: string) {
    const { data, error } = await this.client()
      .from('personal')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return this.mapPersonal(data);
  }

  async getPersonalByEquipo(equipoId: string): Promise<Personal[]> {
    const { data, error } = await this.client()
      .from('personal')
      .select('*')
      .eq('equipo_id', equipoId);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getPersonalOnVacation(): Promise<Personal[]> {
    const { data, error } = await this.client()
      .from('personal')
      .select('*')
      .eq('vacaciones', true);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async createPersonal(data: CreatePersonalData): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const row = {
      id,
      nombre: data.nombre,
      rol: data.rol,
      correo: data.correo ?? null,
      equipo_id: data.equipoId ?? null,
      estatus: data.estatus ?? 'activo',
      raw_data: {
        nombre: data.nombre,
        rol: data.rol,
        correo: data.correo,
        equipoId: data.equipoId,
        estatus: data.estatus ?? 'activo',
      },
    };

    const { error } = await this.client().from('personal').insert(row);

    if (error) {
      throw error;
    }

    return { id };
  }

  async updatePersonal(personalId: string, data: UpdatePersonalData) {
    const current = await this.getPersonalById(personalId);

    if (!current) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      raw_data: {
        ...(current.raw_data ?? {}),
        ...data,
      },
    };

    if (data.nombre !== undefined) updateData.nombre = data.nombre;
    if (data.rol !== undefined) updateData.rol = data.rol;
    if (data.correo !== undefined) updateData.correo = data.correo;
    if (data.equipoId !== undefined) updateData.equipo_id = data.equipoId;
    if (data.estatus !== undefined) updateData.estatus = data.estatus;

    const { data: updated, error } = await this.client()
      .from('personal')
      .update(updateData)
      .eq('id', personalId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.mapPersonal(updated);
  }

  async updatePersonalEquipo(personalId: string, equipoId: string) {
    const { error } = await this.client()
      .from('personal')
      .update({
        equipo_id: equipoId,
        raw_data: { equipo: equipoId },
      })
      .eq('id', personalId);

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async updatePersonalVacaciones(personalId: string, vacaciones: boolean) {
    const { error } = await this.client()
      .from('personal')
      .update({ vacaciones })
      .eq('id', personalId);

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async getSprintsByEquipo(equipoId: string): Promise<Sprint[]> {
    const { data, error } = await this.client()
      .from('sprints')
      .select('*')
      .eq('equipo_id', equipoId)
      .order('fecha_inicio', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getSprint(equipoId: string, sprintId: string): Promise<Sprint | null> {
    const { data, error } = await this.client()
      .from('sprints')
      .select('*')
      .eq('equipo_id', equipoId)
      .eq('firebase_id', sprintId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async getIntegrantesBySprint(equipoId: string, sprintId: string): Promise<SprintIntegrante[]> {
    const { data, error } = await this.client()
      .from('sprint_integrantes')
      .select('*')
      .eq('equipo_id', equipoId)
      .eq('sprint_id', `${equipoId}__${sprintId}`);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getIntegrantesBySprintLegacy(equipoId: string, sprintId: string) {
    const integrantes = await this.getIntegrantesBySprint(equipoId, sprintId);
    return integrantes.map((integrante) => this.mapSprintIntegrante(integrante));
  }

  async getHistorialRotaciones() {
    const { data, error } = await this.client()
      .from('historial_rotaciones')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapHistorial(row));
  }

  async addHistorialRotacion(data: {
    personalId: string;
    nombre: string;
    tipo: string;
    desde: string;
    hacia: string;
    desdeNombre?: string;
    haciaNombre?: string;
    fecha?: Date;
  }) {
    const id = crypto.randomUUID();
    const fecha = data.fecha ?? new Date();
    const { error } = await this.client().from('historial_rotaciones').insert({
      id,
      fecha: fecha.toISOString(),
      tipo: data.tipo,
      nombre: data.nombre,
      personal_id: data.personalId,
      desde: data.desde,
      desde_nombre: data.desdeNombre ?? null,
      hacia: data.hacia,
      hacia_nombre: data.haciaNombre ?? null,
      raw_data: data,
    });

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async getModulosRol(rol: string): Promise<ModuloSidebar[]> {
    const { data, error } = await this.client()
      .from('modulos_sidebar')
      .select('*')
      .eq('visible', true)
      .order('orden', { ascending: true });

    if (error) {
      throw error;
    }

    const modulos = (data ?? []).filter(
      (modulo) => Array.isArray(modulo.roles_permitidos) && modulo.roles_permitidos.includes(rol),
    );

    if (rol === 'Admin') {
      const modulosADeshabilitar = ['Gestor de Noticias', 'Documentos'];
      return modulos.filter((modulo) => !modulosADeshabilitar.includes(modulo.nombre ?? ''));
    }

    return modulos;
  }

  async getMaintenanceStatus(): Promise<MaintenanceStatus> {
    const { data, error } = await this.client()
      .from('settings')
      .select('active')
      .eq('id', 'maintenance')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { active: data?.active ?? false };
  }

  async getPerformanceConfig() {
    const { data, error } = await this.client()
      .from('config_evaluaciones')
      .select('*')
      .eq('id', 'performance')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.raw_data ?? data;
  }

  async savePerformanceConfig(data: Record<string, unknown>) {
    const { error } = await this.client()
      .from('config_evaluaciones')
      .upsert({
        id: 'performance',
        secciones: data.secciones ?? null,
        raw_data: data,
      });

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async getOtoConfig() {
    const { data, error } = await this.client()
      .from('config_evaluaciones')
      .select('*')
      .eq('id', 'one-to-one')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.raw_data ?? data;
  }

  async saveOtoConfig(data: Record<string, unknown>) {
    const { error } = await this.client()
      .from('config_evaluaciones')
      .upsert({
        id: 'one-to-one',
        secciones: data.secciones ?? null,
        raw_data: data,
      });

    if (error) {
      throw error;
    }

    return { ok: true };
  }

  async savePerformanceEvaluacion(data: CreatePerformanceEvaluacionDto) {
    const numeroEvaluacion = data.numeroEvaluacion ?? await this.findNextEvaluationNumber(
      'performance_evaluaciones',
      data.equipoId,
      data.nombreIngeniero,
    );
    const docId = this.slug(data.nombreIngeniero);
    const collectionId = `performance-${numeroEvaluacion}`;
    const fecha = new Date().toISOString();

    const { error } = await this.client().from('performance_evaluaciones').insert({
      id: `${data.equipoId}__${collectionId}__${docId}`,
      firebase_id: docId,
      equipo_id: data.equipoId,
      nombre_ingeniero: data.nombreIngeniero,
      nombre_evaluador: data.nombreEvaluador,
      periodo: data.periodo,
      numero_evaluacion: numeroEvaluacion,
      fecha,
      respuestas: data.respuestas,
      logros: data.logros,
      potencial_crecimiento: data.potencialCrecimiento,
      observaciones_adicionales: data.observacionesAdicionales,
      retroalimentacion_confirmada: data.retroalimentacionConfirmada,
      firebase_collection: collectionId,
      raw_data: { ...data, numeroEvaluacion, fecha },
    });

    if (error) {
      throw error;
    }

    const habilitacionActiva = await this.getHabilitacionActiva(data.equipoId);
    if (habilitacionActiva) {
      const evaluadosCount = (habilitacionActiva.evaluadosCount || 0) + 1;
      await this.updateHabilitacionPerformance(habilitacionActiva.id, {
        evaluados_count: evaluadosCount,
        estado: evaluadosCount >= (habilitacionActiva.totalEsperados || 0) ? 'Completado' : 'En proceso',
        ultima_actualizacion: new Date().toISOString(),
      });
    }

    return { ok: true, numeroEvaluacion };
  }

  async getPerformanceHistorial(equipoId: string) {
    const { data, error } = await this.client()
      .from('performance_evaluaciones')
      .select('*')
      .eq('equipo_id', equipoId)
      .order('numero_evaluacion', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      ...row.raw_data,
      id: row.id,
      numero: row.numero_evaluacion,
      numeroEvaluacion: row.numero_evaluacion,
      fecha: row.fecha,
    }));
  }

  async saveOtoEvaluacion(data: CreateOtoEvaluacionDto) {
    const numeroEvaluacion = data.numeroEvaluacion ?? await this.findNextEvaluationNumber(
      'oto_evaluaciones',
      data.equipoId,
      data.nombreIngeniero,
    );
    const docId = this.slug(data.nombreIngeniero);
    const collectionId = `one-to-one-${numeroEvaluacion}`;
    const fecha = new Date().toISOString();

    const { error } = await this.client().from('oto_evaluaciones').insert({
      id: `${data.equipoId}__${collectionId}__${docId}`,
      firebase_id: docId,
      equipo_id: data.equipoId,
      nombre_ingeniero: data.nombreIngeniero,
      nombre_evaluador: data.nombreEvaluador,
      periodo: data.periodo,
      numero_evaluacion: numeroEvaluacion,
      fecha,
      resumen: data.resumen,
      sintesis_final: data.sintesisFinal,
      preguntas_reflexion: data.preguntasReflexion,
      habilidades_blandas: data.habilidadesBlandas,
      firebase_collection: collectionId,
      raw_data: { ...data, numeroEvaluacion, fecha },
    });

    if (error) {
      throw error;
    }

    return { ok: true, numeroEvaluacion };
  }

  async getOtoHistorial(equipoId: string) {
    const { data, error } = await this.client()
      .from('oto_evaluaciones')
      .select('*')
      .eq('equipo_id', equipoId)
      .order('numero_evaluacion', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      ...row.raw_data,
      id: row.id,
      numero: row.numero_evaluacion,
      numeroEvaluacion: row.numero_evaluacion,
      fecha: row.fecha,
    }));
  }

  private async findNextEvaluationNumber(
    table: 'performance_evaluaciones' | 'oto_evaluaciones',
    equipoId: string,
    nombreIngeniero: string,
  ): Promise<number> {
    const docId = this.slug(nombreIngeniero);
    const { data, error } = await this.client()
      .from(table)
      .select('numero_evaluacion, firebase_id')
      .eq('equipo_id', equipoId)
      .order('numero_evaluacion', { ascending: false });

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const latest = rows[0]?.numero_evaluacion ?? 0;
    const existsInLatest = rows.some((row) => row.numero_evaluacion === latest && row.firebase_id === docId);

    if (!latest) return 1;
    return existsInLatest ? latest + 1 : latest;
  }

  async habilitarPerformance(equipoId: string, nombreAdmin: string) {
    const existente = await this.getHabilitacionActiva(equipoId);
    if (existente) return existente;

    const personal = await this.getPersonalByEquipo(equipoId);
    const totalEsperados = personal.filter((p) => !['Arquitecto', 'Admin'].includes(String(p.rol || ''))).length;
    const equipo = await this.getEquipo(equipoId);
    const id = crypto.randomUUID();
    const fechaHabilitacion = new Date().toISOString();
    const row = {
      id,
      equipo_id: equipoId,
      nombre_equipo: equipo?.nombre || equipoId,
      nombre_admin: nombreAdmin,
      fecha_habilitacion: fechaHabilitacion,
      estado: 'Pendiente',
      evaluados_count: 0,
      total_esperados: totalEsperados,
      raw_data: {
        equipoId,
        nombreEquipo: equipo?.nombre || equipoId,
        nombreAdmin,
        fechaHabilitacion,
        estado: 'Pendiente',
        evaluadosCount: 0,
        totalEsperados,
      },
    };

    const { error } = await this.client().from('habilitaciones_desempeno').insert(row);

    if (error) {
      throw error;
    }

    return this.mapHabilitacion(row);
  }

  async getHabilitacionesPerformance(equipoId?: string) {
    let query = this.client()
      .from('habilitaciones_desempeno')
      .select('*')
      .order('fecha_habilitacion', { ascending: false });

    if (equipoId) {
      query = query.eq('equipo_id', equipoId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.mapHabilitacion(row));
  }

  async getHabilitacionActiva(equipoId: string) {
    const { data, error } = await this.client()
      .from('habilitaciones_desempeno')
      .select('*')
      .eq('equipo_id', equipoId)
      .in('estado', ['Pendiente', 'En proceso'])
      .order('fecha_habilitacion', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? this.mapHabilitacion(data) : null;
  }

  private async updateHabilitacionPerformance(
    id: string,
    updates: { evaluados_count: number; estado: string; ultima_actualizacion: string },
  ) {
    const { data: current, error: currentError } = await this.client()
      .from('habilitaciones_desempeno')
      .select('raw_data')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    const rawData = (current?.raw_data ?? {}) as Record<string, unknown>;
    const { error } = await this.client()
      .from('habilitaciones_desempeno')
      .update({
        ...updates,
        raw_data: {
          ...rawData,
          evaluadosCount: updates.evaluados_count,
          estado: updates.estado,
          ultimaActualizacion: updates.ultima_actualizacion,
        },
      })
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  private mapHabilitacion(row: any) {
    return {
      id: row.id,
      equipoId: row.equipo_id,
      nombreEquipo: row.nombre_equipo,
      nombreAdmin: row.nombre_admin,
      fechaHabilitacion: row.fecha_habilitacion,
      estado: row.estado,
      evaluadosCount: row.evaluados_count,
      totalEsperados: row.total_esperados,
      ultimaActualizacion: row.ultima_actualizacion,
    };
  }

  async obtenerMetricas(equipoId: string, sprintId: string) {
    const integrantes = await this.getIntegrantesBySprint(equipoId, sprintId);
    const sprint = await this.getSprint(equipoId, sprintId);

    const resumen = integrantes
      .filter((integrante) => integrante.calificacion !== 'Arquitecto')
      .map((integrante) => ({
        nombre: integrante.nombre,
        total1: integrante.total1,
        total2: integrante.total2,
        total3: integrante.total3,
        totalFinal: `${integrante.total_final}% (${integrante.calificacion})`,
        comentarios: integrante.comentarios ?? '—',
      }));

    return {
      fechaInicio: sprint?.fecha_inicio ? this.formatDate(sprint.fecha_inicio) : '',
      fechaFin: sprint?.fecha_fin ? this.formatDate(sprint.fecha_fin) : '',
      resumen,
    };
  }

  private formatDate(dateValue: string): string {
    return new Date(dateValue).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  async getSprintEvaluationStatus(equipoId: string, specificSprintId?: string) {
    const sprints = await this.getSprintsByEquipo(equipoId);
    let activeSprint = specificSprintId
      ? sprints.find((s) => s.firebase_id === specificSprintId)
      : sprints
        .filter((s) => s.sprint_cerrado !== true)
        .sort((a, b) => this.getSprintNumero(a.firebase_id) - this.getSprintNumero(b.firebase_id))[0];

    const maxSprintNum = sprints.reduce((max, sprint) => Math.max(max, this.getSprintNumero(sprint.firebase_id)), 0);
    const sprintNumero = activeSprint ? this.getSprintNumero(activeSprint.firebase_id) : maxSprintNum + 1;
    const sprintId = activeSprint ? activeSprint.firebase_id : `sprint-${sprintNumero}`;
    const evaluadosRaw = await this.getIntegrantesBySprint(equipoId, sprintId);
    const evaluadosNombres = evaluadosRaw.map((e) => String(e.nombre || '').toLowerCase().trim());
    const personal = await this.getPersonalByEquipo(equipoId);
    const integrantesEquipo = personal
      .filter((p) => {
        const rol = String(p.rol || '').toLowerCase().trim();
        const vacaciones = p.vacaciones === true;
        const nombre = String(p.nombre || '').toLowerCase().trim();
        const yaEvaluado = evaluadosNombres.includes(nombre);
        const esArquitecto = rol === 'arquitecto';
        const inicioReemplazo = p.inicio_reemplazo_sprint_id
          ? this.getSprintNumero(p.inicio_reemplazo_sprint_id)
          : 0;

        return !yaEvaluado && !esArquitecto && !vacaciones && inicioReemplazo <= sprintNumero;
      })
      .map((p) => ({
        nombre: p.nombre,
        rol: p.rol,
        vacaciones: p.vacaciones ?? false,
        inicioReemplazoSprintId: p.inicio_reemplazo_sprint_id ?? null,
      }));

    const fechas = { fechaInicio: '', fechaFin: '' };
    if (activeSprint) {
      fechas.fechaInicio = activeSprint.fecha_inicio ? activeSprint.fecha_inicio.split('T')[0] : '';
      fechas.fechaFin = activeSprint.fecha_fin ? activeSprint.fecha_fin.split('T')[0] : '';
    } else {
      const hoy = new Date();
      const diaSemana = hoy.getDay();
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
      const viernes = new Date(lunes);
      viernes.setDate(lunes.getDate() + 4);
      fechas.fechaInicio = lunes.toISOString().split('T')[0];
      fechas.fechaFin = viernes.toISOString().split('T')[0];
    }

    return {
      sprintId,
      sprintNumero,
      integrantesEquipo,
      fechas,
      fechasGuardadas: !!activeSprint,
      sprintCerrado: activeSprint ? activeSprint.sprint_cerrado === true : false,
    };
  }

  async guardarEvaluacion(data: GuardarEvaluacionRequest) {
    const nombreIngeniero = data.ingeniero.split(' – ')[0];
    const integranteId = this.slug(nombreIngeniero);
    const sprintPrimaryId = this.sprintPrimaryId(data.equipoId, data.sprintId);
    const sprint = await this.getSprint(data.equipoId, data.sprintId);

    if (!sprint) {
      const { error } = await this.client().from('sprints').insert({
        id: sprintPrimaryId,
        firebase_id: data.sprintId,
        equipo_id: data.equipoId,
        fecha_inicio: new Date(data.fechaInicio).toISOString(),
        fecha_fin: new Date(data.fechaFin).toISOString(),
        sprint_cerrado: false,
        raw_data: {
          fecha_inicio: data.fechaInicio,
          fecha_fin: data.fechaFin,
          sprint_cerrado: false,
        },
      });

      if (error) throw error;
    }

    const metricas = data.metricas ?? {};
    const { error: integranteError } = await this.client().from('sprint_integrantes').upsert({
      id: `${sprintPrimaryId}__${integranteId}`,
      firebase_id: integranteId,
      sprint_id: sprintPrimaryId,
      equipo_id: data.equipoId,
      nombre: nombreIngeniero,
      tareas_asignadas: metricas.tareasAsignadas ?? null,
      tareas_entregadas: metricas.tareasEntregadas ?? metricas.tareasEntregadas2 ?? null,
      tareas_devueltas: metricas.tareasDevueltas ?? null,
      calidad_codigo: metricas.calidadCodigo ?? null,
      total1: metricas.total1 ?? null,
      total2: metricas.total2 ?? null,
      total3: metricas.total3 ?? null,
      total_final: data.puntuacionFinal,
      calificacion: data.calificacionTexto,
      comentarios: data.comentarios ?? null,
      evaluado_por: data.evaluadorCorreo,
      fecha_evaluacion: new Date().toISOString(),
      raw_data: {
        nombre: nombreIngeniero,
        ...metricas,
        total_final: data.puntuacionFinal,
        calificacion: data.calificacionTexto,
        comentarios: data.comentarios,
        evaluado_por: data.evaluadorCorreo,
      },
    });

    if (integranteError) throw integranteError;

    const integrantes = await this.getIntegrantesBySprint(data.equipoId, data.sprintId);
    const personal = await this.getPersonalByEquipo(data.equipoId);
    const totalEsperados = personal.filter((p) => {
      const rol = String(p.rol || '').toLowerCase().trim();
      return rol !== 'arquitecto' && p.vacaciones !== true;
    }).length;
    let sprintCerrado = false;

    if (totalEsperados > 0 && integrantes.length >= totalEsperados) {
      const { error } = await this.client()
        .from('sprints')
        .update({ sprint_cerrado: true })
        .eq('id', sprintPrimaryId);

      if (error) throw error;
      sprintCerrado = true;
    }

    const nextState = await this.getSprintEvaluationStatus(data.equipoId);
    return { ok: true, sprintCerrado, nextState };
  }
}
