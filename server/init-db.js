import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDatabase() {
  try {
    // Migrate: drop old users table if it has google_id (from OAuth era)
    // Migrate: drop old users table if schema has changed
    const checkCol = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('google_id', 'email')
      AND table_schema = 'public'
    `);
    const cols = checkCol.rows.map(r => r.column_name);
    const needsNameUnique = await pool.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'users' AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%email%'
    `);
    if (cols.includes('google_id') || needsNameUnique.rows.length > 0) {
      console.log('Migrating users table from Google OAuth to email OTP...');
      await pool.query('DROP TABLE IF EXISTS progress CASCADE');
      await pool.query('DROP TABLE IF EXISTS uploads CASCADE');
      await pool.query('DROP TABLE IF EXISTS users CASCADE');
    }

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    throw err;
  }
}
