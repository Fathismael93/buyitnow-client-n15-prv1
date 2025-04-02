import mongoose from 'mongoose';
import { captureException } from '@/monitoring/sentry';
import winston from 'winston';
import { isValidMongoURI } from '../utils/validation';

// Création d'un logger structuré
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'db-connection' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

// Variables globales
const MONGODB_URI = process.env.DB_URI;

// Configuration de la connexion à partir des variables d'environnement
// const config = {
//   MONGODB_URI: process.env.DB_URI,
//   MAX_POOL_SIZE: parseInt(process.env.DB_MAX_POOL_SIZE || '10', 10),
//   MIN_POOL_SIZE: parseInt(process.env.DB_MIN_POOL_SIZE || '5', 10),
//   SOCKET_TIMEOUT_MS: parseInt(process.env.DB_SOCKET_TIMEOUT_MS || '45000', 10),
//   CONNECT_TIMEOUT_MS: parseInt(
//     process.env.DB_CONNECT_TIMEOUT_MS || '10000',
//     10,
//   ),
//   MAX_RETRY_ATTEMPTS: parseInt(process.env.DB_MAX_RETRY_ATTEMPTS || '5', 10),
//   RETRY_INTERVAL_MS: parseInt(process.env.DB_RETRY_INTERVAL_MS || '5000', 10),
//   USE_UNIFIED_TOPOLOGY: process.env.DB_USE_UNIFIED_TOPOLOGY !== 'false',
//   SSL_ENABLED: process.env.DB_SSL_ENABLED === 'true',
//   SSL_VALIDATE: process.env.DB_SSL_VALIDATE !== 'false',
// };

// Variables globales et système de cache
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
    retryCount: 0,
    isConnecting: false,
  };
}

/**
 * Vérifie l'état de la connexion à MongoDB
 * @returns {Object} État de santé de la connexion
 */
export const checkDbHealth = async () => {
  if (!cached.conn) {
    return {
      status: 'disconnected',
      healthy: false,
      message: 'No MongoDB connection established',
    };
  }

  try {
    // Vérification que la connexion répond avec un ping
    await cached.conn.connection.db.admin().ping();
    return {
      status: 'connected',
      healthy: true,
      message: 'MongoDB connection is healthy',
    };
  } catch (error) {
    logger.error('MongoDB health check failed', { error });
    return {
      status: 'unhealthy',
      healthy: false,
      message: 'MongoDB connection is unhealthy',
      error: error.message,
    };
  }
};

/**
 * Ferme proprement la connexion à MongoDB
 */
export const closeDbConnection = async () => {
  if (cached.conn) {
    try {
      await cached.conn.connection.close();
      cached.conn = null;
      cached.promise = null;
      logger.info('MongoDB connection closed successfully');
    } catch (error) {
      logger.error('Error closing MongoDB connection', { error });
      captureException(error, {
        tags: { service: 'database', action: 'disconnect' },
      });
    }
  }
};

/**
 * Fonction pour se connecter à MongoDB avec optimisations et gestion d'erreurs
 * @param {boolean} forceNew - Force une nouvelle connexion même si une existe déjà
 * @returns {Promise<Mongoose>} - Instance de connexion Mongoose
 */
