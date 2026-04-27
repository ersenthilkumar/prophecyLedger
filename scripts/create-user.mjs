// Create a ProphecyLedger user (invite-only signup helper).
// Reads DATABASE_URL from .env.local, prompts for a password (hidden), bcrypts it, inserts the row.
//
// Usage:
//   node scripts/create-user.mjs alice@example.com "Alice Johnson"
//
// Point at production by setting DATABASE_URL inline:
//   DATABASE_URL="postgres://..." node scripts/create-user.mjs alice@example.com "Alice"

import 'dotenv/config';
import readline from 'node:readline';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const [, , emailArg, nameArg] = process.argv;

if (!emailArg || !nameArg) {
  console.error('Usage: node scripts/create-user.mjs <email> "<full name>"');
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const name = nameArg.trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`Invalid email: ${email}`);
  process.exit(1);
}
if (name.length < 2) {
  console.error('Name must be at least 2 characters.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env.local or pass inline.');
  process.exit(1);
}

function promptPassword(label) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Mute echoed characters so the password isn't visible.
    rl._writeToOutput = (str) => {
      if (str.includes(label)) rl.output.write(str);
      else if (str === '\n' || str === '\r\n') rl.output.write(str);
      else rl.output.write('*');
    };
    rl.question(label, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.on('close', () => {});
    rl.on('SIGINT', () => reject(new Error('Cancelled.')));
  });
}

const password  = await promptPassword(`Password for ${email}: `);
if (password.length < 8) {
  console.error('\nPassword must be at least 8 characters.');
  process.exit(1);
}
const password2 = await promptPassword('Confirm password: ');
if (password !== password2) {
  console.error('\nPasswords do not match.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const existing = await sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
if (existing[0]) {
  console.error(`\nA user with email "${email}" already exists.`);
  process.exit(1);
}

const password_hash = await bcrypt.hash(password, 10);
const rows = await sql`
  INSERT INTO users (email, name, password_hash)
  VALUES (${email}, ${name}, ${password_hash})
  RETURNING id, email, name
`;

console.log(`\n✓ Created user #${rows[0].id}: ${rows[0].name} <${rows[0].email}>`);
