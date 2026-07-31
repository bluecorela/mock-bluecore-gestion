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
  teams: [],
  personnel: [],
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

function getTeamIdFromReference(data) {
  if (!data.team) return null;

  if (typeof data.team === 'string') {
    return data.team.split('/').at(-1);
  }

  return null;
}

function parseEvaluationNumber(collectionId, fallback) {
  const match = String(collectionId || '').match(/-(\d+)$/);
  return match ? Number(match[1]) : fallback || null;
}

function addTeams(teams) {
  for (const team of teams) {
    const data = readData(team);

    tables.teams.push({
      id: team.id,
      name: emptyToNull(data.name),
      firebase_path: team.path,
      raw_data: data,
    });
  }
}

function addSprintsAndMembers(teams) {
  for (const team of teams) {
    for (const sprint of team.subcollections?.sprints || []) {
      const data = readData(sprint);

      tables.sprints.push({
        id: `${team.id}__${sprint.id}`,
        firebase_id: sprint.id,
        equipo_id: team.id,
        fecha_inicio: emptyToNull(data.fecha_inicio),
        fecha_fin: emptyToNull(data.fecha_fin),
        sprint_cerrado: emptyToNull(data.sprint_cerrado),
        firebase_path: sprint.path,
        raw_data: data,
      });

      for (const member of sprint.subcollections?.Integrantes || []) {
        const memberData = readData(member);

        tables.sprint_integrantes.push({
          id: `${team.id}__${sprint.id}__${member.id}`,
          firebase_id: member.id,
          sprint_id: `${team.id}__${sprint.id}`,
          equipo_id: team.id,
          name: emptyToNull(memberData.name),
          tareas_asignadas: emptyToNull(memberData.assignedTasks),
          tareas_entregadas: emptyToNull(
            memberData.deliveredTasks ?? memberData.deliveredTasksAlternative,
          ),
          tareas_devueltas: emptyToNull(memberData.returnedTasks),
          calidad_codigo: emptyToNull(memberData.codeQuality),
          total1: emptyToNull(memberData.total1),
          total2: emptyToNull(memberData.total2),
          total3: emptyToNull(memberData.total3),
          total_final: emptyToNull(memberData.total_final),
          rating: emptyToNull(memberData.rating),
          comments: emptyToNull(memberData.comments),
          evaluado_por: emptyToNull(memberData.evaluado_por),
          fecha_evaluacion: emptyToNull(memberData.fecha_evaluacion),
          firebase_path: member.path,
          raw_data: memberData,
        });
      }
    }
  }
}

function addEvaluations(teams) {
  for (const team of teams) {
    for (const evaluationRoot of team.subcollections?.evaluations || []) {
      for (const collections of Object.values(evaluationRoot.subcollections || {})) {
        for (const collection of collections) {
          const collectionNumber = parseEvaluationNumber(collection.id);

          for (const evaluation of collection.docs || []) {
            const data = readData(evaluation);
            const baseRow = {
              id: `${team.id}__${collection.id}__${evaluation.id}`,
              firebase_id: evaluation.id,
              equipo_id: emptyToNull(data.teamId || team.id),
              nombre_ingeniero: emptyToNull(data.engineerName),
              nombre_evaluador: emptyToNull(data.evaluatorName),
              period: emptyToNull(data.period),
              numero_evaluacion: emptyToNull(data.evaluationNumber || collectionNumber),
              date: emptyToNull(data.date),
              firebase_collection: collection.id,
              firebase_path: evaluation.path,
              raw_data: data,
            };

            if (collection.path.includes('/perfomance/')) {
              tables.performance_evaluaciones.push({
                ...baseRow,
                answers: emptyToNull(data.answers),
                achievements: emptyToNull(data.achievements),
                potencial_crecimiento: emptyToNull(data.growthPotential),
                observaciones_adicionales: emptyToNull(data.additionalObservations),
                retroalimentacion_confirmada: emptyToNull(data.feedbackConfirmed),
              });
            }

            if (collection.path.includes('/one-to-one/')) {
              tables.oto_evaluaciones.push({
                ...baseRow,
                summary: emptyToNull(data.summary),
                sintesis_final: emptyToNull(data.finalSummary),
                preguntas_reflexion: emptyToNull(data.reflectionQuestions),
                habilidades_blandas: emptyToNull(data.softSkills),
              });
            }
          }
        }
      }
    }
  }
}