const dbConnect = async (forceNew = false) => {
  // Si déjà connecté et pas de force, retourner la connexion existante
  if (cached.conn && !forceNew) {
    // Vérifier que la connexion est toujours valide
    try {
      await cached.conn.connection.db.admin().ping();
      return cached.conn;
    } catch (error) {
      logger.warn('Existing connection is not responding, will reconnect', {
        error,
      });
      await closeDbConnection();
    }
  }

  // Éviter les tentatives de connexion simultanées
  if (cached.isConnecting) {
    logger.debug('Connection attempt already in progress, waiting...');
    return cached.promise;
  }

  // Vérifier si l'URI est définie
  if (!MONGODB_URI) {
    const error = new Error(
      'MongoDB URI is not defined in environment variables',
    );
    logger.error('Missing MongoDB URI', { error });
    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });
    throw error;
  }

  // Valider le format de l'URI
  if (!isValidMongoURI(MONGODB_URI)) {
    const error = new Error('Invalid MongoDB URI format');
    logger.error('Invalid MongoDB URI', { error });
    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });
    throw error;
  }

  // Marquer comme en cours de connexion
  cached.isConnecting = true;

  // Options de connexion recommandées pour MongoDB et Mongoose
  const opts = {
    // Options de connexion recommandées pour MongoDB et Mongoose
    bufferCommands: false,
    maxPoolSize: 100, // Garder un nombre raisonnable de connexions
    minPoolSize: 5, // Connexions minimales (utile en production)
    socketTimeoutMS: 45000, // Éviter déconnexion trop rapide
    connectTimeoutMS: 10000, // 10 secondes max pour se connecter
    serverSelectionTimeoutMS: 10000, // 10 sec max pour sélection serveur
    family: 4, // Forcer IPv4 (plus stable dans certains environnements)
    heartbeatFrequencyMS: 10000, // Fréquence de pulsation pour la réplication
    autoIndex: process.env.NODE_ENV !== 'production', // Désactiver l'auto-indexation en production
    // Options SSL pour sécuriser la connexion
    // ssl: config.SSL_ENABLED,
    // sslValidate: config.SSL_VALIDATE,
    retryWrites: true,
    // Activer les transactions seulement si on utilise un replica set
    // readPreference: process.env.DB_READ_PREFERENCE || 'primary',
  };

  // Configuration stricte des requêtes pour éviter les erreurs
  mongoose.set('strictQuery', true);

  // Définir les gestionnaires d'événements avant la connexion
  // Événement de connexion réussie
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
    // Réinitialiser le compteur de tentatives
    cached.retryCount = 0;
  });

  // Événement d'erreur de connexion
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err });
    captureException(err, {
      tags: { service: 'database', action: 'connect' },
    });
  });

  // Événement de déconnexion
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    // Si pas déjà en train de se reconnecter et que l'application est toujours en cours
    if (!cached.isConnecting && process.env.NODE_ENV === 'production') {
      logger.info('Attempting to reconnect to MongoDB...');
      // Tenter de se reconnecter après un délai
      setTimeout(() => {
        dbConnect(true).catch((err) => {
          logger.error('Failed to reconnect to MongoDB', { error: err });
        });
      }, 5);
    }
  });

  // Gestion de la fermeture propre pour différents signaux
  const handleShutdown = async (signal) => {
    logger.info(`Received ${signal} signal, closing MongoDB connection`);
    await closeDbConnection();
    process.exit(0);
  };

  // Gérer plusieurs signaux
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Fonction de connexion avec retry
  const connectWithRetry = async (retryAttempt = 0) => {
    try {
      logger.info('Attempting to connect to MongoDB', {
        attempt: retryAttempt + 1,
      });
      const mongooseInstance = await mongoose.connect(MONGODB_URI, opts);
      logger.info('MongoDB connection established');

      // Ajout de métriques de connexion (exemple)
      if (global.metrics) {
        global.metrics.dbConnectionsTotal.inc();
      }

      return mongooseInstance;
    } catch (err) {
      // Implémenter un backoff exponentiel
      const nextRetryAttempt = retryAttempt + 1;
      if (nextRetryAttempt <= 5) {
        const retryDelay = Math.min(
          5 * Math.pow(1.5, retryAttempt),
          30000, // Maximum 30 secondes entre les tentatives
        );

        logger.warn(`Connection failed, retrying in ${retryDelay}ms`, {
          attempt: nextRetryAttempt,
          maxAttempts: 5,
          error: err.message,
        });

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return connectWithRetry(nextRetryAttempt);
      } else {
        logger.error(
          'Failed to connect to MongoDB after maximum retry attempts',
          { error: err },
        );
        captureException(err, {
          tags: { service: 'database', action: 'connect' },
          level: 'fatal',
          extra: { maxRetries: 5 },
        });
        throw err;
      }
    }
  };

  // Stocker la promesse de connexion dans le cache
  cached.promise = connectWithRetry(cached.retryCount).finally(() => {
    cached.isConnecting = false;
  });

  // Attendre la résolution de la promesse
  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
};

export default dbConnect;
