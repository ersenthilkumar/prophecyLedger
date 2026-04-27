/**
 * Creates a user in the ProphecyLedger users table.
 *
 * Usage:
 *   npx tsx scripts/create-user.ts <email> <name> <password>
 *
 * Example:
 *   npx tsx scripts/create-user.ts kumar@prophecytechs.com "Kumar" "secret123"
 */

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const [, , email, name, password] = process.argv;

if (!email || !name || !password) {
  console.error('Usage: npx tsx scripts/create-user.ts <email> <name> <password>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env.local');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const hash = await bcrypt.hash(password, 12);

  await sql`
    INSERT INTO users (email, name, password_hash)
    VALUES (${email}, ${name}, ${hash})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
  `;

  console.log(`✓ User created: ${email} (${name})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
