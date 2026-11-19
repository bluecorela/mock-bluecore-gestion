const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

for (const envPath of ['.env', `.env.${process.env.NODE_ENV || 'development'}`]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
  }
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error('SUPABASE_DB_URL es obligatorio para administrar migraciones SQL');
}

const migrationsDirectory = path.join(__dirname, 'migrations');
const migrations = fs.readdirSync(migrationsDirectory)
  .filter((name) => /^\d{8}_[a-z0-9_]+\.sql$/.test(name))
  .sort()
  .map((name) => {
    const sql = fs.readFileSync(path.join(migrationsDirectory, name), 'utf8');
    return {
      name,
      sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
    };
  });

const dryRun = process.argv.includes('--dry-run');
const sslMode = new URL(connectionString).searchParams.get('sslmode') || 'require';
const client = new Client({
  connectionString,
  ssl: sslMode === 'disable'
    ? false
    : { rejectUnauthorized: sslMode === 'verify-full' },
});

async function main() {
  await client.connect();
  await client.query("select pg_advisory_lock(hashtext('bluecore_v2.schema_migrations'))");
  try {
    const registryExists = await client.query(
      "select to_regclass('bluecore_v2.schema_migrations') is not null as exists",
    );
    const applied = new Map();
    if (registryExists.rows[0].exists) {
      const result = await client.query(
        'select filename, checksum from bluecore_v2.schema_migrations order by filename',
      );
      for (const row of result.rows) applied.set(row.filename, row.checksum);
    } else if (!dryRun) {
      await client.query(`
        create table bluecore_v2.schema_migrations (
          filename text primary key,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `);
    }

    for (const migration of migrations) {
      const storedChecksum = applied.get(migration.name);
      if (storedChecksum && storedChecksum !== migration.checksum) {
        throw new Error(`La migración aplicada ${migration.name} cambió de contenido`);
      }
      if (storedChecksum) {
        console.log(`OK       ${migration.name}`);
        continue;
      }
      if (dryRun) {
        console.log(`PENDIENTE ${migration.name}`);
        continue;
      }

      console.log(`APLICANDO ${migration.name}`);
      await client.query(migration.sql);
      await client.query(
        'insert into bluecore_v2.schema_migrations (filename, checksum) values ($1, $2)',
        [migration.name, migration.checksum],
      );
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('bluecore_v2.schema_migrations'))");
    await client.end();
  }
}

main().catch((error) => {
  console.error('No se pudieron administrar las migraciones:', error.message);
  process.exitCode = 1;
});
