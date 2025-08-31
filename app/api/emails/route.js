import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import User from '@/backend/models/user';
import Contact from '@/backend/models/contact';
import { validateContactMessage } from '@/helpers/schemas';
import logger from '@/utils/logger';
import { captureException, captureMessage } from '@/monitoring/sentry';
import { appCache, getCacheKey } from '@/utils/cache';
// import { applyRateLimit } from '@/utils/integratedRateLimit';

/**
 * Gère l'envoi d'emails et l'enregistrement des messages de contact
 * Route POST /api/emails
 */
export async function POST(req) {
  // Identifiant unique pour le suivi de la requête
  const requestId = `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const startTime = performance.now();

  // Journalisation structurée de la requête entrante
  logger.info('Email API request received', {
    route: 'api/emails/POST',
    requestId,
    contentType: req.headers.get('content-type'),
  });

  try {
    // 1. Vérifier l'authentification
    await isAuthenticatedUser(req, NextResponse);

    // 2. Appliquer le rate limiting pour éviter les abus avec la nouvelle implémentation
    // const emailRateLimiter = applyRateLimit('AUTH_ENDPOINTS', {
    //   prefix: 'email_send',
    // });

    // Vérifier le rate limiting et obtenir une réponse si la limite est dépassée
    // const rateLimitResponse = await emailRateLimiter(req);

    // Si une réponse de rate limit est retournée, la renvoyer immédiatement
    // if (rateLimitResponse) {
    //   logger.warn('Rate limit exceeded for email sending', {
    //     user: req.user?.email,
    //     requestId,
    //   });

    //   // Ajouter l'ID de requête aux en-têtes de réponse
    //   const headers = new Headers(rateLimitResponse.headers);
    //   headers.set('X-Request-ID', requestId);

    //   // Créer une nouvelle réponse avec les en-têtes mis à jour
    //   return NextResponse.json(
    //     {
    //       success: false,
    //       message: 'Too many email requests, please try again later',
    //       requestId,
    //     },
    //     {
    //       status: 429,
    //       headers,
    //     },
    //   );
    // }

    // 3. Connexion à la base de données avec timeout
    let connectionInstance;
    try {
      const connectionPromise = dbConnect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Database connection timeout')),
          5000,
        );
      });

      connectionInstance = await Promise.race([
        connectionPromise,
        timeoutPromise,
      ]);
    } catch (dbError) {
      logger.error('Database connection failed for email sending', {
        requestId,
        user: req.user?.email,
        error: dbError.message,
      });

      captureException(dbError, {
        tags: {
          component: 'email-api',
          operation: 'db-connect',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Service temporarily unavailable, please try again later',
          requestId,
        },
        { status: 503 },
      );
    }

    if (!connectionInstance.connection) {
      logger.error('Invalid database connection for email sending', {
        requestId,
        user: req.user?.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
          requestId,
        },
        { status: 500 },
      );
    }

    // 4. Récupérer l'utilisateur authentifié
    let user;
    try {
      // Utiliser un timeout pour la requête utilisateur
      const userPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('User query timeout'));
        }, 3000);

        User.findOne({ email: req.user.email })
          .then((result) => {
            clearTimeout(timeoutId);
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });

      user = await userPromise;

      if (!user) {
        logger.warn('User not found for email sending', {
          requestId,
          email: req.user.email,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'User not found',
            requestId,
          },
          { status: 404 },
        );
      }
    } catch (userError) {
      logger.error('Error finding user for email sending', {
        requestId,
        error: userError.message,
        email: req.user.email,
      });

      captureException(userError, {
        tags: { component: 'email-api', operation: 'find-user', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Error finding user account',
          requestId,
        },
        { status: 500 },
      );
    }

    // 5. Valider et récupérer les données du corps de la requête
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      logger.warn('Invalid JSON in email request', {
        requestId,
        error: parseError.message,
        user: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request body format',
          requestId,
        },
        { status: 400 },
      );
    }

    const { subject, message } = body;

    // 6. Valider le contenu avec le schéma Yup
    try {
      const validationResult = await validateContactMessage({
        subject,
        message,
      });

      if (!validationResult.isValid) {
        logger.warn('Contact validation failed', {
          requestId,
          userId: user._id,
          validationErrors: validationResult.errors,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Validation failed',
            errors: validationResult.errors,
            requestId,
          },
          { status: 400 },
        );
      }

      // Vérifier si le message est potentiellement du spam
      if (validationResult.securityFlags?.includes('potential_spam')) {
        logger.warn('Potential spam message detected', {
          requestId,
          userId: user._id,
          subject: subject.substring(0, 20),
        });

        captureMessage('Potential spam detected in contact form', {
          level: 'warning',
          tags: { component: 'email-api', type: 'spam-detection' },
          extra: { userId: user._id },
        });

        // Option 1: Bloquer complètement le message
        // return NextResponse.json(
        //   {
        //     success: false,
        //     message: 'Message flagged as potential spam',
        //     requestId,
        //   },
        //   { status: 400 },
        // );

        // Option 2: Marquer comme spam mais traiter quand même (approche utilisée ici)
        body.status = 'spam';
      }
    } catch (validationError) {
      logger.error('Error during contact validation', {
        requestId,
        userId: user._id,
        error: validationError.message,
      });

      captureException(validationError, {
        tags: { component: 'email-api', operation: 'validation', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Error validating message',
          requestId,
        },
        { status: 500 },
      );
    }

    // 7. Préparer le message à sauvegarder
    const messageSent = {
      from: user._id,
      subject: subject.trim(),
      message: message.trim(),
      status: body.status || 'pending',
      metadata: {
        ipAddress:
          req.headers.get('x-forwarded-for') ||
          req.headers.get('x-real-ip') ||
          'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        referrer: req.headers.get('referer') || 'direct',
      },
    };

    // 8. Configurer le transporteur Nodemailer avec validation
    let transporter;
    try {
      if (
        !process.env.NODEMAILER_EMAIL_ACCOUNT ||
        !process.env.NODEMAILER_PASSWORD_ACCOUNT
      ) {
        throw new Error('Missing email configuration');
      }

      transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // true pour le port 465
        auth: {
          user: process.env.NODEMAILER_EMAIL_ACCOUNT,
          pass: process.env.NODEMAILER_PASSWORD_ACCOUNT,
        },
        // Paramètres additionnels pour la sécurité et les performances
        pool: true, // Utiliser le pooling de connexions
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000, // Délai entre les envois
        rateLimit: 5, // Nombre maximal d'emails par seconde
        // Sécurité
        tls: {
          rejectUnauthorized: true, // Vérifier le certificat
        },
      });
    } catch (emailConfigError) {
      logger.error('Email configuration error', {
        requestId,
        error: emailConfigError.message,
      });

      captureException(emailConfigError, {
        tags: {
          component: 'email-api',
          operation: 'create-transporter',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Email service misconfigured',
          requestId,
        },
        { status: 500 },
      );
    }

    // 9. Tenter d'envoyer l'email et créer le message en base de données en une seule transaction
    try {
      // Utiliser un timeout pour l'envoi d'email
      const mailOptions = {
        from: {
          name: user.name || 'BuyItNow User',
          address: process.env.NODEMAILER_EMAIL_ACCOUNT, // Toujours utiliser l'adresse autorisée
        },
        replyTo: user.email, // L'email de l'utilisateur en reply-to
        to: process.env.NODEMAILER_EMAIL_ACCOUNT,
        subject: `[Contact] ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Message de contact</h2>
            <p><strong>De:</strong> ${user.name} (${user.email})</p>
            <p><strong>Sujet:</strong> ${subject}</p>
            <hr style="border: 1px solid #eee;">
            <div>${message}</div>
            <hr style="border: 1px solid #eee;">
            <p style="font-size: 12px; color: #666;">
              Ce message a été envoyé depuis le formulaire de contact de BuyItNow.<br>
              ID de requête: ${requestId}
            </p>
          </div>
        `,
        text: `Message de: ${user.name} (${user.email})\nSujet: ${subject}\n\n${message}\n\nEnvoyé depuis le formulaire de contact de BuyItNow.`,
      };

      // Envoyer l'email et sauvegarder le message de façon concurrente
      const [emailResult, contactResult] = await Promise.allSettled([
        new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Email sending timeout'));
          }, 10000);

          transporter
            .sendMail(mailOptions)
            .then((info) => {
              clearTimeout(timeoutId);
              resolve(info);
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
        }),
        Contact.create(messageSent),
      ]);

      // Vérifier les résultats de l'opération
      if (emailResult.status === 'rejected') {
        logger.error('Failed to send email', {
          requestId,
          userId: user._id,
          error: emailResult.reason.message,
        });

        captureException(emailResult.reason, {
          tags: { component: 'email-api', operation: 'send-email', requestId },
        });

        // Si l'email a échoué mais le message a été enregistré, marquer comme erreur
        if (contactResult.status === 'fulfilled') {
          await Contact.findByIdAndUpdate(
            contactResult.value._id,
            { status: 'error' },
            { new: true },
          );

          return NextResponse.json(
            {
              success: false,
              message:
                'Email could not be sent, but your message has been recorded',
              requestId,
            },
            { status: 500 },
          );
        }

        return NextResponse.json(
          {
            success: false,
            message: 'Failed to send email',
            requestId,
          },
          { status: 500 },
        );
      }

      if (contactResult.status === 'rejected') {
        logger.error('Failed to record contact message', {
          requestId,
          userId: user._id,
          error: contactResult.reason?.message,
        });

        captureException(contactResult.reason, {
          tags: {
            component: 'email-api',
            operation: 'create-contact',
            requestId,
          },
        });

        return NextResponse.json(
          {
            success: true,
            message:
              'Email sent, but there was an issue recording your message',
            requestId,
          },
          { status: 200 },
        );
      }

      // Succès complet - email envoyé et message enregistré
      logger.info('Email sent and contact message recorded successfully', {
        requestId,
        userId: user._id,
        messageId: contactResult.value._id,
        emailMessageId: emailResult.value.messageId,
        processingTime: Math.round(performance.now() - startTime),
      });

      // Ajouter des headers de sécurité
      const securityHeaders = {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'same-origin',
      };

      // Invalider les caches pertinents
      // Utiliser getCacheKey pour générer des clés canoniques cohérentes
      const userContactsCacheKey = getCacheKey('contacts', {
        userId: user._id.toString(),
      });
      const recentContactsCacheKey = getCacheKey('contacts', {
        status: 'pending',
      });

      // Invalider le cache des contacts de l'utilisateur
      appCache.contacts.delete(userContactsCacheKey);

      // Invalider également le cache des contacts récents/en attente
      appCache.contacts.delete(recentContactsCacheKey);

      // Approche alternative avec invalidation par motif
      appCache.contacts.invalidatePattern(/^contacts:/);

      return NextResponse.json(
        {
          success: true,
          message: 'Email sent',
          requestId,
        },
        {
          status: 201,
          headers: securityHeaders,
        },
      );
    } catch (operationError) {
      logger.error('Unhandled error during email operation', {
        requestId,
        userId: user._id,
        error: operationError.message,
        stack: operationError.stack,
      });

      captureException(operationError, {
        tags: { component: 'email-api', operation: 'email-process', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Something went wrong processing your email',
          requestId,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    // Gestion des erreurs globales avec classification et journalisation structurée
    let statusCode = 500;
    let errorMessage =
      'Something went wrong with the server! Please try again later';
    let errorCode = `ERR${Date.now().toString(36).substring(4)}`;

    // Classification des erreurs
    if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in email API', {
        requestId,
        error: error.message,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Timeout in email API', {
        requestId,
        error: error.message,
      });
    } else if (
      error.name === 'ValidationError' ||
      error.message?.includes('validation')
    ) {
      statusCode = 400;
      errorMessage = 'Email validation failed';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Validation error in email API', {
        requestId,
        error: error.message,
      });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in email API', {
        requestId,
        errorCode,
        error: error.message,
        stack: error.stack,
        user: req.user?.email || 'unknown',
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'email-api',
          operation: 'global-handler',
          requestId,
          errorCode,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
        code: errorCode,
        requestId,
      },
      { status: statusCode },
    );
  } finally {
    // Journalisation du temps de traitement total
    const processingTime = Math.round(performance.now() - startTime);
    logger.debug('Email API processing completed', {
      requestId,
      processingTime,
      user: req.user?.email || 'unknown',
    });
  }
}
