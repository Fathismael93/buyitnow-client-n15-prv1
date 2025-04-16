/* eslint-disable no-unused-vars */
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import dbConnect, { checkDbHealth } from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import { sanitizeString } from '@/utils/inputSanitizer';
import { loginSchema } from '@/helpers/schemas';
import {
  captureException,
  setUser as setSentryUser,
} from '@/monitoring/sentry';
import logger from '@/utils/logger';
import { rateLimit, RATE_LIMIT_PRESETS } from '@/utils/rateLimit';
import { MemoryCache } from '@/utils/cache';
import { memoizeWithTTL } from '@/utils/performance';

// Cache pour les utilisateurs récemment authentifiés pour réduire les requêtes BDD
const userCache = new MemoryCache({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 1000, // Maximum 1000 utilisateurs en cache
  name: 'auth-user-cache',
});

// Mise en cache des utilisateurs (optimisation de performance)
const getUserByEmail = memoizeWithTTL(async (email) => {
  try {
    const user = await User.findOne({ email }).select('+password');
    return user;
  } catch (error) {
    logger.error('Error fetching user by email', {
      error: error.message,
      email: email.substring(0, 3) + '***', // On ne log pas l'email complet pour des raisons de sécurité
    });
    return null;
  }
}, 30 * 1000); // Cache pendant 30 secondes

// Limiter les tentatives de connexion pour éviter les attaques par force brute
const authLimiter = rateLimit({
  ...RATE_LIMIT_PRESETS.AUTH_ENDPOINTS,
  prefix: 'auth_login',
  blockDuration: 15 * 60 * 1000, // 15 minutes de blocage après trop de tentatives
});

