import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  const url = req.nextUrl.pathname;

  // Gestion CORS pour API
  if (url.startsWith('/api')) {
    // Votre code CORS existant...
    return NextResponse.next();
  }

  // Routes protégées
  const protectedPaths = ['/me', '/address', '/cart', '/shipping'];
  const isProtected = protectedPaths.some((path) => url.startsWith(path));

  if (isProtected) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/me/:path*', '/address/:path*', '/cart', '/shipping'],
};
