import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDatabase() {
  try {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    throw err;
  }
}
