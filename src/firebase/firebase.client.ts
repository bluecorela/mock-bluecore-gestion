import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, limit } from 'firebase/firestore';

export interface MemberSummary {
  name: string;
  total1: number;
  total2: number;
  total3: number;
  total_final: number;
  rating: string;
  comments?: string;
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

  async getPersonnelByEmail(email: string) {
    await this.login();

    const personnelRef = collection(this.db, 'personal');
    const q = query(personnelRef, where('correo', '==', email));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getPersonnelById(id: string) {
    await this.login();
    const personnelRef = doc(this.db, 'personal', id);
    const personnelSnapshot = await getDoc(personnelRef);

    if (!personnelSnapshot.exists()) return null;
    return { id: personnelSnapshot.id, ...personnelSnapshot.data() };
  }

  async getPersonnel() {
    await this.login();

    const personnelRef = collection(this.db, 'personal');
    const snap = await getDocs(personnelRef);

    return snap.docs.map(docu => ({
      id: docu.id,
      ...docu.data(),
    }));

  }


  async getPersonnelByTeam(teamId: string) {
    await this.login();

    const teamRef = doc(this.db, 'equipos', teamId);
    const personnelRef = collection(this.db, 'personal');

    const q = query(
      personnelRef,
      where('equipo', '==', teamRef)
    );

    const snap = await getDocs(q);

    return snap.docs.map(docu => ({
      id: docu.id,
      ...docu.data(),
    }));
  }

  async getVacationingPersonnel() {
    await this.login();

    const personnelRef = collection(this.db, 'personal');
    const q = query(personnelRef, where('vacaciones', '==', true));
    const snap = await getDocs(q);

    return snap.docs.map(docu => ({
      id: docu.id,
      ...docu.data(),
    }));
  }

  async getTeams(onlyWithEvaluations = false) {
    await this.login();
    const teamsRef = collection(this.db, 'equipos');
    const teamsSnapshot = await getDocs(teamsRef);
    let availableTeams = teamsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (onlyWithEvaluations) {
      const filtered: any[] = [];
      for (const team of availableTeams) {
        // Verificar si tiene al menos un sprint con integrantes evaluados
        const sprintsRef = collection(this.db, 'equipos', team.id, 'sprints');
        const sprintsSnap = await getDocs(sprintsRef);

        let hasEvaluations = false;
        for (const sprintDoc of sprintsSnap.docs) {
          const membersRef = collection(this.db, 'equipos', team.id, 'sprints', sprintDoc.id, 'Integrantes');
          const membersSnapshot = await getDocs(query(membersRef, limit(1)));
          if (!membersSnapshot.empty) {
            hasEvaluations = true;
            break;
          }
        }

        if (hasEvaluations) {
          filtered.push(team);
        }
      }
      return filtered;
    }

    return availableTeams;
  }

  async findTeamByName(name: string) {
    await this.login();
    const teamsRef = collection(this.db, 'equipos');
    const q = query(teamsRef, where('nombre', '==', name));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  async getTeam(teamId: string) {
    await this.login();
    const teamRef = doc(this.db, `teams/${teamId}`);
    const teamSnapshot = await getDoc(teamRef);
    if (!teamSnapshot.exists()) {
      return null;
    }
    return { id: teamSnapshot.id, ...teamSnapshot.data() };
  }

  async getSprintsByTeam(teamId: string) {
    await this.login();
    const sprintsRef = collection(this.db, `teams/${teamId}/sprints`);
    const sprintsSnap = await getDocs(sprintsRef);
    const sprintsData = sprintsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    return sprintsData;
  }

  async getMembersBySprint(
    teamId: string,
    sprintId: string
  ): Promise<(MemberSummary & { id: string })[]> {
    await this.login();

    const membersRef = collection(
      this.db,
      `teams/${teamId}/sprints/${sprintId}/Integrantes`
    );

    const membersSnapshot = await getDocs(membersRef);

    return membersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as MemberSummary),
    }));
  }

  async getSprint(teamId: string, sprintId: string) {
    await this.login();
    const sprintRef = doc(this.db, `teams/${teamId}/sprints/${sprintId}`);
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
      sprintClosed: sprintSnap.data().sprint_cerrado ?? null
    };
  }

  async getSprintEvaluationStatus(teamId: string, specificSprintId?: string) {
    await this.login();

    // 1. Obtener todos los sprints del equipo para encontrar el activo
    const sprints = await this.getSprintsByTeam(teamId);

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
    const sprintNumber = activeSprint ? this.getSprintNumero(activeSprint.id) : (maxSprintNum + 1);
    const sprintId = activeSprint ? activeSprint.id : `sprint-${sprintNumber}`;

    // 2. Obtener integrantes ya evaluados en este sprint
    const rawEvaluatedMembers = await this.getMembersBySprint(teamId, sprintId);
    const evaluatedNames = rawEvaluatedMembers.map(e => e.name.toLowerCase().trim());

    // 3. Obtener personal del equipo (base para pendientes)
    const personnel = await this.getPersonnelByTeam(teamId);

    // 4. Filtrar pendientes con la lógica de negocio completa
    const teamMembers = personnel
      .filter(p => {
        const role = String(p['rol'] || '').toLowerCase().trim();
        const onVacation = p['vacaciones'] === true;
        const name = String(p['nombre'] || '').toLowerCase().trim();

        // No evaluados aún
        const alreadyEvaluated = evaluatedNames.includes(name);

        // Reglas de exclusión
        const isArchitect = role === 'arquitecto';

        // Regla de reemplazo (inicioReemplazoSprintId)
        const replacementStart = p['inicioReemplazoSprintId']
          ? this.getSprintNumero(p['inicioReemplazoSprintId'])
          : 0;
        const enabledByReplacement = replacementStart <= sprintNumber;

        return !alreadyEvaluated && !isArchitect && !onVacation && enabledByReplacement;
      })
      .map(p => ({
        name: p['nombre'],
        role: p['rol'],
        onVacation: p['vacaciones'] ?? false,
        replacementStartSprintId: p['inicioReemplazoSprintId'] ?? null
      }));

    // 5. Fechas del sprint (si ya existe) en formato ISO para el input date del front
    let dates = { startDate: '', endDate: '' };
    if (activeSprint) {
      dates.startDate = activeSprint.fecha_inicio ? new Date(activeSprint.fecha_inicio.seconds * 1000).toISOString().split('T')[0] : '';
      dates.endDate = activeSprint.fecha_fin ? new Date(activeSprint.fecha_fin.seconds * 1000).toISOString().split('T')[0] : '';
    } else {
      // Sugerir fechas de la semana actual si es un sprint nuevo
      const hoy = new Date();
      const diaSemana = hoy.getDay(); // 0 (Dom) a 6 (Sab)
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));

      const viernes = new Date(lunes);
      viernes.setDate(lunes.getDate() + 4);

      dates.startDate = lunes.toISOString().split('T')[0];
      dates.endDate = viernes.toISOString().split('T')[0];
    }

    return {
      sprintId,
      sprintNumber,
      teamMembers,
      dates,
      datesSaved: !!activeSprint, // Flag to indicate if we are in an already created sprint
      sprintClosed: activeSprint ? (activeSprint.sprint_cerrado === true) : false
    };
  }

  private getSprintNumero(sprintId: string): number {
    const parts = String(sprintId).split('-');
    return parts.length > 1 ? parseInt(parts[1], 10) : 0;
  }

  async getRotationHistory() {
    await this.login();
    const historyRef = collection(this.db, 'historialRotaciones');
    const historySnapshot = await getDocs(historyRef);

    const historyData = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    return historyData;
  }

  async getModulesByRole(role: string) {
    await this.login();
    const modulesRef = collection(this.db, 'modulosSidebar');
    const modulesSnapshot = await getDocs(modulesRef);
    const modulesData = modulesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((moduleItem: any) => Array.isArray(moduleItem.allowedRoles) &&
        moduleItem.allowedRoles.includes(role));

    // Si el rol es Admin, filtrar los módulos que no deben mostrarse por ahora
    if (role === 'Admin') {
      const modulesToDisable = ['Gestor de Noticias', 'Documentos'];
      return modulesData.filter((m: any) => !modulesToDisable.includes(m.name));
    }

    return modulesData;
  }

  async saveEvaluation(data: any) {
    await this.login();

    const {
      teamId,
      sprintId,
      startDate,
      endDate,
      engineer,
      metrics,
      finalScore,
      ratingLabel,
      comments,
      evaluatorEmail,
    } = data;

    const engineerName = engineer.split(' – ')[0];
    const memberId = engineerName.toLowerCase().replace(/\s/g, '-');

    const sprintRef = doc(this.db, 'equipos', teamId, 'sprints', sprintId);
    const sprintSnap = await getDoc(sprintRef);

    if (!sprintSnap.exists()) {
      await setDoc(sprintRef, {
        fecha_inicio: new Date(startDate),
        fecha_fin: new Date(endDate),
        sprint_cerrado: false,
      });
    }

    const memberRef = doc(this.db, 'equipos', teamId, 'sprints', sprintId, 'Integrantes', memberId);

    await setDoc(
      memberRef,
      {
        name: engineerName,
        ...metrics,
        total_final: finalScore,
        rating: ratingLabel,
        comments,
        evaluado_por: evaluatorEmail,
        fecha_evaluacion: new Date(),
      },
      { merge: true }
    );

    // ────────────────────────────────────────────────────────────────
    // Auto-cerrar sprint si ya se evaluaron todos los integrantes
    // ────────────────────────────────────────────────────────────────
    const membersRef = collection(this.db, 'equipos', teamId, 'sprints', sprintId, 'Integrantes');
    const membersSnapshot = await getDocs(membersRef);
    const totalEvaluated = membersSnapshot.size;

    // Calcular miembros esperados: personal del equipo excluye Arquitecto y vacaciones
    const teamDocumentRef = doc(this.db, 'equipos', teamId);
    const personnelRef = collection(this.db, 'personal');
    const personnelSnapshot = await getDocs(
      query(personnelRef, where('equipo', '==', teamDocumentRef))
    );

    const totalExpected = personnelSnapshot.docs
      .map(d => d.data())
      .filter(p => {
        const role = String(p['rol'] || '').toLowerCase().trim();
        const onVacation = p['vacaciones'] === true;
        return role !== 'arquitecto' && !onVacation;
      }).length;

    let sprintClosed = false;
    if (totalExpected > 0 && totalEvaluated >= totalExpected) {
      await setDoc(sprintRef, { sprint_cerrado: true }, { merge: true });
      sprintClosed = true;
    }

    // Retornar el nuevo estado para que el front se actualice automáticamente
    const nextState = await this.getSprintEvaluationStatus(teamId);

    return { ok: true, sprintClosed, nextState };
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

  async getMetrics(teamId: string, sprintId: string) {
    await this.login();

    const members = await this.getMembersBySprint(teamId, sprintId);

    const sprintRef = doc(this.db, 'equipos', teamId, 'sprints', sprintId);
    const sprintSnap = await getDoc(sprintRef);
    const sprintData = sprintSnap.data();

    const summary = members
      .filter(i => i.rating !== 'Arquitecto')
      .map(i => ({
        name: i.name,
        total1: i.total1,
        total2: i.total2,
        total3: i.total3,
        totalFinal: `${i.total_final}% (${i.rating})`,
        comments: i.comments ?? '—',
      }));

    return {
      startDate: this.formatDate(sprintData?.fecha_inicio),
      endDate: this.formatDate(sprintData?.fecha_fin),
      summary,
    };
  }

  async createTeam(name: string): Promise<{ id: string; name: string }> {
    await this.login();

    // Generar ID slug (misma lógica que el frontend)
    const teamId = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-');

    // Verificar si ya existe
    const teamRef = doc(this.db, 'equipos', teamId);
    const teamSnapshot = await getDoc(teamRef);

    if (teamSnapshot.exists()) {
      throw new Error('Ya existe un equipo con ese nombre');
    }

    // Crear equipo
    await setDoc(teamRef, { name });

    return { id: teamId, name };
  }

  async createPersonnel(data: {
    name: string;
    role: string;
    email?: string;
    teamId?: string;
  }): Promise<{ id: string }> {
    await this.login();

    const personnelRef = collection(this.db, 'personal');
    const docRef = doc(personnelRef);

    const nuevoMiembro: any = {
      name: data.name,
      role: data.role,
    };

    // Agregar correo si existe
    if (data.email) {
      nuevoMiembro.email = data.email;
    }

    // Agregar referencia al equipo si existe
    if (data.teamId) {
      const teamRef = doc(this.db, 'equipos', data.teamId);
      nuevoMiembro.team = teamRef;
    }

    await setDoc(docRef, nuevoMiembro);

    return { id: docRef.id };
  }

  async updatePersonnelTeam(personnelId: string, teamId: string) {
    await this.login();
    const personnelRef = doc(this.db, 'personal', personnelId);
    const teamRef = doc(this.db, 'equipos', teamId);

    await setDoc(personnelRef, { team: teamRef }, { merge: true });
    return { ok: true };
  }

  async updatePersonnelVacation(personnelId: string, onVacation: boolean) {
    await this.login();
    const personnelRef = doc(this.db, 'personal', personnelId);

    await setDoc(personnelRef, { onVacation }, { merge: true });
    return { ok: true };
  }

  async addRotationHistory(data: any) {
    await this.login();
    const historyRef = collection(this.db, 'historialRotaciones');

    await setDoc(doc(historyRef), {
      ...data,
      date: new Date()
    });

    return { ok: true };
  }

  async savePerformanceEvaluation(data: any) {
    await this.login();
    const { teamId, engineerName } = data;
    const docId = engineerName.toLowerCase().replace(/\s/g, '-');

    // Auto-detect: find the correct collection number
    const evaluationNumber = await this.findNextPerformanceCollection(teamId, docId);
    console.log(`[Performance] Auto-detected collection: performance-${evaluationNumber} for ${docId}`);

    const path = `teams/${teamId}/evaluaciones/perfomance/performance-${evaluationNumber}/${docId}`;
    const ref = doc(this.db, path);

    await setDoc(ref, {
      ...data,
      evaluationNumber,
      date: new Date(),
    });

    // Actualizar progreso de la habilitación si existe
    const activeEnablement = await this.getActiveEnablement(teamId);
    if (activeEnablement) {
      const enablementRef = doc(this.db, 'habilitaciones_desempeno', (activeEnablement as any).id);
      const evaluadosCount = ((activeEnablement as any).evaluadosCount || 0) + 1;
      const totalExpected = (activeEnablement as any).totalExpected || 0;

      await setDoc(enablementRef, {
        evaluadosCount,
        status: evaluadosCount >= totalExpected ? 'Completado' : 'En proceso',
        ultimaActualizacion: new Date()
      }, { merge: true });
    }

    return { ok: true, evaluationNumber };
  }

  /**
   * Scans existing performance-N collections to find where to save.
   * If the member already exists in the latest collection → returns N+1.
   * If the member does NOT exist in the latest collection → returns that N.
   * If no collections exist → returns 1.
   */
  private async findNextPerformanceCollection(teamId: string, docId: string): Promise<number> {
    let lastNonEmpty = 0;

    for (let i = 1; i <= 20; i++) {
      const path = `teams/${teamId}/evaluaciones/perfomance/performance-${i}`;
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

  async getPerformanceHistory(teamId: string) {
    await this.login();
    const allEvaluations: any[] = [];

    // Iteramos hasta 10 evaluaciones como en el frontend actual
    for (let i = 1; i <= 10; i++) {
      const path = `teams/${teamId}/evaluaciones/perfomance/performance-${i}`;
      const ref = collection(this.db, path);
      const snap = await getDocs(ref);

      if (!snap.empty) {
        snap.docs.forEach(d => {
          const data = d.data();
          allEvaluations.push({
            ...data,
            numero: i,
            date: data.date?.toDate?.() || data.date || new Date()
          });
        });
      }
    }

    return allEvaluations;
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

  async saveOtoEvaluation(data: any) {
    await this.login();
    const { teamId, engineerName } = data;
    const docId = engineerName.toLowerCase().replace(/\s/g, '-');

    // Auto-detect: find the correct collection number
    const evaluationNumber = await this.findNextOtoCollection(teamId, docId);
    console.log(`[OTO] Auto-detected collection: one-to-one-${evaluationNumber} for ${docId}`);

    const path = `teams/${teamId}/evaluaciones/one-to-one/one-to-one-${evaluationNumber}/${docId}`;
    const ref = doc(this.db, path);

    await setDoc(ref, {
      ...data,
      evaluationNumber,
      date: new Date(),
    });

    return { ok: true, evaluationNumber };
  }

  /**
   * Scans existing one-to-one-N collections to find where to save.
   * Same logic as performance: if member already exists in latest → N+1.
   */
  private async findNextOtoCollection(teamId: string, docId: string): Promise<number> {
    let lastNonEmpty = 0;

    for (let i = 1; i <= 30; i++) {
      const path = `teams/${teamId}/evaluaciones/one-to-one/one-to-one-${i}`;
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

  async getOtoHistory(teamId: string) {
    await this.login();
    const allEvaluations: any[] = [];

    for (let i = 1; i <= 20; i++) {
      const path = `teams/${teamId}/evaluaciones/one-to-one/one-to-one-${i}`;
      const ref = collection(this.db, path);
      const snap = await getDocs(ref);

      if (!snap.empty) {
        snap.docs.forEach(d => {
          const data = d.data();
          allEvaluations.push({
            ...data,
            numero: i,
            date: data.date?.toDate?.() || data.sessionDate?.toDate?.() || data.date || new Date(),
          });
        });
      }
    }

    return allEvaluations;
  }

  async enablePerformance(teamId: string, adminName: string) {
    await this.login();

    // Verificar si ya existe una habilitación activa para este equipo
    const existente = await this.getActiveEnablement(teamId);
    if (existente) {
      // Ya existe una habilitación activa, retornarla sin crear duplicado
      return existente;
    }

    // 1. Obtener integrantes del equipo para saber cuántos se esperan evaluar
    const personnel = await this.getPersonnelByTeam(teamId);
    const totalExpected = personnel.filter(p =>
      !['Arquitecto', 'Admin'].includes(String(p['rol'] || ''))
    ).length;

    const team = await this.getTeam(teamId);

    const docRef = doc(collection(this.db, 'habilitaciones_desempeno'));
    const data = {
      teamId,
      teamName: (team as any)?.name || teamId,
      adminName,
      enabledAt: new Date(),
      status: 'Pendiente',
      evaluadosCount: 0,
      totalExpected,
    };

    await setDoc(docRef, data);
    return { id: docRef.id, ...data };
  }

  async getPerformanceEnablements(teamId?: string) {
    await this.login();
    const enablementsRef = collection(this.db, 'habilitaciones_desempeno');
    let q = query(enablementsRef);

    if (teamId) {
      q = query(enablementsRef, where('equipoId', '==', teamId));
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      enabledAt: (d.data() as any).enabledAt?.toDate?.() || (d.data() as any).enabledAt
    })).sort((a, b) => {
      const dateA = a.enabledAt?.getTime?.() || 0;
      const dateB = b.enabledAt?.getTime?.() || 0;
      return dateB - dateA;
    });
  }

  async getActiveEnablement(teamId: string) {
    await this.login();
    const enablementsRef = collection(this.db, 'habilitaciones_desempeno');
    const q = query(
      enablementsRef,
      where('equipoId', '==', teamId),
      where('estado', 'in', ['Pendiente', 'En proceso'])
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docs = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      enabledAt: (d.data() as any).enabledAt?.toDate?.() || (d.data() as any).enabledAt
    })).sort((a, b) => {
      const dateA = a.enabledAt?.getTime?.() || 0;
      const dateB = b.enabledAt?.getTime?.() || 0;
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
