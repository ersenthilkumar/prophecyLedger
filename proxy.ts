import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isPublic   = PUBLIC_PATHS.some(p => req.nextUrl.pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (isLoggedIn && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }
});

export const config = {
  // Plaid webhook excluded from matcher (commented out): 'api/plaid/webhook|'
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
