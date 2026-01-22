import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';

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

  async getIntegrantesBySprint(equipoId: string, sprintId: string) {
    await this.login();
    const integrantesRef = collection(this.db, `equipos/${equipoId}/sprints/${sprintId}/Integrantes`);
    const integrantesSnap = await getDocs(integrantesRef);

    return integrantesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

}