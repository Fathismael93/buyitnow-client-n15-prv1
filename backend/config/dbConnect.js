import mongoose from 'mongoose';
import { captureException } from '@/monitoring/sentry';
import winston from 'winston';
import { isValidMongoURI } from '../utils/validation';

// // Création d'un logger structuré avec niveau debug si nécessaire
// const logger = winston.createLogger({
//   level: process.env.LOG_LEVEL || 'debug', // Modifier en 'debug' pour plus de détails
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.json(),
//   ),
//   defaultMeta: { service: 'db-connection' },
//   transports: [
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.colorize(),
//         winston.format.simple(),
//       ),
//     }),
//   ],
// });

// // Variables globales
// const MONGODB_URI = process.env.DB_URI;

// // Variables globales et système de cache
// let cached = global.mongoose;

// if (!cached) {
//   cached = global.mongoose = {
//     conn: null,
//     promise: null,
//     retryCount: 0,
//     isConnecting: false,
//   };
// }

// /**
//  * Fonction utilitaire pour masquer les identifiants dans l'URI pour les logs
//  * @param {string} uri - URI MongoDB complète
//  * @returns {string} - URI avec les identifiants masqués
//  */
// const sanitizeUri = (uri) => {
//   if (!uri) return 'undefined-uri';
//   try {
//     return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
//   } catch (error) {
//     return 'invalid-uri-format';
//   }
// };

// /**
//  * Vérifie l'état de la connexion à MongoDB
//  * @returns {Object} État de santé de la connexion
//  */
// export const checkDbHealth = async () => {
//   logger.debug('Checking MongoDB connection health');

//   if (!cached.conn) {
//     logger.debug('No connection available for health check');
//     return {
//       status: 'disconnected',
//       healthy: false,
//       message: 'No MongoDB connection established',
//     };
//   }

//   try {
//     // Vérification que la connexion répond avec un ping
//     logger.debug('Attempting ping to verify connection');
//     await cached.conn.connection.db.admin().ping();
//     logger.debug('Ping successful, connection is healthy');
//     return {
//       status: 'connected',
//       healthy: true,
//       message: 'MongoDB connection is healthy',
//     };
//   } catch (error) {
//     logger.error('MongoDB health check failed', {
//       error: error.message,
//       stack: error.stack,
//       code: error.code,
//       name: error.name,
//     });
//     return {
//       status: 'unhealthy',
//       healthy: false,
//       message: 'MongoDB connection is unhealthy',
//       error: error.message,
//       code: error.code,
//     };
//   }
// };

// /**
//  * Ferme proprement la connexion à MongoDB
//  */
// export const closeDbConnection = async () => {
//   logger.debug('Closing MongoDB connection');

//   if (cached.conn) {
//     try {
//       await cached.conn.connection.close();
//       cached.conn = null;
//       cached.promise = null;
//       logger.info('MongoDB connection closed successfully');
//     } catch (error) {
//       logger.error('Error closing MongoDB connection', {
//         error: error.message,
//         stack: error.stack,
//         code: error.code,
//       });
//       captureException(error, {
//         tags: { service: 'database', action: 'disconnect' },
//       });
//     }
//   } else {
//     logger.debug('No active connection to close');
//   }
// };

// /**
//  * Fonction pour se connecter à MongoDB avec optimisations et gestion d'erreurs
//  * @param {boolean} forceNew - Force une nouvelle connexion même si une existe déjà
//  * @returns {Promise<Mongoose>} - Instance de connexion Mongoose
//  */
// const dbConnect = async (forceNew = false) => {
//   logger.debug(`dbConnect called with forceNew=${forceNew}`);

//   // Si déjà connecté et pas de force, retourner la connexion existante
//   if (cached.conn && !forceNew) {
//     logger.debug('Existing connection found, checking if still valid');
//     // Vérifier que la connexion est toujours valide
//     try {
//       logger.debug('Pinging existing connection');
//       await cached.conn.connection.db.admin().ping();
//       logger.debug('Existing connection is valid, reusing it');
//       return cached.conn;
//     } catch (error) {
//       logger.warn('Existing connection is not responding, will reconnect', {
//         error: error.message,
//         code: error.code,
//         name: error.name,
//       });
//       await closeDbConnection();
//     }
//   } else {
//     logger.debug(
//       `Reason for new connection: ${cached.conn ? 'forceNew flag' : 'no existing connection'}`,
//     );
//   }

//   // Éviter les tentatives de connexion simultanées
//   if (cached.isConnecting) {
//     logger.debug(
//       'Connection attempt already in progress, waiting for existing promise',
//     );
//     return cached.promise;
//   }

