import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sqlDir = path.join(root, 'sql');
const dbName = process.env.DB_NAME || 'lms_db';
const resetDb = (process.env.RESET_DB || '').toLowerCase() === 'true';
const loadDemo = (process.env.LOAD_DEMO_DATA || '').toLowerCase() === 'true';
if (['postgres', 'template0', 'template1'].includes(dbName)) {
  throw new Error(`Захищену системну базу ${dbName} не можна використовувати як DB_NAME.`);
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function maintenanceUrl() {
  if (process.env.ADMIN_DATABASE_URL) return process.env.ADMIN_DATABASE_URL;
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres';
    return url.toString();
  }
  throw new Error('Задайте ADMIN_DATABASE_URL або DATABASE_URL у .env.');
}

async function runSqlFile(client, filename) {
  const fullPath = path.join(sqlDir, filename);
  const source = await fs.readFile(fullPath, 'utf8');
  console.log(`→ ${filename}`);
  await client.query('BEGIN');
  try {
    await client.query(source);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Помилка у файлі ${filename}: ${error.message}`, { cause: error });
  }
}

async function main() {
  const admin = new Client({ connectionString: maintenanceUrl() });
  await admin.connect();
  let createdOrReset = false;

  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount && resetDb) {
      console.warn(`RESET_DB=true: база ${dbName} буде видалена разом з усіма даними.`);
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [dbName],
      );
      await admin.query(`DROP DATABASE ${quoteIdentifier(dbName)}`);
    } else if (exists.rowCount) {
      const check = new Client({
        connectionString: (() => {
          const url = new URL(maintenanceUrl());
          url.pathname = `/${dbName}`;
          return url.toString();
        })(),
      });
      await check.connect();
      try {
        const schema = await check.query("SELECT to_regclass('public.users') AS users_table");
        if (schema.rows[0]?.users_table) {
          throw new Error(
            `У базі ${dbName} вже є таблиця users. Щоб не перезаписати дані, ініціалізацію зупинено.`,
          );
        }
      } finally {
        await check.end();
      }
    }

    const existsAfterReset = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!existsAfterReset.rowCount) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
      createdOrReset = true;
    } else if (resetDb) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
      createdOrReset = true;
    }
  } finally {
    await admin.end();
  }

  const databaseUrl = (() => {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const url = new URL(maintenanceUrl());
    url.pathname = `/${dbName}`;
    return url.toString();
  })();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const files = [
      '01_schema.sql',
      '02_functions.sql',
      '03_triggers.sql',
      '04_views.sql',
      '05_procedures.sql',
      '06_indexes.sql',
      '07_seed.sql',
    ];
    if (loadDemo) files.push('08_demo_data_optional.sql');

    for (const filename of files) await runSqlFile(client, filename);
    console.log(`База ${dbName} ініціалізована.`);
    if (loadDemo) console.log('Демо-дані додані (парольні хеші в них фіктивні).');
  } catch (error) {
    console.error(error.message);
    if (createdOrReset) {
      console.error('База залишилася створеною, але ініціалізація перервалася. Виправте помилку й запустіть RESET_DB=true для чистого повтору.');
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
