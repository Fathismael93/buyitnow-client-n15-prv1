import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcryptjs from 'bcryptjs';
import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import { validateLogin } from '@/helpers/validation/schemas/auth';
import { captureException } from '@/monitoring/sentry';

/**
 * Configuration NextAuth simplifiée pour 500 visiteurs/jour
 * Authentification par email/mot de passe avec validation Yup
 */
const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        try {
          // 1. Validation Yup des données d'entrée
          const validation = await validateLogin({
            email: credentials?.email || '',
            password: credentials?.password || '',
          });

          if (!validation.isValid) {
            // Récupérer le premier message d'erreur pour l'afficher
            const firstError = Object.values(validation.errors)[0];
            console.log('Login validation failed:', validation.errors);
            throw new Error(firstError || 'Invalid credentials');
          }

          // Utiliser les données validées et nettoyées
          const { email, password } = validation.data;

          // 2. Connexion DB
          await dbConnect();

          // 3. Recherche utilisateur avec mot de passe
          const user = await User.findOne({
            email: email, // Déjà en lowercase grâce à Yup
          }).select('+password');

          if (!user) {
            console.log('Login failed: User not found');
            throw new Error('Invalid email or password');
          }

          // 4. Vérification du mot de passe
          const isPasswordValid = await bcryptjs.compare(
            password,
            user.password,
          );

          if (!isPasswordValid) {
            console.log('Login failed: Invalid password');
            throw new Error('Invalid email or password');
          }

          // 5. Retourner l'utilisateur sans le mot de passe
          return {
            _id: user._id.toString(),
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role || 'user',
            avatar: user.avatar,
            verified: user.verified || false,
          };
        } catch (error) {
          console.error('Authentication error:', error.message);

          // Capturer seulement les vraies erreurs système (pas les erreurs de validation ou auth)
          if (
            !error.message.includes('Invalid email or password') &&
            !error.message.includes('requis') &&
            !error.message.includes('caractères') &&
            !error.message.includes('Format')
          ) {
            captureException(error, {
              tags: { component: 'auth', action: 'login' },
            });
          }

          // Renvoyer l'erreur pour NextAuth
          throw error;
        }
      },
    }),
  ],

  callbacks: {
    // Callback JWT - Ajouter les données utilisateur au token
    jwt: async ({ token, user }) => {
      if (user) {
        token.user = {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          verified: user.verified,
        };
      }
      return token;
    },

    // Callback Session - Ajouter les données utilisateur à la session
    session: async ({ session, token }) => {
      if (token?.user) {
        session.user = token.user;
      }
      return session;
    },
  },

  // Configuration de session JWT
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 heures
  },

  // Pages personnalisées
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },

  // Secret pour JWT
  secret: process.env.NEXTAUTH_SECRET,

  // Debug seulement en développement
  debug: process.env.NODE_ENV === 'development',
};

// Créer le handler NextAuth
const handler = NextAuth(authOptions);

// Export pour Next.js App Router
export { handler as GET, handler as POST, authOptions as auth };
