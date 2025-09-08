import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  const url = req.nextUrl.pathname;

  // Log pour debug (à retirer après)
  console.log('Middleware - Path:', url);

  // Ignorer les routes API et auth
  if (url.startsWith('/api/') || url.includes('/auth/')) {
    return NextResponse.next();
  }

  // Routes protégées
  const protectedPaths = ['/me', '/address', '/cart', '/shipping'];
  const isProtected = protectedPaths.some((path) => url.startsWith(path));

  if (isProtected) {
    try {
      // Utiliser la même configuration que NextAuth
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
        // Important : spécifier le nom du cookie
        cookieName:
          process.env.NODE_ENV === 'production'
            ? '__Secure-next-auth.session-token'
            : 'next-auth.session-token',
      });

      console.log('Middleware - Token found:', !!token); // Debug

      if (!token) {
        // Vérifier aussi le cookie alternatif
        const altToken = await getToken({
          req,
          secret: process.env.NEXTAUTH_SECRET,
          cookieName: 'next-auth.session-token',
        });

        console.log('Middleware - Alt token found:', !!altToken); // Debug

        if (!altToken) {
          const loginUrl = new URL('/login', req.url);
          loginUrl.searchParams.set('callbackUrl', url);
          return NextResponse.redirect(loginUrl);
        }
      }
    } catch (error) {
      console.error('Middleware error:', error);
      // En cas d'erreur, laisser passer pour éviter un blocage total
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, etc.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|images).*)',
  ],
};