//   // Vérifier si l'URI est définie
//   if (!MONGODB_URI) {
//     const error = new Error(
//       'MongoDB URI is not defined in environment variables',
//     );
//     logger.error('Missing MongoDB URI', { error: error.message });
//     captureException(error, {
//       tags: { service: 'database', action: 'connect' },
//       level: 'fatal',
//     });
//     throw error;
//   }

//   // Log de l'URI (version sécurisée sans identifiants)
//   logger.debug(`Using MongoDB URI: ${sanitizeUri(MONGODB_URI)}`);

//   // Valider le format de l'URI
//   if (!isValidMongoURI(MONGODB_URI)) {
//     const error = new Error('Invalid MongoDB URI format');
//     logger.error('Invalid MongoDB URI format', {
//       uri: sanitizeUri(MONGODB_URI),
//       error: error.message,
//     });
//     captureException(error, {
//       tags: { service: 'database', action: 'connect' },
//       level: 'fatal',
//     });
//     throw error;
//   }

//   // Marquer comme en cours de connexion
//   logger.debug(
//     'Setting connection flag to prevent parallel connection attempts',
//   );
//   cached.isConnecting = true;

//   // Log des options de connexion
//   const opts = {
//     bufferCommands: false,
//     maxPoolSize: 100,
//     minPoolSize: 5,
//     socketTimeoutMS: 45000,
//     connectTimeoutMS: 30000,
//     serverSelectionTimeoutMS: 30000,
//     family: 4,
//     heartbeatFrequencyMS: 10000,
//     autoIndex: process.env.NODE_ENV !== 'production',
//     retryWrites: true,
//     ssl: true, // Ajout de ssl explicite pour MongoDB Atlas
//   };

//   logger.debug('Connection options:', { options: JSON.stringify(opts) });

//   // Configuration stricte des requêtes pour éviter les erreurs
//   mongoose.set('strictQuery', true);
//   logger.debug('Mongoose strictQuery set to true');

//   // Configurer les gestionnaires d'événements
//   logger.debug('Setting up event handlers for mongoose connection');

//   // Nettoyer les écouteurs existants pour éviter les duplications
//   mongoose.connection.removeAllListeners('connected');
//   mongoose.connection.removeAllListeners('error');
//   mongoose.connection.removeAllListeners('disconnected');

//   // Événement de connexion réussie
//   mongoose.connection.on('connected', () => {
//     logger.info('MongoDB connected successfully');
//     // Réinitialiser le compteur de tentatives
//     cached.retryCount = 0;
//   });

//   // Événement d'erreur de connexion
//   mongoose.connection.on('error', (err) => {
//     logger.error('MongoDB connection error event received', {
//       error: err.message,
//       code: err.code,
//       name: err.name,
//       stack: err.stack,
//     });
//     captureException(err, {
//       tags: { service: 'database', action: 'connect' },
//     });
//   });

//   // Événement de déconnexion
//   mongoose.connection.on('disconnected', () => {
//     logger.warn('MongoDB disconnected event received');
//     // Si pas déjà en train de se reconnecter et que l'application est toujours en cours
//     if (!cached.isConnecting && process.env.NODE_ENV === 'production') {
//       logger.info('Attempting to reconnect to MongoDB after disconnection...');
//       // Tenter de se reconnecter après un délai
//       setTimeout(() => {
//         logger.debug('Attempting reconnection after timeout');
//         dbConnect(true).catch((err) => {
//           logger.error('Failed to reconnect to MongoDB after timeout', {
//             error: err.message,
//             stack: err.stack,
//           });
//         });
//       }, 5000); // Correction du délai à 5000ms (était 5ms)
//     } else {
//       logger.debug(
//         `Not reconnecting automatically: isConnecting=${cached.isConnecting}, NODE_ENV=${process.env.NODE_ENV}`,
//       );
//     }
//   });

//   // Gestion de la fermeture propre pour différents signaux
//   const handleShutdown = async (signal) => {
//     logger.info(`Received ${signal} signal, closing MongoDB connection`);
//     await closeDbConnection();
//     process.exit(0);
//   };

//   // Gérer plusieurs signaux
//   process.on('SIGINT', () => handleShutdown('SIGINT'));
//   process.on('SIGTERM', () => handleShutdown('SIGTERM'));

//   // Fonction de connexion avec retry
//   const connectWithRetry = async (retryAttempt = 0) => {
//     logger.debug(`connectWithRetry called with attempt ${retryAttempt}`);

