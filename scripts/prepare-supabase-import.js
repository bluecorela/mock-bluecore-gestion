/**
 * Convert firebase-export/*.json into normalized Supabase import files.
 *
 * Usage:
 *   npm run supabase:prepare
 *
 * Options:
 *   FIREBASE_EXPORT_DIR=./firebase-export npm run supabase:prepare
 *   SUPABASE_IMPORT_DIR=./supabase-import npm run supabase:prepare
 *
 * Output:
 *   supabase-import/schema.sql
 *   supabase-import/tables/*.json
 *   supabase-import/tables/*.csv
 *   supabase-import/manifest.json
 */

const fs = require('fs/promises');
const path = require('path');

const exportDir = path.resolve(process.env.FIREBASE_EXPORT_DIR || 'firebase-export');
const importDir = path.resolve(process.env.SUPABASE_IMPORT_DIR || 'supabase-import');
const tablesDir = path.join(importDir, 'tables');

const tables = {
  equipos: [],
  personal: [],
  sprints: [],
  sprint_integrantes: [],
  performance_evaluaciones: [],
  oto_evaluaciones: [],
  historial_rotaciones: [],
  modulos_sidebar: [],
  config_evaluaciones: [],
  habilitaciones_desempeno: [],
  settings: [],
};

function emptyToNull(value) {
  return value === undefined ? null : value;
}

function unwrapFirestoreValue(value) {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return value.map(unwrapFirestoreValue);
  }

  if (typeof value === 'object') {
    if (value.__type === 'timestamp' || value.__type === 'date') {
      return value.iso || null;
    }

    if (value.__type === 'documentReference') {
      return value.id || value.path || null;
    }

    if (value.__type === 'geoPoint') {
      return {
        latitude: value.latitude,
        longitude: value.longitude,
      };
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, unwrapFirestoreValue(item)]),
    );
  }

  return value;
}

function readData(doc) {
  return unwrapFirestoreValue(doc?.data || {});
}

