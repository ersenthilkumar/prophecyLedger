'use server';

import crypto from 'crypto';
import { sql } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/mailer';

export async function requestResetAction(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!email) return { ok: false, message: 'Email is required.' };

  // Always return the same message to avoid user enumeration
  const neutral = { ok: true, message: 'If that email is registered, a reset link has been sent.' };

  const rows = await sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  if (!rows[0]) return neutral;

  const userId = rows[0].id as number;

  // Invalidate any existing unused tokens for this user
  await sql`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = ${userId} AND used = FALSE`;

  // Generate token
  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash  = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt  = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password?token=${plainToken}`;

  await sendPasswordResetEmail(email, resetUrl);

  return neutral;
}
