const { createClient } = require('@supabase/supabase-js');

try {
  require('dotenv').config({ quiet: true });
} catch {}

const tables = [
  'teams',
  'employees',
  'sprints',
  'sprint_members',
  'performance_evaluaciones',
  'oto_evaluations',
  'rotations_history',
  'modules_sidebar',
  'config_evaluations',
  'performance_ qualifications',
  'settings',
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

  const supabase = createClient(requireEnv('SUPABASE_URL'), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('Conexion con Supabase OK. Conteos:');

  for (const table of tables) {
    const count = await countRows(supabase, table);
    console.log(`- ${table}: ${count}`);
  }
}

main().catch((error) => {
  console.error('No se pudo validar Supabase:', error.message);
  process.exit(1);
});
