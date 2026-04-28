import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';

function createAuth(): NextAuthResult {
  return NextAuth({
    providers: [
      Credentials({
        credentials: {
          email:    { label: 'Email',    type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;

          const rows = await sql`
            SELECT id, email, name, password_hash
            FROM   users
            WHERE  LOWER(email) = LOWER(${credentials.email as string})
            LIMIT  1
          `;
          const user = rows[0];
          if (!user) return null;

          const valid = await bcrypt.compare(credentials.password as string, user.password_hash as string);
          if (!valid) return null;

          return { id: String(user.id), name: user.name as string, email: user.email as string };
        },
      }),
    ],
    pages:   { signIn: '/login' },
    session: { strategy: 'jwt' },
  });
}

let _instance: NextAuthResult | undefined;

function getInstance(): NextAuthResult {
  if (!_instance) _instance = createAuth();
  return _instance;
}

export const handlers: NextAuthResult['handlers'] = new Proxy(
  {} as NextAuthResult['handlers'],
  { get: (_t, prop) => (getInstance().handlers as Record<string, unknown>)[prop as string] }
);

export const auth    = ((...args: Parameters<NextAuthResult['auth']>) =>
  (getInstance().auth as (...a: Parameters<NextAuthResult['auth']>) => unknown)(...args)) as NextAuthResult['auth'];

export const signIn  = ((...args: unknown[]) =>
  (getInstance().signIn as (...a: unknown[]) => unknown)(...args)) as NextAuthResult['signIn'];

export const signOut = ((...args: unknown[]) =>
  (getInstance().signOut as (...a: unknown[]) => unknown)(...args)) as NextAuthResult['signOut'];
