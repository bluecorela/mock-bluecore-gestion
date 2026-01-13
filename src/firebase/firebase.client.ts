import { Injectable } from '@nestjs/common';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

@Injectable()
export class FirebaseClient {
  private auth: any;
  private db: any;
  private isLogged = false;

  constructor() {
    console.log('Inicializando Firebase Client...');
    if (!getApps().length) {
      const app = initializeApp({
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


async getPersonalByEquipo(equipoId: string) {
  await this.login();

  const pEquipoId = equipoId?.split('/').pop();
  const personalRef = collection(this.db, `personal/${equipoId}`);

  const q = query(
    personalRef,
    where('equipo', '==', pEquipoId)
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
}