function addPersonnel(personnel) {
  for (const person of personnel) {
    const data = readData(person);

    tables.personnel.push({
      id: person.id,
      name: emptyToNull(data.name),
      role: emptyToNull(data.role),
      email: emptyToNull(data.email),
      equipo_id: emptyToNull(getTeamIdFromReference(data)),
      onVacation: emptyToNull(data.onVacation),
      inicio_reemplazo_sprint_id: emptyToNull(data.replacementStartSprintId),
      firebase_path: person.path,
      raw_data: data,
    });
  }
}

function addRotationHistoryRecords(rotations) {
  for (const rotation of rotations) {
    const data = readData(rotation);

    tables.historial_rotaciones.push({
      id: rotation.id,
      date: emptyToNull(data.date),
      tipo: emptyToNull(data.tipo),
      name: emptyToNull(data.name),
      personal_id: emptyToNull(data.personnelId),
      desde: emptyToNull(data.desde),
      desde_nombre: emptyToNull(data.sourceName),
      hacia: emptyToNull(data.hacia),
      hacia_nombre: emptyToNull(data.destinationName),
      firebase_path: rotation.path,
      raw_data: data,
    });
  }
}

function addSidebarModules(modules) {
  for (const moduleItem of modules) {
    const data = readData(moduleItem);

    tables.modulos_sidebar.push({
      id: moduleItem.id,
      name: emptyToNull(data.name),
      ruta: emptyToNull(data.ruta),
      icon: emptyToNull(data.icon),
      orden: emptyToNull(data.order),
      visible: emptyToNull(data.visible),
      roles_permitidos: emptyToNull(data.allowedRoles),
      firebase_path: moduleItem.path,
      raw_data: data,
    });
  }
}

function addEvaluationConfigs(configs) {
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

function addEnablements(enablements) {
  for (const enablement of enablements) {
    const data = readData(enablement);

    tables.habilitaciones_desempeno.push({
      id: enablement.id,
      equipo_id: emptyToNull(data.teamId),
      nombre_equipo: emptyToNull(data.teamName),
      nombre_admin: emptyToNull(data.adminName),
      status: emptyToNull(data.status),
      evaluados_count: emptyToNull(data.evaluadosCount),
      total_esperados: emptyToNull(data.totalExpected),
      fecha_habilitacion: emptyToNull(data.enabledAt),
      ultima_actualizacion: emptyToNull(data.ultimaActualizacion),
      firebase_path: enablement.path,
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
  return `create table if not exists teams (
  id text primary key,
  name text not null,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists personnel (
  id text primary key,
  name text,
  role text,
  email text,
  equipo_id text references teams(id),
  onVacation boolean,
  inicio_reemplazo_sprint_id text,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists sprints (
  id text primary key,
  firebase_id text not null,
  equipo_id text not null references teams(id) on delete cascade,
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
  equipo_id text not null references teams(id) on delete cascade,
  name text,
  tareas_asignadas numeric,
  tareas_entregadas numeric,
  tareas_devueltas numeric,
  calidad_codigo numeric,
  total1 numeric,
  total2 numeric,
  total3 numeric,
  total_final numeric,
  rating text,
  comments text,
  evaluado_por text,
  fecha_evaluacion timestamptz,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists performance_evaluaciones (
  id text primary key,
  firebase_id text not null,
  equipo_id text references teams(id),
  nombre_ingeniero text,
  nombre_evaluador text,
  period text,
  numero_evaluacion integer,
  date timestamptz,
  answers jsonb,
  achievements text,
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
  equipo_id text references teams(id),
  nombre_ingeniero text,
  nombre_evaluador text,
  period text,
  numero_evaluacion integer,
  date timestamptz,
  summary jsonb,
  sintesis_final jsonb,
  preguntas_reflexion jsonb,
  habilidades_blandas jsonb,
  firebase_collection text,
  firebase_path text,
  raw_data jsonb not null default '{}'::jsonb
);

create table if not exists historial_rotaciones (
  id text primary key,
  date timestamptz,
  tipo text,
  name text,
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
  name text,
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
  equipo_id text references teams(id),
  nombre_equipo text,
  nombre_admin text,
  status text,
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

create index if not exists idx_personal_equipo_id on personnel(equipo_id);
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
    teams,
    personnel,
    rotationHistoryRecords,
    sidebarModules,
    evaluationConfigs,
    enablements,
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

  addTeams(teams);
  addPersonnel(personnel);
  addSprintsAndMembers(teams);
  addEvaluations(teams);
  addRotationHistoryRecords(rotationHistoryRecords);
  addSidebarModules(sidebarModules);
  addEvaluationConfigs(evaluationConfigs);
  addEnablements(enablements);
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
