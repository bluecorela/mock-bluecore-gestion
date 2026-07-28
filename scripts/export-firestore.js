/**
 * Export Firestore collections to JSON files for migration work.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json npm run firebase:export
 *   npm run firebase:export
 *
 * Options:
 *   FIREBASE_EXPORT_MODE=client npm run firebase:export
 *   OUT_DIR=./firebase-export npm run firebase:export
 *   ROOT_COLLECTIONS=equipos,personal npm run firebase:export
 *   MAX_DEPTH=8 npm run firebase:export
 *
 * The script exports:
 *   - one nested JSON file per root collection
 *   - manifest.json with collection/document counts
 */

const admin = require('firebase-admin');
const { getFirestore, Timestamp, DocumentReference, GeoPoint } = require('firebase-admin/firestore');
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore: getClientFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
} = require('firebase/firestore');
const fs = require('fs/promises');
const path = require('path');

try {
  require('dotenv').config({ quiet: true });
} catch {
  // dotenv is optional; environment variables can be provided by the shell.
}

const DEFAULT_OUT_DIR = 'firebase-export';
const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_PERFORMANCE_COLLECTIONS = 30;
const DEFAULT_OTO_COLLECTIONS = 30;

const outDir = path.resolve(process.env.OUT_DIR || DEFAULT_OUT_DIR);
const maxDepth = Number(process.env.MAX_DEPTH || DEFAULT_MAX_DEPTH);
const exportMode =
  process.env.FIREBASE_EXPORT_MODE ||
  (process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'admin' : 'client');