// Configuration avancée de NextAuth
const auth = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        try {
          // Vérification de rate limiting
          const clientIp =
            (req.headers?.['x-forwarded-for'] || '')
              .split(',')
              .shift()
              .trim() ||
            req.socket?.remoteAddress ||
            'unknown';

          const token = `ip:${clientIp}`;

          try {
            await authLimiter.check(req, null, token);
          } catch (rateLimitError) {
            logger.warn('Authentication rate limit exceeded', {
              ip: clientIp.replace(/\d+$/, 'xxx'), // Anonymisation partielle
              attempt: new Date().toISOString(),
            });

            throw new Error('Too many login attempts. Please try again later.');
          }

          console.log('Sanitizing started');

          // Validation sanitaire des entrées
          const sanitizedCredentials = {
            email: sanitizeString(credentials.email || ''),
            password: credentials.password || '',
          };

          console.log('Sanitizing finished');
          console.log('Validation started');

          // Validation avec le schéma Yup
          await loginSchema.validate(sanitizedCredentials);

          console.log('Validation finished');

          // Vérification de l'état de la base de données
          const dbStatus = await checkDbHealth();
          if (!dbStatus.healthy) {
            logger.error(
              'Database connection unhealthy during authentication',
              dbStatus,
            );
            throw new Error(
              'Database service unavailable. Please try again later.',
            );
          }

          // Connexion à la base de données
          const connectionInstance = await dbConnect();
          if (!connectionInstance.connection) {
            logger.error('Failed to connect to database during authentication');
            throw new Error(
              'Database connection failed. Please try again later.',
            );
          }

          // Récupération de l'utilisateur (avec cache)
          const user = await getUserByEmail(sanitizedCredentials.email);

          if (!user) {
            // On note la tentative de connexion échouée mais on maintient un message générique
            logger.info('Failed login attempt - user not found', {
              email: sanitizedCredentials.email.substring(0, 3) + '***',
            });
            throw new Error('Invalid Email or Password');
          }

          // Vérification du mot de passe
          const isPasswordMatched = await bcrypt.compare(
            sanitizedCredentials.password,
            user.password,
          );

          if (!isPasswordMatched) {
            // On note la tentative avec mot de passe erroné mais on maintient un message générique
            logger.info('Failed login attempt - password mismatch', {
              userId: user._id.toString(),
            });
            throw new Error('Invalid Email or Password');
          }

          // Mise en cache de l'utilisateur pour accélérer les appels futurs
          const userWithoutPassword = { ...user.toObject() };
          delete userWithoutPassword.password;
          userCache.set(`user:${user._id}`, userWithoutPassword);

          // Log de connexion réussie
          logger.info('User authenticated successfully', {
            userId: user._id.toString(),
            role: user.role,
          });

          // Réinitialiser le compteur de rate limit après connexion réussie
          authLimiter.resetLimit(token);

          return userWithoutPassword;
        } catch (error) {
          // Si c'est une erreur de validation Yup, on la traite spécifiquement
          if (error.name === 'ValidationError') {
            logger.warn('Validation error during login', {
              error: error.message,
            });
            throw new Error('Invalid credentials format');
          }

          // Pour les autres erreurs, on les capture dans Sentry si ce ne sont pas des erreurs d'authentification simples
          if (
            !error.message.includes('Invalid Email or Password') &&
            !error.message.includes('Too many login attempts')
          ) {
            captureException(error, {
              tags: { service: 'auth', action: 'authorize' },
              extra: {
                email: (credentials.email || '').substring(0, 3) + '***',
              },
            });
          }

          throw error;
        }
      },
    }),
  ],
  callbacks: {
    // Callback appelé à la création du JWT
    jwt: async ({ token, user, account, trigger }) => {
      try {
        // Si un utilisateur est fourni (lors de la connexion), on l'ajoute au token
        if (user) {
          token.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
          };

          // Ajouter des informations supplémentaires pour le tracking et la sécurité
          token.authTime = Date.now();
        }

        // Gérer les mises à jour de session
        // Détection de la demande de mise à jour de session
        if (trigger === 'update') {
          try {
            // Récupérer l'utilisateur mis à jour
            const updatedUser = await User.findById(token.user._id);

            if (updatedUser) {
              // Mettre à jour les données utilisateur dans le token
              token.user = {
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                avatar: updatedUser.avatar,
              };

              // Mise à jour du cache
              userCache.set(`user:${updatedUser._id}`, token.user);
            }
          } catch (updateError) {
            logger.error('Error updating user session', {
              error: updateError.message,
              userId: token.user?._id,
            });

            captureException(updateError, {
              tags: { service: 'auth', action: 'session-update' },
            });
          }
        }

        return token;
      } catch (error) {
        logger.error('JWT callback error', { error: error.message });
        captureException(error, {
          tags: { service: 'auth', action: 'jwt-callback' },
        });

        // Retourner le token inchangé en cas d'erreur
        return token;
      }
    },

    // Callback appelé à la création de la session
    session: async ({ session, token }) => {
      try {
        if (token?.user) {
          session.user = token.user;
          session.authTime = token.authTime;

          // Configuration de Sentry pour tracer les erreurs utilisateur
          if (typeof setSentryUser === 'function') {
            setSentryUser({
              id: session.user._id,
              role: session.user.role,
            });
          }
        }

        // Nettoyer toute information sensible
        if (session?.user?.password) {
          delete session.user.password;
        }

        return session;
      } catch (error) {
        logger.error('Session callback error', { error: error.message });
        captureException(error, {
          tags: { service: 'auth', action: 'session-callback' },
        });

        // Retourner la session inchangée en cas d'erreur
        return session;
      }
    },
  },
  // Configuration de sécurité optimisée
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // La session expire après 24 heures
    updateAge: 2 * 60 * 60, // La session se rafraîchit toutes les 2 heures
  },
  // Pages personnalisées
  pages: {
    signIn: '/login',
    error: '/auth/error',
    signOut: '/logout',
  },
  // Paramètres de sécurité supplémentaires
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60, // 24 heures en secondes
      },
    },
  },
  // Durcissement de la sécurité des JWT
  jwt: {
    maxAge: 24 * 60 * 60, // 24 heures
  },
  // Activation du débogage en développement uniquement
  debug: process.env.NODE_ENV === 'development',
  // Clé secrète pour chiffrer les tokens
  secret: process.env.NEXTAUTH_SECRET,
  // Options d'événements pour journaliser les actions importantes
  events: {
    async signIn(message) {
      logger.info('User signed in', {
        userId: message.user._id,
        role: message.user.role,
      });
    },
    async signOut(message) {
      logger.info('User signed out', {
        userId: message.token.sub,
      });

      // Invalider le cache lors de la déconnexion
      if (message.token?.sub) {
        userCache.delete(`user:${message.token.sub}`);
      }
    },
    async error(message) {
      logger.error('Authentication error', {
        error: message.error?.message,
        type: message.type,
      });

      captureException(message.error, {
        tags: { service: 'auth', event: 'error' },
        level: 'error',
      });
    },
  },
};

// Créer et exporter le handler NextAuth
const handler = NextAuth(auth);

// Exporter les méthodes GET et POST pour Next.js 13+
export { handler as GET, handler as POST, auth };

// Fonctions utilitaires pour tester l'état de l'authentification
export const getAuthStatus = async () => {
  try {
    const dbStatus = await checkDbHealth();

    return {
      status: dbStatus.healthy ? 'online' : 'degraded',
      dbConnection: dbStatus.status,
      message: dbStatus.healthy
        ? 'Authentication service is operational'
        : 'Limited authentication functionality',
      cachedUsers: userCache.size().entries,
    };
  } catch (error) {
    logger.error('Auth status check failed', { error: error.message });
    return { status: 'error', message: 'Authentication service error' };
  }
};
