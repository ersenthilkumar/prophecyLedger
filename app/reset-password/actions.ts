'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';

export async function resetPasswordAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const token    = (formData.get('token')    as string | null)?.trim() ?? '';
  const password = (formData.get('password') as string | null) ?? '';
  const confirm  = (formData.get('confirm')  as string | null) ?? '';

  if (!token)               return 'Invalid or missing reset token.';
  if (password.length < 8)  return 'Password must be at least 8 characters.';
  if (password !== confirm)  return 'Passwords do not match.';

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const rows = await sql`
    SELECT id, user_id, expires_at, used
    FROM   password_reset_tokens
    WHERE  token_hash = ${tokenHash}
    LIMIT  1
  `;

  const record = rows[0];
  if (!record)                              return 'Reset link is invalid.';
  if (record.used)                          return 'This reset link has already been used.';
  if (new Date(record.expires_at) < new Date()) return 'Reset link has expired. Please request a new one.';

  const hash = await bcrypt.hash(password, 12);

  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${record.user_id}`;
  await sql`UPDATE password_reset_tokens SET used = TRUE WHERE id = ${record.id}`;

  redirect('/login?reset=1');
}
