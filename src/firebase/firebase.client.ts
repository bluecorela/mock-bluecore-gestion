import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, limit } from 'firebase/firestore';

export interface ResumenIntegrante {
  nombre: string;
  total1: number;
  total2: number;
  total3: number;
  total_final: number;
  calificacion: string;
  comentarios?: string;
}
@Injectable()
export class FirebaseClient {
  private auth: any;
  private db: any;
  private isLogged = false;

  constructor() {
    console.log('Inicializando Firebase Client...');
    const app = getApps().length
      ? getApp()
      : initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        appId: process.env.FIREBASE_APP_ID,
      });
    console.log('Firebase App inicializado');

    this.auth = getAuth(app);
    this.db = getFirestore(app);

    console.log('Auth y Firestore listos');
  }

  async login() {

    if (this.auth.currentUser) {
      this.isLogged = true;
      return;
    }

    if (this.isLogged) {
      this.isLogged = false;
    }

    console.log(`Intentando login con ${process.env.FIREBASE_EMAIL}`);
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        process.env.FIREBASE_EMAIL!,
        process.env.FIREBASE_PASSWORD!,
      );
      this.isLogged = true;

      console.log('Login exitoso:', userCredential.user.email);
    } catch (error) {
      this.isLogged = false;
      console.error('Error en login:', error);
      throw error;
    }
  }

  async getPersonalByEmail(email: string) {
    await this.login();

    const personalRef = collection(this.db, 'personal');
    const q = query(personalRef, where('correo', '==', email));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getPersonalById(id: string) {
    await this.login();
    const personalRef = doc(this.db, 'personal', id);
    const personalSnap = await getDoc(personalRef);

    if (!personalSnap.exists()) return null;
    return { id: personalSnap.id, ...personalSnap.data() };
  }

  async getPersonal() {
    await this.login();

    const personalRef = collection(this.db, 'personal');
    const snap = await getDocs(personalRef);

    return snap.docs.map(docu => ({
      id: docu.id,
      ...docu.data(),
    }));

  }


  async getPersonalByEquipo(equipoId: string) {
    await this.login();

    const equipoRef = doc(this.db, 'equipos', equipoId);
    const personalRef = collection(this.db, 'personal');

    const q = query(
      personalRef,
      where('equipo', '==', equipoRef)
    );

    const snap = await getDocs(q);

    return snap.docs.map(docu => ({
      id: docu.id,
      ...docu.data(),
    }));
  }

  async getPersonalOnVacation() {
    await this.login();

    const personalRef = collection(this.db, 'personal');
    const q = query(personalRef, where('vacaciones', '==', true));
    const snap = await getDocs(q);

    return snap.docs.map(docu => ({
      id: docu.id,
      ...docu.data(),
    }));
  }

  async getEquipos(onlyWithEvaluations = false) {
    await this.login();
    const equiposRef = collection(this.db, 'equipos');
    const equiposSnap = await getDocs(equiposRef);
    let equiposDisponibles = equiposSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (onlyWithEvaluations) {
      const filtered: any[] = [];
      for (const equipo of equiposDisponibles) {
        // Verificar si tiene al menos un sprint con integrantes evaluados
        const sprintsRef = collection(this.db, 'equipos', equipo.id, 'sprints');
        const sprintsSnap = await getDocs(sprintsRef);

        let hasEvaluations = false;
        for (const sprintDoc of sprintsSnap.docs) {
          const integrantesRef = collection(this.db, 'equipos', equipo.id, 'sprints', sprintDoc.id, 'Integrantes');
          const integrantesSnap = await getDocs(query(integrantesRef, limit(1)));
          if (!integrantesSnap.empty) {
            hasEvaluations = true;
            break;
          }
        }

        if (hasEvaluations) {
          filtered.push(equipo);
        }
      }
      return filtered;
    }

    return equiposDisponibles;
  }

  async searchTeamByName(name: string) {
    await this.login();
    const equiposRef = collection(this.db, 'equipos');
    const q = query(equiposRef, where('nombre', '==', name));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  async getEquipo(equipoId: string) {
    await this.login();
    const equipoRef = doc(this.db, `equipos/${equipoId}`);
    const equipoSnap = await getDoc(equipoRef);
    if (!equipoSnap.exists()) {
      return null;
    }
    return { id: equipoSnap.id, ...equipoSnap.data() };
  }

  async getSprintsByEquipo(equipoId: string) {
    await this.login();
    const sprintsRef = collection(this.db, `equipos/${equipoId}/sprints`);
    const sprintsSnap = await getDocs(sprintsRef);
    const sprintsData = sprintsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    return sprintsData;
  }

  async getIntegrantesBySprint(
    equipoId: string,
    sprintId: string
  ): Promise<(ResumenIntegrante & { id: string })[]> {
    await this.login();

    const integrantesRef = collection(
      this.db,
      `equipos/${equipoId}/sprints/${sprintId}/Integrantes`
    );

    const integrantesSnap = await getDocs(integrantesRef);

    return integrantesSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as ResumenIntegrante),
    }));
  }

  async getSprint(equipoId: string, sprintId: string) {
    await this.login();
    const sprintRef = doc(this.db, `equipos/${equipoId}/sprints/${sprintId}`);
    const sprintSnap = await getDoc(sprintRef);
    if (!sprintSnap.exists()) {
      return null;
    }
    return {
      id: sprintSnap.id,
      fecha_inicio: sprintSnap.data().fecha_inicio
        ? sprintSnap.data().fecha_inicio.toDate().toISOString()
        : null,
      fecha_fin: sprintSnap.data().fecha_fin
        ? sprintSnap.data().fecha_fin.toDate().toISOString()
        : null,
      sprintCerrado: sprintSnap.data().sprint_cerrado ?? null
    };
  }

  async getSprintEvaluationStatus(equipoId: string, specificSprintId?: string) {
    await this.login();

    // 1. Obtener todos los sprints del equipo para encontrar el activo
    const sprints = await this.getSprintsByEquipo(equipoId);

    let activeSprint: any = null;

    if (specificSprintId) {
      activeSprint = sprints.find(s => s.id === specificSprintId);
    } else {
      // El primer sprint con sprint_cerrado !== true (ordenado por numero)
      activeSprint = (sprints as any[])
        .filter(s => s.sprint_cerrado !== true)
        .sort((a, b) => this.getSprintNumero(a.id) - this.getSprintNumero(b.id))[0];
    }

    // Si no hay sprint activo pendiente, calculamos el "sprint + 1" del máximo existente
    const maxSprintNum = sprints.reduce((max, s) => Math.max(max, this.getSprintNumero(s.id)), 0);
    const sprintNumero = activeSprint ? this.getSprintNumero(activeSprint.id) : (maxSprintNum + 1);
    const sprintId = activeSprint ? activeSprint.id : `sprint-${sprintNumero}`;

    // 2. Obtener integrantes ya evaluados en este sprint
    const evaluadosRaw = await this.getIntegrantesBySprint(equipoId, sprintId);
    const evaluadosNombres = evaluadosRaw.map(e => e.nombre.toLowerCase().trim());

    // 3. Obtener personal del equipo (base para pendientes)
    const personal = await this.getPersonalByEquipo(equipoId);

    // 4. Filtrar pendientes con la lógica de negocio completa
    const integrantesEquipo = personal
      .filter(p => {
        const rol = String(p['rol'] || '').toLowerCase().trim();
        const vacaciones = p['vacaciones'] === true;
        const nombre = String(p['nombre'] || '').toLowerCase().trim();

        // No evaluados aún
        const yaEvaluado = evaluadosNombres.includes(nombre);

        // Reglas de exclusión
        const esArquitecto = rol === 'arquitecto';

        // Regla de reemplazo (inicioReemplazoSprintId)
        const inicioReemplazo = p['inicioReemplazoSprintId']
          ? this.getSprintNumero(p['inicioReemplazoSprintId'])
          : 0;
        const habilitadoPorReemplazo = inicioReemplazo <= sprintNumero;

        return !yaEvaluado && !esArquitecto && !vacaciones && habilitadoPorReemplazo;
      })
      .map(p => ({
        nombre: p['nombre'],
        rol: p['rol'],
        vacaciones: p['vacaciones'] ?? false,
        inicioReemplazoSprintId: p['inicioReemplazoSprintId'] ?? null
      }));

    // 5. Fechas del sprint (si ya existe) en formato ISO para el input date del front
    let fechas = { fechaInicio: '', fechaFin: '' };
    if (activeSprint) {
      fechas.fechaInicio = activeSprint.fecha_inicio ? new Date(activeSprint.fecha_inicio.seconds * 1000).toISOString().split('T')[0] : '';
      fechas.fechaFin = activeSprint.fecha_fin ? new Date(activeSprint.fecha_fin.seconds * 1000).toISOString().split('T')[0] : '';
    } else {
      // Sugerir fechas de la semana actual si es un sprint nuevo
      const hoy = new Date();
      const diaSemana = hoy.getDay(); // 0 (Dom) a 6 (Sab)
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
      sprintCerrado: activeSprint ? (activeSprint.sprint_cerrado === true) : false
    };
  }

  private getSprintNumero(sprintId: string): number {
    const parts = String(sprintId).split('-');
    return parts.length > 1 ? parseInt(parts[1], 10) : 0;
  }

  async getHistorialRotaciones() {
    await this.login();
    const historialRef = collection(this.db, 'historialRotaciones');
    const historialSnap = await getDocs(historialRef);

    const historialData = historialSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    return historialData;
  }

  async getModulosRol(rol: string) {
    await this.login();
    const modulosRef = collection(this.db, 'modulosSidebar');
    const modulosSnap = await getDocs(modulosRef);
    const modulosData = modulosSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((modulo: any) => Array.isArray(modulo.rolesPermitidos) &&
        modulo.rolesPermitidos.includes(rol));

    // Si el rol es Admin, filtrar los módulos que no deben mostrarse por ahora
    if (rol === 'Admin') {
      const modulosADeshabilitar = ['Gestor de Noticias', 'Documentos'];
      return modulosData.filter((m: any) => !modulosADeshabilitar.includes(m.nombre));
    }

    return modulosData;
  }

  async guardarEvaluacion(data: any) {
    await this.login();

    const {
      equipoId,
      sprintId,
      fechaInicio,
      fechaFin,
      ingeniero,
      metricas,
      puntuacionFinal,
      calificacionTexto,
      comentarios,
      evaluadorCorreo,
    } = data;

    const nombreIngeniero = ingeniero.split(' – ')[0];
    const integranteId = nombreIngeniero.toLowerCase().replace(/\s/g, '-');

    const sprintRef = doc(this.db, 'equipos', equipoId, 'sprints', sprintId);
    const sprintSnap = await getDoc(sprintRef);

    if (!sprintSnap.exists()) {
      await setDoc(sprintRef, {
        fecha_inicio: new Date(fechaInicio),
        fecha_fin: new Date(fechaFin),
        sprint_cerrado: false,
      });
    }

    const integranteRef = doc(this.db, 'equipos', equipoId, 'sprints', sprintId, 'Integrantes', integranteId);

    await setDoc(
      integranteRef,
      {
        nombre: nombreIngeniero,
        ...metricas,
        total_final: puntuacionFinal,
        calificacion: calificacionTexto,
        comentarios,
        evaluado_por: evaluadorCorreo,
        fecha_evaluacion: new Date(),
      },
      { merge: true }
    );

    // ────────────────────────────────────────────────────────────────
    // Auto-cerrar sprint si ya se evaluaron todos los integrantes
    // ────────────────────────────────────────────────────────────────
    const integrantesRef = collection(this.db, 'equipos', equipoId, 'sprints', sprintId, 'Integrantes');
    const integrantesSnap = await getDocs(integrantesRef);
    const totalEvaluados = integrantesSnap.size;

    // Calcular miembros esperados: personal del equipo excluye Arquitecto y vacaciones
    const equipoDocRef = doc(this.db, 'equipos', equipoId);
    const personalRef = collection(this.db, 'personal');
    const personalSnap = await getDocs(
      query(personalRef, where('equipo', '==', equipoDocRef))
    );

    const totalEsperados = personalSnap.docs
      .map(d => d.data())
      .filter(p => {
        const rol = String(p['rol'] || '').toLowerCase().trim();
        const vacaciones = p['vacaciones'] === true;
        return rol !== 'arquitecto' && !vacaciones;
      }).length;

    let sprintCerrado = false;
    if (totalEsperados > 0 && totalEvaluados >= totalEsperados) {
      await setDoc(sprintRef, { sprint_cerrado: true }, { merge: true });
      sprintCerrado = true;
    }

    // Retornar el nuevo estado para que el front se actualice automáticamente
    const nextState = await this.getSprintEvaluationStatus(equipoId);

    return { ok: true, sprintCerrado, nextState };
  }


  //Metodo para mostrar fechas en el formato correcto
  private formatDate(dateValue: any): string {
    if (!dateValue) return '';

    const date =
      typeof dateValue.toDate === 'function'
        ? dateValue.toDate()
        : new Date(dateValue);

    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  async obtenerMetricas(equipoId: string, sprintId: string) {
    await this.login();

    const integrantes = await this.getIntegrantesBySprint(equipoId, sprintId);

    const sprintRef = doc(this.db, 'equipos', equipoId, 'sprints', sprintId);
    const sprintSnap = await getDoc(sprintRef);
    const sprintData = sprintSnap.data();

    const resumen = integrantes
      .filter(i => i.calificacion !== 'Arquitecto')
      .map(i => ({
        nombre: i.nombre,
        total1: i.total1,
        total2: i.total2,
        total3: i.total3,
        totalFinal: `${i.total_final}% (${i.calificacion})`,
        comentarios: i.comentarios ?? '—',
      }));

    return {
      fechaInicio: this.formatDate(sprintData?.fecha_inicio),
      fechaFin: this.formatDate(sprintData?.fecha_fin),
      resumen,
    };
  }

  async createEquipo(nombre: string): Promise<{ id: string; nombre: string }> {
    await this.login();

    // Generar ID slug (misma lógica que el frontend)
    const equipoId = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-');

    // Verificar si ya existe
    const equipoRef = doc(this.db, 'equipos', equipoId);
    const equipoSnap = await getDoc(equipoRef);

    if (equipoSnap.exists()) {
      throw new Error('Ya existe un equipo con ese nombre');
    }

    // Crear equipo
    await setDoc(equipoRef, { nombre });

    return { id: equipoId, nombre };
  }

  async createPersonal(data: {
    nombre: string;
    rol: string;
    correo?: string;
    equipoId?: string;
  }): Promise<{ id: string }> {
    await this.login();

    const personalRef = collection(this.db, 'personal');
    const docRef = doc(personalRef);

    const nuevoMiembro: any = {
      nombre: data.nombre,
      rol: data.rol,
    };

    // Agregar correo si existe
    if (data.correo) {
      nuevoMiembro.correo = data.correo;
    }

    // Agregar referencia al equipo si existe
    if (data.equipoId) {
      const equipoRef = doc(this.db, 'equipos', data.equipoId);
      nuevoMiembro.equipo = equipoRef;
    }

    await setDoc(docRef, nuevoMiembro);

    return { id: docRef.id };
  }

  async updatePersonalEquipo(personalId: string, equipoId: string) {
    await this.login();
    const personalRef = doc(this.db, 'personal', personalId);
    const equipoRef = doc(this.db, 'equipos', equipoId);

    await setDoc(personalRef, { equipo: equipoRef }, { merge: true });
    return { ok: true };
  }

  async updatePersonalVacaciones(personalId: string, vacaciones: boolean) {
    await this.login();
    const personalRef = doc(this.db, 'personal', personalId);

    await setDoc(personalRef, { vacaciones }, { merge: true });
    return { ok: true };
  }

  async addHistorialRotacion(data: any) {
    await this.login();
    const historialRef = collection(this.db, 'historialRotaciones');

    await setDoc(doc(historialRef), {
      ...data,
      fecha: new Date()
    });

    return { ok: true };
  }

  async savePerformanceEvaluacion(data: any) {
    await this.login();
    const { equipoId, nombreIngeniero } = data;
    const docId = nombreIngeniero.toLowerCase().replace(/\s/g, '-');

    // Auto-detect: find the correct collection number
    const numeroEvaluacion = await this.findNextPerformanceCollection(equipoId, docId);
    console.log(`[Performance] Auto-detected collection: performance-${numeroEvaluacion} for ${docId}`);

    const path = `equipos/${equipoId}/evaluaciones/perfomance/performance-${numeroEvaluacion}/${docId}`;
    const ref = doc(this.db, path);

    await setDoc(ref, {
      ...data,
      numeroEvaluacion,
      fecha: new Date(),
    });

    // Actualizar progreso de la habilitación si existe
    const habilitacionActiva = await this.getHabilitacionActiva(equipoId);
    if (habilitacionActiva) {
      const habilitacionRef = doc(this.db, 'habilitaciones_desempeno', (habilitacionActiva as any).id);
      const evaluadosCount = ((habilitacionActiva as any).evaluadosCount || 0) + 1;
      const totalEsperados = (habilitacionActiva as any).totalEsperados || 0;

      await setDoc(habilitacionRef, {
        evaluadosCount,
        estado: evaluadosCount >= totalEsperados ? 'Completado' : 'En proceso',
        ultimaActualizacion: new Date()
      }, { merge: true });
    }

    return { ok: true, numeroEvaluacion };
  }

  /**
   * Scans existing performance-N collections to find where to save.
   * If the member already exists in the latest collection → returns N+1.
   * If the member does NOT exist in the latest collection → returns that N.
   * If no collections exist → returns 1.
   */
  private async findNextPerformanceCollection(equipoId: string, docId: string): Promise<number> {
    let lastNonEmpty = 0;

    for (let i = 1; i <= 20; i++) {
      const path = `equipos/${equipoId}/evaluaciones/perfomance/performance-${i}`;
      const ref = collection(this.db, path);
      const snap = await getDocs(ref);

      if (snap.empty) break;
      lastNonEmpty = i;

      // Check if this specific member already has a doc here
      const memberDoc = doc(this.db, `${path}/${docId}`);
      const memberSnap = await getDoc(memberDoc);

      if (!memberSnap.exists()) {
        // Member doesn't exist in this collection yet → save here
        return i;
      }
    }

    // If no collections exist, start at 1
    if (lastNonEmpty === 0) return 1;

    // Member exists in the latest collection → create next one
    return lastNonEmpty + 1;
  }

  async getPerformanceHistorial(equipoId: string) {
    await this.login();
    const allEvaluaciones: any[] = [];

    // Iteramos hasta 10 evaluaciones como en el frontend actual
    for (let i = 1; i <= 10; i++) {
      const path = `equipos/${equipoId}/evaluaciones/perfomance/performance-${i}`;
      const ref = collection(this.db, path);
      const snap = await getDocs(ref);

      if (!snap.empty) {
        snap.docs.forEach(d => {
          const data = d.data();
          allEvaluaciones.push({
            ...data,
            numero: i,
            fecha: data.fecha?.toDate?.() || data.fecha || new Date()
          });
        });
      }
    }

    return allEvaluaciones;
  }



  async getPerformanceConfig() {
    await this.login();
    const docRef = doc(this.db, 'config_evaluaciones', 'performance');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  }

  async savePerformanceConfig(data: any) {
    await this.login();
    const docRef = doc(this.db, 'config_evaluaciones', 'performance');
    await setDoc(docRef, data);
    return { ok: true };
  }

  async getOtoConfig() {
    await this.login();
    const docRef = doc(this.db, 'config_evaluaciones', 'one-to-one');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  }

  async saveOtoConfig(data: any) {
    await this.login();
    const docRef = doc(this.db, 'config_evaluaciones', 'one-to-one');
    await setDoc(docRef, data);
    return { ok: true };
  }

  async saveOtoEvaluacion(data: any) {
    await this.login();
    const { equipoId, nombreIngeniero } = data;
    const docId = nombreIngeniero.toLowerCase().replace(/\s/g, '-');

    // Auto-detect: find the correct collection number
    const numeroEvaluacion = await this.findNextOtoCollection(equipoId, docId);
    console.log(`[OTO] Auto-detected collection: one-to-one-${numeroEvaluacion} for ${docId}`);

    const path = `equipos/${equipoId}/evaluaciones/one-to-one/one-to-one-${numeroEvaluacion}/${docId}`;
    const ref = doc(this.db, path);

    await setDoc(ref, {
      ...data,
      numeroEvaluacion,
      fecha: new Date(),
    });

    return { ok: true, numeroEvaluacion };
  }

  /**
   * Scans existing one-to-one-N collections to find where to save.
   * Same logic as performance: if member already exists in latest → N+1.
   */
  private async findNextOtoCollection(equipoId: string, docId: string): Promise<number> {
    let lastNonEmpty = 0;

    for (let i = 1; i <= 30; i++) {
      const path = `equipos/${equipoId}/evaluaciones/one-to-one/one-to-one-${i}`;
      const ref = collection(this.db, path);
      const snap = await getDocs(ref);

      if (snap.empty) break;
      lastNonEmpty = i;

      // Check if this specific member already has a doc here
      const memberDoc = doc(this.db, `${path}/${docId}`);
      const memberSnap = await getDoc(memberDoc);

      if (!memberSnap.exists()) {
        // Member doesn't exist in this collection yet → save here
        return i;
      }
    }

    // If no collections exist, start at 1
    if (lastNonEmpty === 0) return 1;

    // Member exists in the latest collection → create next one
    return lastNonEmpty + 1;
  }

  async getOtoHistorial(equipoId: string) {
    await this.login();
    const allEvaluaciones: any[] = [];

    for (let i = 1; i <= 20; i++) {
      const path = `equipos/${equipoId}/evaluaciones/one-to-one/one-to-one-${i}`;
      const ref = collection(this.db, path);
      const snap = await getDocs(ref);

      if (!snap.empty) {
        snap.docs.forEach(d => {
          const data = d.data();
          allEvaluaciones.push({
            ...data,
            numero: i,
            fecha: data.fecha?.toDate?.() || data.fechaSesion?.toDate?.() || data.fecha || new Date(),
          });
        });
      }
    }

    return allEvaluaciones;
  }

  async habilitarPerformance(equipoId: string, nombreAdmin: string) {
    await this.login();

    // Verificar si ya existe una habilitación activa para este equipo
    const existente = await this.getHabilitacionActiva(equipoId);
    if (existente) {
      // Ya existe una habilitación activa, retornarla sin crear duplicado
      return existente;
    }

    // 1. Obtener integrantes del equipo para saber cuántos se esperan evaluar
    const personal = await this.getPersonalByEquipo(equipoId);
    const totalEsperados = personal.filter(p =>
      !['Arquitecto', 'Admin'].includes(String(p['rol'] || ''))
    ).length;

    const equipo = await this.getEquipo(equipoId);

    const docRef = doc(collection(this.db, 'habilitaciones_desempeno'));
    const data = {
      equipoId,
      nombreEquipo: (equipo as any)?.nombre || equipoId,
      nombreAdmin,
      fechaHabilitacion: new Date(),
      estado: 'Pendiente',
      evaluadosCount: 0,
      totalEsperados,
    };

    await setDoc(docRef, data);
    return { id: docRef.id, ...data };
  }

  async getHabilitacionesPerformance(equipoId?: string) {
    await this.login();
    const habilitacionesRef = collection(this.db, 'habilitaciones_desempeno');
    let q = query(habilitacionesRef);

    if (equipoId) {
      q = query(habilitacionesRef, where('equipoId', '==', equipoId));
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      fechaHabilitacion: (d.data() as any).fechaHabilitacion?.toDate?.() || (d.data() as any).fechaHabilitacion
    })).sort((a, b) => {
      const dateA = a.fechaHabilitacion?.getTime?.() || 0;
      const dateB = b.fechaHabilitacion?.getTime?.() || 0;
      return dateB - dateA;
    });
  }

  async getHabilitacionActiva(equipoId: string) {
    await this.login();
    const habilitacionesRef = collection(this.db, 'habilitaciones_desempeno');
    const q = query(
      habilitacionesRef,
      where('equipoId', '==', equipoId),
      where('estado', 'in', ['Pendiente', 'En proceso'])
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docs = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      fechaHabilitacion: (d.data() as any).fechaHabilitacion?.toDate?.() || (d.data() as any).fechaHabilitacion
    })).sort((a, b) => {
      const dateA = a.fechaHabilitacion?.getTime?.() || 0;
      const dateB = b.fechaHabilitacion?.getTime?.() || 0;
      return dateB - dateA;
    });

    return docs[0];
  }

  async getMaintenanceStatus() {
    await this.login();
    const docRef = doc(this.db, 'settings/maintenance');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return { active: false };
  }
}
