import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import {
  sanitizeEmail,
  sanitizeName,
  sanitizePassword,
  sanitizePhone,
} from '@/utils/authSanitizers';
import { registerSchema } from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import logger from '@/utils/logger';
// import { applyRateLimit } from '@/utils/integratedRateLimit';

export async function POST(req) {
  // Récupération de l'IP pour logging
  const headersList = headers();
  const ip =
    (headersList.get('x-forwarded-for') || '').split(',').shift().trim() ||
    'unknown';

  try {
    // Appliquer le rate limiting pour les inscriptions
    // const registerRateLimiter = applyRateLimit('PUBLIC_API', {
    //   prefix: 'auth_register',
    //   // Utiliser les options spécifiques comme dans l'ancien code
    //   // Celles-ci seront fusionnées avec les préréglages définis dans integratedRateLimit.js
    //   max: 10, // Maximum 10 inscriptions par intervalle
    //   windowMs: 60 * 60 * 1000, // Période de 1 heure
    //   blockDuration: 24 * 60 * 60 * 1000, // 24 heures de blocage en cas d'abus
    // });

    // Vérifier le rate limiting et obtenir une réponse si la limite est dépassée
    // const rateLimitResponse = await registerRateLimiter(req);

    // Si une réponse de rate limit est retournée, la renvoyer immédiatement
    // if (rateLimitResponse) {
    //   logger.warn('Registration rate limit exceeded', {
    //     ip: ip.replace(/\d+$/, 'xxx'), // Anonymisation partielle
    //     timestamp: new Date().toISOString(),
    //   });

    //   // Renvoyer la réponse du rate limiter avec message personnalisé et headers
    //   const customHeaders = new Headers(rateLimitResponse.headers);
    //   customHeaders.set('Retry-After', '3600'); // 1 heure

    //   return NextResponse.json(
    //     {
    //       success: false,
    //       message: 'Too many registration attempts. Please try again later.',
    //     },
    //     {
    //       status: 429,
    //       headers: customHeaders,
    //     },
    //   );
    // }

    // Connexion à la base de données
    const connectionInstance = await dbConnect();
    if (!connectionInstance.connection) {
      logger.error('Failed to connect to database during registration');

      return NextResponse.json(
        {
          success: false,
          message: 'Registration service unavailable. Please try again later.',
        },
        { status: 503 },
      );
    }

    // Extraction et validation des données
    let userData;
    try {
      userData = await req.json();
    } catch (error) {
      logger.warn('Invalid JSON in registration request', {
        error: error.message,
        ip: ip.replace(/\d+$/, 'xxx'),
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request format.',
        },
        { status: 400 },
      );
    }

    // Sanitisation des entrées
    const sanitizedData = {
      name: sanitizeName(userData.name || ''),
      email: sanitizeEmail(userData.email) || '',
      phone: sanitizePhone(userData.phone || ''),
      password: sanitizePassword(userData.password), // Ne pas sanitizer le mot de passe brut pour éviter d'altérer sa valeur
    };

    // Validation avec le schéma Yup
    try {
      await registerSchema.validate(sanitizedData, { abortEarly: false });
    } catch (error) {
      logger.info('Registration validation failed', {
        errors: error.errors,
        ip: ip.replace(/\d+$/, 'xxx'),
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        },
        { status: 400 },
      );
    }

    // Vérification si l'email existe déjà
    const existingUser = await User.findByEmail(sanitizedData.email);
    if (existingUser) {
      logger.info('Registration attempt with existing email', {
        email: sanitizedData.email.substring(0, 3) + '***',
      });

      // Réponse délibérément vague pour des raisons de sécurité
      return NextResponse.json(
        {
          success: false,
          message: 'Unable to register with provided details.',
        },
        { status: 400 },
      );
    }

    // Création de l'utilisateur
    const user = await User.create({
      name: sanitizedData.name,
      email: sanitizedData.email,
      phone: sanitizedData.phone,
      password: sanitizedData.password,
      // Valeurs par défaut
      isActive: true,
      verified: false, // Nécessite vérification d'email
    });

    // Log de succès
    logger.info('User registered successfully', {
      userId: user._id.toString(),
      email: sanitizedData.email.substring(0, 3) + '***',
    });

    // Préparation de la réponse (sans données sensibles)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return NextResponse.json(
      {
        success: true,
        message: 'Registration successful',
        data: { user: userResponse },
      },
      { status: 201 },
    );
  } catch (error) {
    // Si c'est une erreur de duplication MongoDB (code 11000)
    if (error.code === 11000) {
      logger.info('Registration attempt with duplicate key', {
        keyPattern: error.keyPattern,
      });

      // Réponse délibérément vague pour des raisons de sécurité
      return NextResponse.json(
        {
          success: false,
          message: 'Unable to register with provided details.',
        },
        { status: 400 },
      );
    }

    // Logging et capture d'autres erreurs
    logger.error('Registration error', {
      error: error.message,
      stack: error.stack,
    });

    captureException(error, {
      tags: { service: 'auth', action: 'register' },
    });

    // Réponse générique d'erreur serveur (sans exposer de détails)
    return NextResponse.json(
      {
        success: false,
        message: 'Registration failed. Please try again later.',
      },
      { status: 500 },
    );
  }
}
