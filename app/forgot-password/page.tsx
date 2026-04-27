import { connection } from 'next/server';
import ForgotPasswordForm from './ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  await connection();
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060D24] via-[#0A1540] to-[#060D24] flex items-center justify-center px-4">
      <ForgotPasswordForm />
    </div>
  );
}
