/* eslint-disable prettier/prettier */
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  async function middleware(req) {
    // authorize roles
    const url = req.nextUrl.pathname;
    const user = req?.nextauth?.token?.user;

    if (url.startsWith('/api')) {
      NextResponse.next().headers.append('Access-Control-Allow-Origin', '*');
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