//     try {
//       logger.info(
//         `Attempting to connect to MongoDB (attempt ${retryAttempt + 1})`,
//         {
//           attempt: retryAttempt + 1,
//           uri: sanitizeUri(MONGODB_URI),
//         },
//       );

//       // Tentative de connexion
//       logger.debug('Calling mongoose.connect');
//       const mongooseInstance = await mongoose.connect(MONGODB_URI, opts);

//       // Si on arrive ici, la connexion a réussi
//       logger.info('MongoDB connection established successfully', {
//         databaseName: mongooseInstance.connection.db.databaseName,
//         host: mongooseInstance.connection.host,
//         port: mongooseInstance.connection.port,
//       });

//       // Log des détails de la connexion
//       const connectionDetails = {
//         readyState: mongooseInstance.connection.readyState,
//         models: Object.keys(mongooseInstance.models),
//         dbName: mongooseInstance.connection.name,
//       };
//       logger.debug('Connection details:', connectionDetails);

//       // Ajout de métriques de connexion (exemple)
//       if (global.metrics) {
//         global.metrics.dbConnectionsTotal.inc();
//         logger.debug('Incremented metrics counter for successful connections');
//       }

//       return mongooseInstance;
//     } catch (err) {
//       // Log détaillé de l'erreur de connexion
//       logger.error('MongoDB connection attempt failed', {
//         attempt: retryAttempt + 1,
//         error: err.message,
//         code: err.code,
//         name: err.name,
//         stack: err.stack,
//         driverDetails: err.driver
//           ? 'Driver error present'
//           : 'No driver details',
//       });

//       // Informations supplémentaires pour erreurs spécifiques
//       if (err.name === 'MongoServerSelectionError') {
//         logger.error('Server selection error details', {
//           reason: err.reason ? err.reason.toString() : 'No reason provided',
//           topologyDescription: err.topologyDescription
//             ? JSON.stringify(err.topologyDescription)
//             : 'No topology description',
//         });
//       }

//       if (err.name === 'MongoNetworkError') {
//         logger.error('Network error details', {
//           message: err.message,
//           cause: err.cause ? err.cause.toString() : 'No cause provided',
//         });
//       }

//       // Implémenter un backoff exponentiel
//       const nextRetryAttempt = retryAttempt + 1;
//       if (nextRetryAttempt <= 5) {
//         const retryDelay = Math.min(
//           5000 * Math.pow(1.5, retryAttempt), // Correction de 5 à 5000ms pour le délai de base
//           30000, // Maximum 30 secondes entre les tentatives
//         );

//         logger.warn(`Connection failed, retrying in ${retryDelay}ms`, {
//           attempt: nextRetryAttempt,
//           maxAttempts: 5,
//           error: err.message,
//           nextDelay: retryDelay,
//         });

//         // Attendre avant de réessayer
//         logger.debug(`Waiting for ${retryDelay}ms before next attempt`);
//         await new Promise((resolve) => setTimeout(resolve, retryDelay));
//         logger.debug('Wait completed, retrying connection');
//         return connectWithRetry(nextRetryAttempt);
//       } else {
//         logger.error(
//           'Failed to connect to MongoDB after maximum retry attempts',
//           {
//             error: err.message,
//             maxRetries: 5,
//             finalAttempt: nextRetryAttempt,
//           },
//         );
//         captureException(err, {
//           tags: { service: 'database', action: 'connect' },
//           level: 'fatal',
//           extra: { maxRetries: 5, attempts: nextRetryAttempt },
//         });
//         throw err;
//       }
//     }
//   };

//   // Stocker la promesse de connexion dans le cache
//   logger.debug('Initiating connection with retry mechanism');
//   cached.promise = connectWithRetry(cached.retryCount).finally(() => {
//     logger.debug(
//       'Connection attempt completed (success or failure), resetting isConnecting flag',
//     );
//     cached.isConnecting = false;
//   });

//   // Attendre la résolution de la promesse
//   try {
//     logger.debug('Awaiting connection promise resolution');
//     cached.conn = await cached.promise;
//     logger.debug('Connection promise resolved successfully');
//     return cached.conn;
//   } catch (e) {
//     logger.error('Connection promise rejected', {
//       error: e.message,
//       stack: e.stack,
//     });
//     cached.promise = null;
//     throw e;
//   }
// };

// export default dbConnect;

// import mongoose from 'mongoose';
// import { captureException } from '@/monitoring/sentry';
// import winston from 'winston';
// import { isValidMongoURI } from '../utils/validation';

// Création d'un logger structuré
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
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

