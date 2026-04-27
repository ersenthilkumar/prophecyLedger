'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function loginAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  try {
    await signIn('credentials', {
      email:      formData.get('email'),
      password:   formData.get('password'),
      redirectTo: '/',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return 'Invalid email or password.';
    }
    throw err; // re-throw Next.js redirect
  }
  return null;
}
