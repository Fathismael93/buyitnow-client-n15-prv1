import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default withAuth(
  async function middleware(req) {
    const url = req.nextUrl.pathname;

    // Gestion des API avec CORS
    if (url.startsWith('/api')) {
      if (req.method === 'OPTIONS') {
        const response = new NextResponse(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': `${process.env.NEXT_PUBLIC_API_URL}`,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Max-Age': '86400',
          },
        });
        return response;
      }

      const response = NextResponse.next();
      response.headers.set(
        'Access-Control-Allow-Origin',
        `${process.env.NEXT_PUBLIC_API_URL}`,
      );
      return response;
    }

    // Routes protégées
    if (
      url?.startsWith('/me') ||
      url?.startsWith('/address') ||
      url?.startsWith('/cart') ||
      url?.startsWith('/shipping')
    ) {
      // Essayer de récupérer le token avec getToken pour plus de fiabilité
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      });

      // Si pas de token, essayer une fois de plus avec un petit délai
      if (!token) {
        // Attendre 100ms et réessayer (pour gérer la race condition)
        await new Promise((resolve) => setTimeout(resolve, 100));
        const retryToken = await getToken({
          req,
          secret: process.env.NEXTAUTH_SECRET,
        });

        if (!retryToken) {
          return NextResponse.redirect(new URL('/login', req.url));
        }
      }

      return NextResponse.next();
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Toujours retourner true ici, la logique est gérée dans le middleware
        return true;
      },
    },
    secret: process.env.NEXTAUTH_SECRET, // Explicitement définir le secret
  },
);

export const config = {
  matcher: ['/me/:path*', '/address/:path*', '/cart', '/shipping'],
};