/**
 * Fonction utilitaire pour masquer les identifiants dans l'URI pour les logs
 */
const sanitizeUri = (uri) => {
  if (!uri) return 'undefined-uri';
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  } catch (error) {
    return 'invalid-uri-format';
  }
};

/**
 * Vérifie l'état de la connexion à MongoDB
 */
export const checkDbHealth = async () => {
  logger.debug('Checking MongoDB connection health');

  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    logger.debug('No active connection for health check');
    return {
      status: 'disconnected',
      healthy: false,
      message: 'No MongoDB connection established',
    };
  }

  try {
    await mongoose.connection.db.admin().ping();
    logger.debug('Ping successful, connection is healthy');
    return {
      status: 'connected',
      healthy: true,
      message: 'MongoDB connection is healthy',
    };
  } catch (error) {
    logger.error('MongoDB health check failed', {
      error: error.message,
      code: error.code,
      name: error.name,
    });
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
  logger.debug('Closing MongoDB connection');

  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed successfully');
    } catch (error) {
      logger.error('Error closing MongoDB connection', {
        error: error.message,
        stack: error.stack,
      });
      captureException(error, {
        tags: { service: 'database', action: 'disconnect' },
      });
    }
  } else {
    logger.debug('No active connection to close');
  }
};

/**
 * Fonction pour se connecter à MongoDB sans système de cache
 * @returns {Promise<Mongoose>} - Instance de connexion Mongoose
 */
const dbConnect = async () => {
  logger.debug('dbConnect called');

  // Vérifier si l'URI est définie
  if (!MONGODB_URI) {
    const error = new Error(
      'MongoDB URI is not defined in environment variables',
    );
    logger.error('Missing MongoDB URI', { error: error.message });
    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });
    throw error;
  }

  // Log de l'URI (version sécurisée sans identifiants)
  logger.debug(`Using MongoDB URI: ${sanitizeUri(MONGODB_URI)}`);

  // Valider le format de l'URI
  if (!isValidMongoURI(MONGODB_URI)) {
    const error = new Error('Invalid MongoDB URI format');
    logger.error('Invalid MongoDB URI format', {
      uri: sanitizeUri(MONGODB_URI),
    });
    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });
    throw error;
  }

  // Options de connexion
  const opts = {
    bufferCommands: false,
    maxPoolSize: 100,
    minPoolSize: 5,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000, // Augmenté à 30 secondes
    serverSelectionTimeoutMS: 30000, // Augmenté à 30 secondes
    family: 4,
    heartbeatFrequencyMS: 10000,
    autoIndex: process.env.NODE_ENV !== 'production',
    retryWrites: true,
    ssl: true,
  };

  logger.debug('Connection options:', { options: JSON.stringify(opts) });

  // Configuration stricte des requêtes
  mongoose.set('strictQuery', true);

  // Nettoyer les écouteurs existants pour éviter les duplications
  mongoose.connection.removeAllListeners('connected');
  mongoose.connection.removeAllListeners('error');
  mongoose.connection.removeAllListeners('disconnected');

  // Configurer les événements
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error event received', {
      error: err.message,
      code: err.code,
      name: err.name,
    });
    captureException(err, {
      tags: { service: 'database', action: 'connect' },
    });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  // Configurer la gestion des signaux
  const handleShutdown = async (signal) => {
    logger.info(`Received ${signal} signal, closing MongoDB connection`);
    await closeDbConnection();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Capturer les rejets non gérés
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
      promise: promise.toString(),
      reason: reason instanceof Error ? reason.stack : reason,
    });
  });

  // Tentative de connexion simple avec gestion d'erreur
  try {
    logger.info('Attempting to connect to MongoDB');

    const mongooseInstance = await mongoose.connect(MONGODB_URI, opts);

    console.log(
      'MongoDB connection established successfully',
      mongooseInstance,
    );

    logger.info('MongoDB connection established successfully', {
      databaseName: mongooseInstance.connection.db.databaseName,
      host: mongooseInstance.connection.host,
      port: mongooseInstance.connection.port,
    });

    return mongooseInstance;
  } catch (error) {
    logger.error('MongoDB connection failed', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });

    // Informations supplémentaires pour erreurs spécifiques
    if (error.name === 'MongoServerSelectionError') {
      logger.error('Server selection error details', {
        reason: error.reason ? error.reason.toString() : 'No reason provided',
        topologyDescription: error.topologyDescription
          ? JSON.stringify(error.topologyDescription)
          : 'No topology description',
      });
    }

    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });

    throw error;
  }
};

export default dbConnect;
