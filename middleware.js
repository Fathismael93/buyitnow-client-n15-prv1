/* eslint-disable prettier/prettier */
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  async function middleware(req) {
    // authorize roles
    const url = req.nextUrl.pathname;
    const user = req?.nextauth?.token?.user;

    if (url.startsWith('/api')) {
      // Pour les requêtes preflight OPTIONS
      if (req.method === 'OPTIONS') {
        const response = new NextResponse(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': `www.google.fr`, // ou vos domaines spécifiques
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
      response.headers.set('Access-Control-Allow-Origin', `www.google.fr`); // ou vos domaines spécifiques
      return response;
    }

    if (
      url?.startsWith('/me') ||
      url?.startsWith('/address') ||
      url?.startsWith('/cart') ||
      url?.startsWith('/shipping')
    ) {
      if (!user) {
        return NextResponse.redirect(new URL('/', req.url));
      }
      return NextResponse.next();
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        if (!token) {
          return false;
        }
        return !!token; // Renvoyer explicitement vrai si token existe
      },
    },
  },
);

export const config = {
  matcher: ['/me/:path*', '/address/:path*', '/cart', '/shipping'],
};
