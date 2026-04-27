import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY must be set in .env.local');
}

const resend = new Resend(process.env.RESEND_API_KEY);
const MAIL_FROM = process.env.MAIL_FROM ?? 'ProphecyLedger <onboarding@resend.dev>';

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject: 'Reset your ProphecyLedger password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#60a5fa,#6366f1);font-weight:900;color:#fff;font-size:16px;">PC</div>
          <h1 style="margin:12px 0 4px;font-size:18px;color:#0f172a;">Prophecy Capital</h1>
          <p style="margin:0;font-size:11px;color:#94a3b8;letter-spacing:0.1em;">PROPHECYLEDGER · LOAN TRACKING</p>
        </div>
        <h2 style="font-size:16px;color:#1e293b;margin:0 0 8px;">Reset your password</h2>
        <p style="font-size:14px;color:#475569;margin:0 0 24px;line-height:1.6;">
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}" style="display:block;text-align:center;background:#6366f1;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:13px 24px;border-radius:10px;">
          Reset Password
        </a>
        <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;line-height:1.6;">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
        <p style="font-size:11px;color:#cbd5e1;margin:8px 0 0;">
          ${resetUrl}
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}