const maxPerformanceCollections = Number(
  process.env.MAX_PERFORMANCE_COLLECTIONS || DEFAULT_PERFORMANCE_COLLECTIONS,
);
const maxOtoCollections = Number(process.env.MAX_OTO_COLLECTIONS || DEFAULT_OTO_COLLECTIONS);
const rootCollectionsFilter = (process.env.ROOT_COLLECTIONS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const knownRootCollections = [
  'config_evaluaciones',
  'equipos',
  'habilitaciones_desempeno',
  'historialRotaciones',
  'modulosSidebar',
  'personal',
  'settings',
];

const manifest = {
  exportedAt: new Date().toISOString(),
  projectId: null,
  outDir,
  maxDepth,
  rootCollections: [],
  collections: {},
  documents: 0,
};

function initFirebaseAdmin() {
  const apps = typeof admin.getApps === 'function' ? admin.getApps() : admin.apps || [];
  if (apps.length) {
    return typeof admin.getApp === 'function' ? admin.getApp() : apps[0];
  }

  return admin.initializeApp({
    credential: admin.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
  });
}

async function initFirebaseClient() {
  const requiredEnvVars = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_APP_ID',
    'FIREBASE_EMAIL',
    'FIREBASE_PASSWORD',
  ];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Faltan variables en .env: ${missing.join(', ')}`);
  }

  const appConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    appId: process.env.FIREBASE_APP_ID,
  };

  const app = getApps().length ? getApp() : initializeApp(appConfig);
  const auth = getAuth(app);

  if (!auth.currentUser) {
    await signInWithEmailAndPassword(
      auth,
      process.env.FIREBASE_EMAIL,
      process.env.FIREBASE_PASSWORD,
    );
  }

  return { app, db: getClientFirestore(app) };
}

function safeFileName(value) {
  return String(value).replace(/[^\w.-]+/g, '_');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) return value;

  if (
    value instanceof Timestamp ||
    (typeof value?.toDate === 'function' &&
      typeof value?.seconds === 'number' &&
      typeof value?.nanoseconds === 'number')
  ) {
    return {
      __type: 'timestamp',
      iso: value.toDate().toISOString(),
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (
    value instanceof DocumentReference ||
    (typeof value?.path === 'string' && typeof value?.id === 'string' && value?.type === 'document')
  ) {
    return {
      __type: 'documentReference',
      path: value.path,
      id: value.id,
    };
  }

  if (
    value instanceof GeoPoint ||
    (typeof value?.latitude === 'number' && typeof value?.longitude === 'number')
  ) {
    return {
      __type: 'geoPoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (Buffer.isBuffer(value)) {
    return {
      __type: 'buffer',
      base64: value.toString('base64'),
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (value instanceof Date) {
    return {
      __type: 'date',
      iso: value.toISOString(),
    };
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeFirestoreValue(item)]),
    );
  }

  return value;
}

function registerCollection(collectionPath, count) {
  manifest.collections[collectionPath] = {
    documents: count,
  };
}

async function exportCollection(collectionRef, depth = 0) {
  const collectionPath = collectionRef.path;
  const snap = await collectionRef.get();
  registerCollection(collectionPath, snap.size);

  console.log(`Exportando ${collectionPath} (${snap.size} docs)`);

  const docs = [];

  for (const docSnap of snap.docs) {
    manifest.documents += 1;

    const docData = {
      id: docSnap.id,
      path: docSnap.ref.path,
      data: serializeFirestoreValue(docSnap.data()),
      subcollections: {},
    };

    if (depth < maxDepth) {
      const subcollections = await docSnap.ref.listCollections();

      for (const subcollection of subcollections) {
        docData.subcollections[subcollection.id] = await exportCollection(
          subcollection,
          depth + 1,
        );
      }
    }

    docs.push(docData);
  }

  return docs;
}

async function exportClientCollection(db, collectionPath) {
  const snap = await getDocs(collection(db, collectionPath));
  registerCollection(collectionPath, snap.size);

  console.log(`Exportando ${collectionPath} (${snap.size} docs)`);

  return snap.docs.map((docSnap) => {
    manifest.documents += 1;

    return {
      id: docSnap.id,
      path: docSnap.ref.path,
      data: serializeFirestoreValue(docSnap.data()),
      subcollections: {},
    };
  });
}

async function exportClientDocument(db, documentPath) {
  const snap = await getDoc(doc(db, documentPath));

  if (!snap.exists()) return null;

  manifest.documents += 1;

  return {
    id: snap.id,
    path: snap.ref.path,
    data: serializeFirestoreValue(snap.data()),
    subcollections: {},
  };
}

async function exportClientSprints(db, equipoId) {
  const sprints = await exportClientCollection(db, `equipos/${equipoId}/sprints`);

  for (const sprint of sprints) {
    sprint.subcollections.Integrantes = await exportClientCollection(
      db,
      `equipos/${equipoId}/sprints/${sprint.id}/Integrantes`,
    );
  }

  return sprints;
}

async function exportNumberedEvaluationCollections(db, basePath, prefix, maxCollections) {
  const exported = [];

  for (let index = 1; index <= maxCollections; index += 1) {
    const collectionId = `${prefix}-${index}`;
    const collectionPath = `${basePath}/${collectionId}`;
    const docs = await exportClientCollection(db, collectionPath);

    if (docs.length) {
      exported.push({
        id: collectionId,
        path: collectionPath,
        data: null,
        subcollections: {},
        docs,
      });
    }
  }

  return exported;
}

async function exportClientEvaluaciones(db, equipoId) {
  const performanceDoc = {
    id: 'perfomance',
    path: `equipos/${equipoId}/evaluaciones/perfomance`,
    data: null,
    subcollections: {},
  };
  const otoDoc = {
    id: 'one-to-one',
    path: `equipos/${equipoId}/evaluaciones/one-to-one`,
    data: null,
    subcollections: {},
  };

  performanceDoc.subcollections.performance = await exportNumberedEvaluationCollections(
    db,
    performanceDoc.path,
    'performance',
    maxPerformanceCollections,
  );
  otoDoc.subcollections['one-to-one'] = await exportNumberedEvaluationCollections(
    db,
    otoDoc.path,
    'one-to-one',
    maxOtoCollections,
  );

  return [performanceDoc, otoDoc];
}

async function exportClientRootCollection(db, collectionId) {
  const docs = await exportClientCollection(db, collectionId);

  if (collectionId === 'equipos') {
    for (const equipo of docs) {
      equipo.subcollections.sprints = await exportClientSprints(db, equipo.id);
      equipo.subcollections.evaluaciones = await exportClientEvaluaciones(db, equipo.id);
    }
  }

  return docs;
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function mainAdmin() {
  const app = initFirebaseAdmin();
  const db = getFirestore(app);
  manifest.projectId = app.options.projectId || process.env.GCLOUD_PROJECT || null;

  await fs.mkdir(outDir, { recursive: true });

  const rootCollections = await db.listCollections();
  const selectedRootCollections = rootCollections
    .filter((collectionRef) =>
      rootCollectionsFilter.length
        ? rootCollectionsFilter.includes(collectionRef.id)
        : true,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  manifest.rootCollections = selectedRootCollections.map((collectionRef) => collectionRef.id);

  if (!selectedRootCollections.length) {
    console.log('No se encontraron colecciones para exportar.');
    return;
  }

  for (const collectionRef of selectedRootCollections) {
    const data = await exportCollection(collectionRef);
    const outputPath = path.join(outDir, `${safeFileName(collectionRef.id)}.json`);
    await writeJson(outputPath, data);
  }

  await writeJson(path.join(outDir, 'manifest.json'), manifest);

  console.log('');
  console.log(`Exportacion completada en: ${outDir}`);
  console.log(`Colecciones exportadas: ${Object.keys(manifest.collections).length}`);
  console.log(`Documentos exportados: ${manifest.documents}`);
}

async function mainClient() {
  const { db } = await initFirebaseClient();
  manifest.projectId = process.env.FIREBASE_PROJECT_ID || null;

  await fs.mkdir(outDir, { recursive: true });

  const selectedRootCollections = knownRootCollections
    .filter((collectionId) =>
      rootCollectionsFilter.length ? rootCollectionsFilter.includes(collectionId) : true,
    )
    .sort((a, b) => a.localeCompare(b));

  manifest.rootCollections = selectedRootCollections;

  for (const collectionId of selectedRootCollections) {
    const data = await exportClientRootCollection(db, collectionId);
    const outputPath = path.join(outDir, `${safeFileName(collectionId)}.json`);
    await writeJson(outputPath, data);
  }

  await writeJson(path.join(outDir, 'manifest.json'), manifest);

  console.log('');
  console.log(`Exportacion completada en: ${outDir}`);
  console.log(`Modo: client`);
  console.log(`Colecciones exportadas: ${Object.keys(manifest.collections).length}`);
  console.log(`Documentos exportados: ${manifest.documents}`);
}

async function main() {
  if (exportMode === 'admin') {
    await mainAdmin();
    return;
  }

  if (exportMode === 'client') {
    await mainClient();
    return;
  }

  throw new Error('FIREBASE_EXPORT_MODE debe ser "admin" o "client"');
}

function handleFatalError(error) {
  if (
    String(error?.message || '').includes('default credentials') ||
    String(error?.message || '').includes('Unable to detect a Project Id')
  ) {
    console.error('No se pudieron cargar credenciales de Firebase Admin.');
    console.error('');
    console.error('Ejecuta el script con una cuenta de servicio:');
    console.error('  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/export-firestore.js');
    console.error('');
    console.error('Tambien verifica que FIREBASE_PROJECT_ID exista en .env o en tu shell.');
    console.error('');
    console.error('Si no puedes usar una cuenta de servicio, usa el modo cliente:');
    console.error('  FIREBASE_EXPORT_MODE=client node scripts/export-firestore.js');
    process.exit(1);
  }

  if (error?.code === 'auth/network-request-failed') {
    console.error('No se pudo conectar a Firebase Auth usando el modo cliente.');
    console.error('');
    console.error('Verifica tu conexion y ejecuta:');
    console.error('  FIREBASE_EXPORT_MODE=client node scripts/export-firestore.js');
    process.exit(1);
  }

  if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/user-not-found') {
    console.error('Firebase rechazo las credenciales de FIREBASE_EMAIL/FIREBASE_PASSWORD.');
    console.error('Verifica esos valores en .env.');
    process.exit(1);
  }

  console.error('Error exportando Firestore:', error);
  process.exit(1);
}

process.on('unhandledRejection', handleFatalError);
main().catch(handleFatalError);
