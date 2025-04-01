import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';

const auth = {
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        dbConnect();

        const { email, password } = credentials;

        const user = await User.findOne({ email }).select('+password');

        if (!user) {
          throw new Error('Invalid Email or Password');
        }

        const isPasswordMatched = await bcrypt.compare(password, user.password);

        if (!isPasswordMatched) {
          throw new Error('Invalid Email or Password');
        }

        return user;
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      user && (token.user = user);

      console.log('token.user: ');
      console.log(token.user);

      /****** In Development Mode, url is "/api/auth/session?update" ******/
      /****** In Production Mode, url is "/api/auth/session?update=" ******/

      // console.log('Updating URL');
      // console.log(req);

      // if (NextRequest?.nextUrl?.pathname === '/api/auth/session?update=') {
      //   const updatedUser = await User.findById(token.user._id);

      //   token.user = updatedUser;
      // }

      return token;
    },
    session: async ({ session, token }) => {
      session.user = token.user;

      // delete password from session
      delete session?.user?.password;

      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(auth);
export { handler as GET, handler as POST, auth };