async function readExportFile(name, fallback = []) {
  try {
    const content = await fs.readFile(path.join(exportDir, `${name}.json`), 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function getEquipoIdFromReference(data) {
  if (!data.equipo) return null;

  if (typeof data.equipo === 'string') {
    return data.equipo.split('/').at(-1);
  }

  return null;
}

function parseEvaluationNumber(collectionId, fallback) {
  const match = String(collectionId || '').match(/-(\d+)$/);
  return match ? Number(match[1]) : fallback || null;
}

function addEquipos(equipos) {
  for (const equipo of equipos) {
    const data = readData(equipo);

    tables.equipos.push({
      id: equipo.id,
      nombre: emptyToNull(data.nombre),
      firebase_path: equipo.path,
      raw_data: data,
    });
  }
}

function addSprintsAndIntegrantes(equipos) {
  for (const equipo of equipos) {
    for (const sprint of equipo.subcollections?.sprints || []) {
      const data = readData(sprint);

      tables.sprints.push({
        id: `${equipo.id}__${sprint.id}`,
        firebase_id: sprint.id,
        equipo_id: equipo.id,
        fecha_inicio: emptyToNull(data.fecha_inicio),
        fecha_fin: emptyToNull(data.fecha_fin),
        sprint_cerrado: emptyToNull(data.sprint_cerrado),
        firebase_path: sprint.path,
        raw_data: data,
      });

      for (const integrante of sprint.subcollections?.Integrantes || []) {
        const integranteData = readData(integrante);

        tables.sprint_integrantes.push({
          id: `${equipo.id}__${sprint.id}__${integrante.id}`,
          firebase_id: integrante.id,
          sprint_id: `${equipo.id}__${sprint.id}`,
          equipo_id: equipo.id,
          nombre: emptyToNull(integranteData.nombre),
          tareas_asignadas: emptyToNull(integranteData.tareasAsignadas),
          tareas_entregadas: emptyToNull(
            integranteData.tareasEntregadas ?? integranteData.tareasEntregadas2,
          ),
          tareas_devueltas: emptyToNull(integranteData.tareasDevueltas),
          calidad_codigo: emptyToNull(integranteData.calidadCodigo),
          total1: emptyToNull(integranteData.total1),
          total2: emptyToNull(integranteData.total2),
          total3: emptyToNull(integranteData.total3),
          total_final: emptyToNull(integranteData.total_final),
          calificacion: emptyToNull(integranteData.calificacion),
          comentarios: emptyToNull(integranteData.comentarios),
          evaluado_por: emptyToNull(integranteData.evaluado_por),
          fecha_evaluacion: emptyToNull(integranteData.fecha_evaluacion),
          firebase_path: integrante.path,
          raw_data: integranteData,
        });
      }
    }
  }
}

function addEvaluaciones(equipos) {
  for (const equipo of equipos) {
    for (const evaluacionRoot of equipo.subcollections?.evaluaciones || []) {
      for (const collections of Object.values(evaluacionRoot.subcollections || {})) {
        for (const collection of collections) {
          const collectionNumber = parseEvaluationNumber(collection.id);

          for (const evaluation of collection.docs || []) {
            const data = readData(evaluation);
            const baseRow = {
              id: `${equipo.id}__${collection.id}__${evaluation.id}`,
              firebase_id: evaluation.id,
              equipo_id: emptyToNull(data.equipoId || equipo.id),
              nombre_ingeniero: emptyToNull(data.nombreIngeniero),
              nombre_evaluador: emptyToNull(data.nombreEvaluador),
              periodo: emptyToNull(data.periodo),
              numero_evaluacion: emptyToNull(data.numeroEvaluacion || collectionNumber),
              fecha: emptyToNull(data.fecha),
              firebase_collection: collection.id,
              firebase_path: evaluation.path,
              raw_data: data,
            };

            if (collection.path.includes('/perfomance/')) {
              tables.performance_evaluaciones.push({
                ...baseRow,
                respuestas: emptyToNull(data.respuestas),
                logros: emptyToNull(data.logros),
                potencial_crecimiento: emptyToNull(data.potencialCrecimiento),
                observaciones_adicionales: emptyToNull(data.observacionesAdicionales),
                retroalimentacion_confirmada: emptyToNull(data.retroalimentacionConfirmada),
              });
            }

            if (collection.path.includes('/one-to-one/')) {
              tables.oto_evaluaciones.push({
                ...baseRow,
                resumen: emptyToNull(data.resumen),
                sintesis_final: emptyToNull(data.sintesisFinal),
                preguntas_reflexion: emptyToNull(data.preguntasReflexion),
                habilidades_blandas: emptyToNull(data.habilidadesBlandas),
              });
            }
          }
        }
      }
    }
  }
}

function addPersonal(personal) {
  for (const person of personal) {
    const data = readData(person);

    tables.personal.push({
      id: person.id,
      nombre: emptyToNull(data.nombre),
      rol: emptyToNull(data.rol),
      correo: emptyToNull(data.correo),
      equipo_id: emptyToNull(getEquipoIdFromReference(data)),
      vacaciones: emptyToNull(data.vacaciones),
      inicio_reemplazo_sprint_id: emptyToNull(data.inicioReemplazoSprintId),
      firebase_path: person.path,
      raw_data: data,
    });
  }
}

function addHistorialRotaciones(rotaciones) {
  for (const rotacion of rotaciones) {
    const data = readData(rotacion);

    tables.historial_rotaciones.push({
      id: rotacion.id,
      fecha: emptyToNull(data.fecha),
      tipo: emptyToNull(data.tipo),
      nombre: emptyToNull(data.nombre),
      personal_id: emptyToNull(data.personalId),
      desde: emptyToNull(data.desde),
      desde_nombre: emptyToNull(data.desdeNombre),
      hacia: emptyToNull(data.hacia),
      hacia_nombre: emptyToNull(data.haciaNombre),
      firebase_path: rotacion.path,
      raw_data: data,
    });
  }
}

function addModulosSidebar(modulos) {
  for (const modulo of modulos) {
    const data = readData(modulo);

    tables.modulos_sidebar.push({
      id: modulo.id,
      nombre: emptyToNull(data.nombre),
      ruta: emptyToNull(data.ruta),
      icon: emptyToNull(data.icon),
      orden: emptyToNull(data.order),
      visible: emptyToNull(data.visible),
      roles_permitidos: emptyToNull(data.rolesPermitidos),
      firebase_path: modulo.path,
      raw_data: data,
    });
  }
}

function addConfigEvaluaciones(configs) {
  for (const config of configs) {
    const data = readData(config);

    tables.config_evaluaciones.push({
      id: config.id,
      secciones: emptyToNull(data.secciones),
      firebase_path: config.path,
      raw_data: data,
    });
  }
}

function addHabilitaciones(habilitaciones) {
  for (const habilitacion of habilitaciones) {
    const data = readData(habilitacion);

    tables.habilitaciones_desempeno.push({
      id: habilitacion.id,
      equipo_id: emptyToNull(data.equipoId),
      nombre_equipo: emptyToNull(data.nombreEquipo),
      nombre_admin: emptyToNull(data.nombreAdmin),
      estado: emptyToNull(data.estado),
      evaluados_count: emptyToNull(data.evaluadosCount),
      total_esperados: emptyToNull(data.totalEsperados),
      fecha_habilitacion: emptyToNull(data.fechaHabilitacion),
      ultima_actualizacion: emptyToNull(data.ultimaActualizacion),
      firebase_path: habilitacion.path,
      raw_data: data,
    });
  }
}

function addSettings(settings) {
  for (const setting of settings) {
    const data = readData(setting);

    tables.settings.push({
      id: setting.id,
      active: emptyToNull(data.active),
      firebase_path: setting.path,
      raw_data: data,
    });
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';

  const serialized =
    typeof value === 'object' ? JSON.stringify(value) : String(value);

  return `"${serialized.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  if (!rows.length) return '';

  const columns = Object.keys(rows[0]);
  const lines = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ];

  return `${lines.join('\n')}\n`;
}

function schemaSql() {
  return `create table if not exists equipos (
  id text primary key,
  nombre text not null,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists personal (
  id text primary key,
  nombre text,
  rol text,
  correo text,
  equipo_id text references equipos(id),
  vacaciones boolean,
  inicio_reemplazo_sprint_id text,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists sprints (
  id text primary key,
  firebase_id text not null,
  equipo_id text not null references equipos(id) on delete cascade,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  sprint_cerrado boolean,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists sprint_integrantes (
  id text primary key,
  firebase_id text not null,
  sprint_id text not null references sprints(id) on delete cascade,
  equipo_id text not null references equipos(id) on delete cascade,
  nombre text,
  tareas_asignadas numeric,
  tareas_entregadas numeric,
  tareas_devueltas numeric,
  calidad_codigo numeric,
  total1 numeric,
  total2 numeric,
  total3 numeric,
  total_final numeric,
  calificacion text,
  comentarios text,
  evaluado_por text,
  fecha_evaluacion timestamptz,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists performance_evaluaciones (
  id text primary key,
  firebase_id text not null,
  equipo_id text references equipos(id),
  nombre_ingeniero text,
  nombre_evaluador text,
  periodo text,
  numero_evaluacion integer,
  fecha timestamptz,
  respuestas jsonb,
  logros text,
  potencial_crecimiento text,
  observaciones_adicionales text,
  retroalimentacion_confirmada boolean,
  firebase_collection text,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists oto_evaluaciones (
  id text primary key,
  firebase_id text not null,
  equipo_id text references equipos(id),
  nombre_ingeniero text,
  nombre_evaluador text,
  periodo text,
  numero_evaluacion integer,
  fecha timestamptz,
  resumen jsonb,
  sintesis_final jsonb,
  preguntas_reflexion jsonb,
  habilidades_blandas jsonb,
  firebase_collection text,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists historial_rotaciones (
  id text primary key,
  fecha timestamptz,
  tipo text,
  nombre text,
  personal_id text,
  desde text,
  desde_nombre text,
  hacia text,
  hacia_nombre text,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists modulos_sidebar (
  id text primary key,
  nombre text,
  ruta text,
  icon text,
  orden integer,
  visible boolean,
  roles_permitidos jsonb,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists config_evaluaciones (
  id text primary key,
  secciones jsonb,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists habilitaciones_desempeno (
  id text primary key,
  equipo_id text references equipos(id),
  nombre_equipo text,
  nombre_admin text,
  estado text,
  evaluados_count integer,
  total_esperados integer,
  fecha_habilitacion timestamptz,
  ultima_actualizacion timestamptz,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists settings (
  id text primary key,
  active boolean,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create index if not exists idx_personal_equipo_id on personal(equipo_id);
create index if not exists idx_sprints_equipo_id on sprints(equipo_id);
create index if not exists idx_sprint_integrantes_sprint_id on sprint_integrantes(sprint_id);
create index if not exists idx_performance_equipo_id on performance_evaluaciones(equipo_id);
create index if not exists idx_oto_equipo_id on oto_evaluaciones(equipo_id);
`;
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const [
    equipos,
    personal,
    historialRotaciones,
    modulosSidebar,
    configEvaluaciones,
    habilitaciones,
    settings,
  ] = await Promise.all([
    readExportFile('equipos'),
    readExportFile('personal'),
    readExportFile('historialRotaciones'),
    readExportFile('modulosSidebar'),
    readExportFile('config_evaluaciones'),
    readExportFile('habilitaciones_desempeno'),
    readExportFile('settings'),
  ]);

  addEquipos(equipos);
  addPersonal(personal);
  addSprintsAndIntegrantes(equipos);
  addEvaluaciones(equipos);
  addHistorialRotaciones(historialRotaciones);
  addModulosSidebar(modulosSidebar);
  addConfigEvaluaciones(configEvaluaciones);
  addHabilitaciones(habilitaciones);
  addSettings(settings);

  await fs.mkdir(tablesDir, { recursive: true });

  for (const [tableName, rows] of Object.entries(tables)) {
    await writeJson(path.join(tablesDir, `${tableName}.json`), rows);
    await fs.writeFile(path.join(tablesDir, `${tableName}.csv`), toCsv(rows), 'utf8');
  }

  const manifest = {
    preparedAt: new Date().toISOString(),
    sourceDir: exportDir,
    outputDir: importDir,
    tables: Object.fromEntries(
      Object.entries(tables).map(([tableName, rows]) => [tableName, { rows: rows.length }]),
    ),
  };

  await fs.writeFile(path.join(importDir, 'schema.sql'), schemaSql(), 'utf8');
  await writeJson(path.join(importDir, 'manifest.json'), manifest);

  console.log(`Import de Supabase preparado en: ${importDir}`);
  for (const [tableName, rows] of Object.entries(tables)) {
    console.log(`- ${tableName}: ${rows.length} filas`);
  }
}

main().catch((error) => {
  console.error('Error preparando import para Supabase:', error);
  process.exit(1);
});
