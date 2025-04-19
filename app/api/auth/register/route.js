/* eslint-disable no-unused-vars */
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import dbConnect, { checkDbHealth } from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import { sanitizeCredentials, sanitizeString } from '@/utils/authSanitizers';
import { registerSchema } from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import logger from '@/utils/logger';
import { rateLimit, RATE_LIMIT_PRESETS } from '@/utils/rateLimit';
import { inputSanitizer } from '@/utils/inputSanitizer';

// Limiter les tentatives d'inscription pour éviter les attaques par spam
const registerLimiter = rateLimit({
  ...RATE_LIMIT_PRESETS.PUBLIC_API,
  prefix: 'auth_register',
  limit: 10, // Maximum 10 inscriptions par intervalle
  interval: 60 * 60 * 1000, // Période de 1 heure
  blockDuration: 24 * 60 * 60 * 1000, // 24 heures de blocage en cas d'abus
});

export async function POST(req) {
  // Récupération de l'IP pour rate limiting
  const headersList = headers();
  const ip =
    (headersList.get('x-forwarded-for') || '').split(',').shift().trim() ||
    'unknown';
  const token = `ip:${ip}`;

  try {
    // Vérification du rate limiting
    try {
      await registerLimiter.check(req, null, token);
    } catch (error) {
      logger.warn('Registration rate limit exceeded', {
        ip: ip.replace(/\d+$/, 'xxx'), // Anonymisation partielle
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Too many registration attempts. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': '3600', // 1 heure
          },
        },
      );
    }

    // Vérification de l'état de la base de données
    const dbStatus = await checkDbHealth();
    if (!dbStatus.healthy) {
      logger.error(
        'Database connection unhealthy during registration',
        dbStatus,
      );

      return NextResponse.json(
        {
          success: false,
          message: 'Registration service unavailable. Please try again later.',
        },
        { status: 503 },
      );
    }

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
      name: sanitizeString(userData.name || ''),
      email: sanitizeCredentials({ email: userData.email || '' }).email,
      phone: inputSanitizer.sanitizeNumber(userData.phone || ''),
      password: userData.password, // Ne pas sanitizer le mot de passe brut pour éviter d'altérer sa valeur
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

    // Génération d'un token de vérification (pour un futur système de vérification d'email)
    // Note: Cette partie est optionnelle et peut être implémentée plus tard
    /* 
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');
    await user.save({ validateBeforeSave: false });

    // TODO: Envoyer un email de vérification avec le token
    */

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
