import type { NextAuthConfig } from 'next-auth';

// Edge-compatible config used by the proxy (no Node.js-only modules).
// The Credentials provider is added only in auth.ts (Node.js runtime).
const authConfig: NextAuthConfig = {
  pages:   { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [],
};

export default authConfig;
