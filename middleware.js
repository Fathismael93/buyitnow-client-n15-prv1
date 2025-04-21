import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { createCsrfMiddleware } from '@edge-csrf/nextjs';

// Configuration CSRF
const csrfProtection = createCsrfMiddleware({
  cookie: {
    name: 'csrf-token',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  },
});

// Middleware combiné (auth + CSRF)
async function middleware(req) {
  // Appliquer la protection CSRF d'abord
  const csrfResponse = await csrfProtection(req);

  // Si le middleware CSRF a renvoyé une réponse (erreur), la retourner
  if (csrfResponse) {
    return csrfResponse;
  }

  // Les routes API nécessitent un traitement CORS
  const url = req.nextUrl.pathname;
  if (url.startsWith('/api')) {
    // Pour les requêtes preflight OPTIONS
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': `${process.env.NEXT_PUBLIC_API_URL}`,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400', // 24 heures
        },
      });
      return response;
    }

    // Pour les requêtes normales
    const response = NextResponse.next();
    response.headers.set(
      'Access-Control-Allow-Origin',
      `${process.env.NEXT_PUBLIC_API_URL}`,
    );
    return response;
  }

  // Vérification des routes protégées par authentification
  if (
    url?.startsWith('/me') ||
    url?.startsWith('/address') ||
    url?.startsWith('/cart') ||
    url?.startsWith('/shipping')
  ) {
    const user = req?.nextauth?.token?.user;
    if (!user) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}

// Appliquer l'authentification à certaines routes
const authMiddleware = withAuth(middleware, {
  callbacks: {
    authorized: ({ token }) => {
      if (!token) {
        return false;
      }
      return !!token;
    },
  },
});

export default authMiddleware;

// Mettre à jour le matcher pour inclure les routes qui nécessitent une protection CSRF
export const config = {
  matcher: [
    '/me/:path*',
    '/address/:path*',
    '/cart',
    '/shipping',
    '/login',
    '/register',
    '/api/:path*', // Protéger toutes les routes API
  ],
};
