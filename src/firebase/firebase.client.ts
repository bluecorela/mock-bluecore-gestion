import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';

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

  async getEquipos() {
    await this.login();
    const equiposRef = collection(this.db, 'equipos');
    const equiposSnap = await getDocs(equiposRef);
    const equiposDisponibles = equiposSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

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
    //return { id: sprintSnap.id, ...sprintSnap.data() };
    return {
      id: sprintSnap.id,
      fecha_inicio: sprintSnap.data().fecha_inicio
        ? sprintSnap.data().fecha_inicio.toDate().toISOString()
        : null,
      fecha_fin: sprintSnap.data().fecha_fin
        ? sprintSnap.data().fecha_fin.toDate().toISOString()
        : null,
    };
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

    return { ok: true };
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
    const { equipoId, numeroEvaluacion, nombreIngeniero } = data;
    const docId = nombreIngeniero.toLowerCase().replace(/\s/g, '-');
    const path = `equipos/${equipoId}/evaluaciones/perfomance/performance-${numeroEvaluacion}/${docId}`;
    const ref = doc(this.db, path);

    await setDoc(ref, {
      ...data,
      fecha: new Date(),
    });

    return { ok: true };
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
}
