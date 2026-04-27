import { connection } from 'next/server';
import { Suspense } from 'react';
import ResetPasswordForm from './ResetPasswordForm';

export default async function ResetPasswordPage() {
  await connection();
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060D24] via-[#0A1540] to-[#060D24] flex items-center justify-center px-4">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
