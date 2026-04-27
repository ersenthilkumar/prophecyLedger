import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

const sql = neon(process.env.DATABASE_URL);

const statements = raw
  .replace(/--[^\n]*/g, '')   // strip line comments
  .split(';')
  .map(s => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
  console.log('✓', statement.slice(0, 70).replace(/\s+/g, ' '));
}

console.log('\nSchema ready.');
