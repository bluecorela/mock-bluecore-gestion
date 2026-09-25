const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');

const externalEnvKeys = new Set(Object.keys(process.env));
for (const path of [
  '.env',
  `.env.${process.env.NODE_ENV || 'development'}`,
  `.env.${process.env.NODE_ENV || 'development'}.local`,
]) {
  if (!fs.existsSync(path)) continue;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || externalEnvKeys.has(match[1])) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

const tables = [
  'clients',
  'projects',
  'teams',
  'team_projects',
  'roles',
  'employees',
  'employee_roles',
  'team_memberships',
  'employee_absences',
  'team_rotation_events',
  'sprints',
  'sprint_member_metrics',
  'team_weekly_reports',
  'performance_evaluations',
  'one_to_one_sessions',
  'sidebar_modules',
  'app_settings',
];

const requiredFunctions = [
  'create_sprint_with_stories',
  'create_employee_with_assignments',
  'manage_employee_movement',
  'save_performance_evaluation',
  'save_sidebar_module',
  'save_sprint_evaluation',
  'save_weekly_report',
  'update_employee_with_assignments',
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} es obligatorio`);
  }
  return value;
}

function getJwtRole(token) {
  const [, payload] = String(token).split('.');
  if (!payload) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    return decoded.role || null;
  } catch {
    return null;
  }
}

async function countRows(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(
      `${table}: ${JSON.stringify({
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })}`,
    );
  }

  return count ?? 0;
}

async function verifyRpcSchema(url, serviceRoleKey, schema) {
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Accept-Profile': schema,
      Accept: 'application/openapi+json',
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudo leer el contrato OpenAPI de ${schema}: HTTP ${response.status}`);
  }

  const document = await response.json();
  const paths = document.paths || {};
  const missing = requiredFunctions.filter((name) => !paths[`/rpc/${name}`]);
  if (missing.length) {
    throw new Error(`Faltan funciones RPC en ${schema}: ${missing.join(', ')}`);
  }
  console.log(`- RPC requeridas: ${requiredFunctions.length}/${requiredFunctions.length}`);
}

async function verifyIntegrity(database) {
  const { data: memberships, error: membershipError } = await database
    .from('team_memberships')
    .select('team_id,employee_id')
    .eq('is_active', true);
  if (membershipError) throw membershipError;
  const membershipKeys = new Set();
  for (const item of memberships || []) {
    const key = `${item.team_id}:${item.employee_id}`;
    if (membershipKeys.has(key)) throw new Error(`Membresía activa duplicada: ${key}`);
    membershipKeys.add(key);
  }

  const { data: sprints, error: sprintError } = await database
    .from('sprints')
    .select('team_id')
    .eq('status', 'in_progress');
  if (sprintError) throw sprintError;
  const activeSprintTeams = new Set();
  for (const sprint of sprints || []) {
    if (activeSprintTeams.has(sprint.team_id)) {
      throw new Error(`Más de un sprint activo para el equipo ${sprint.team_id}`);
    }
    activeSprintTeams.add(sprint.team_id);
  }

  const { data: employees, error: employeeError } = await database
    .from('employees')
    .select('email')
    .is('deleted_at', null);
  if (employeeError) throw employeeError;
  const emails = new Set();
  for(const employee of employees || []) {
    const email = employee.email.toLowerCase();
    if (emails.has(email)) throw new Error(`Correo activo duplicado: ${email}`);
    emails.add(email);
  }

  console.log('- Integridad: membresías, sprints activos y correos válidos');
}

async function main() {
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const jwtRole = getJwtRole(serviceRoleKey);

  if (serviceRoleKey.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY contiene una publishable key. Debes usar una secret key sb_secret_... o la legacy service_role.',
    );
  }

  if (jwtRole && jwtRole !== 'service_role') {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY tiene role "${jwtRole}". Debes usar la service_role key, no anon.`,
    );
  }

  const schema = process.env.SUPABASE_V2_SCHEMA || 'bluecore_v2';
  const url = requireEnv('SUPABASE_URL');
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const database = supabase.schema(schema);
  const { error: connectionError } = await database
    .from('teams')
    .select('id', { head: true });
  if (connectionError)
    throw new Error(
      `No se pudo acceder al esquema ${schema}: ${connectionError.message}`,
    );
  console.log(`Conexion con Supabase OK. Esquema: ${schema}. Conteos:`);

  for (const table of tables) {
    const count = await countRows(database, table);
    console.log(`- ${table}: ${count}`);
  }

  await verifyRpcSchema(url, serviceRoleKey, schema);
  await verifyIntegrity(database);
}

main().catch((error) => {
  console.error('No se pudo validar Supabase:', error.message);
  process.exit(1);
});
