import 'dotenv/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/types.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Не задано DATABASE_URL. Скопіюйте .env.example у .env і вкажіть пароль PostgreSQL.');
}

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDb(): Promise<void> {
  await db.destroy();
}
