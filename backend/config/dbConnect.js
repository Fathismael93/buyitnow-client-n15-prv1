import mongoose from 'mongoose';
import { captureException, captureMessage } from '@/monitoring/sentry';
import { isValidMongoURI } from '../utils/validation';
import logger from '@/utils/logger';

// ===== CIRCUIT BREAKER IMPLEMENTATION =====
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 60 secondes
    this.monitoringPeriod = options.monitoringPeriod || 120000; // 2 minutes

    // États possibles : CLOSED, OPEN, HALF_OPEN
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.requestCount = 0;

    // Métriques pour monitoring
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastStateChange: Date.now(),
      stateHistory: [],
    };

    // Nettoyage des métriques anciennes
    this.startMetricsCleanup();
  }

  async execute(operation) {
    this.requestCount++;
    this.metrics.totalRequests++;

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.logStateChange('HALF_OPEN', 'Reset timeout reached');
      } else {
        throw new Error(
          `Circuit breaker OPEN - MongoDB unavailable (failed ${this.failureCount} times)`,
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.successCount++;
    this.metrics.totalSuccesses++;

    if (this.state === 'HALF_OPEN') {
      // En état HALF_OPEN, redevenir CLOSED après quelques succès
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.logStateChange('CLOSED', 'Recovery confirmed');
      }
    } else if (this.state === 'CLOSED') {
      // Reset le compteur d'échecs après un succès
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  onFailure(error) {
    this.failureCount++;
    this.metrics.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.logStateChange(
        'OPEN',
        `Failure threshold reached (${this.failureCount} failures)`,
      );

      // Capturer l'événement critique
      captureMessage(`Circuit breaker OPENED for MongoDB`, {
        level: 'error',
        tags: {
          component: 'circuit-breaker',
          service: 'mongodb',
        },
        extra: {
          failureCount: this.failureCount,
          lastError: error.message,
        },
      });
    } else if (this.state === 'HALF_OPEN') {
      // Retourner à OPEN si échec en HALF_OPEN
      this.state = 'OPEN';
      this.logStateChange('OPEN', 'Failed in HALF_OPEN state');
    }
  }

  logStateChange(newState, reason) {
    const stateChange = {
      from: this.state,
      to: newState,
      timestamp: Date.now(),
      reason,
    };

    this.metrics.stateHistory.push(stateChange);
    this.metrics.lastStateChange = Date.now();

    logger.warn(`Circuit breaker state change: ${this.state} -> ${newState}`, {
      reason,
      failureCount: this.failureCount,
      successCount: this.successCount,
    });
  }

  getMetrics() {
    return {
      ...this.metrics,
      currentState: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      healthRatio:
        this.metrics.totalRequests > 0
          ? this.metrics.totalSuccesses / this.metrics.totalRequests
          : 1,
    };
  }

  startMetricsCleanup() {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        const cutoffTime = Date.now() - this.monitoringPeriod;
        this.metrics.stateHistory = this.metrics.stateHistory.filter(
          (entry) => entry.timestamp > cutoffTime,
        );
      }, this.monitoringPeriod);
    }
  }
}

// ===== MÉTRIQUES DE PERFORMANCE =====
class ConnectionMetrics {
  constructor() {
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      connectionTimes: [],
      currentConnections: 0,
      peakConnections: 0,
      lastConnectionAttempt: null,
      uptime: Date.now(),
      errors: {
        network: 0,
        authentication: 0,
        timeout: 0,
        other: 0,
      },
    };

    this.startPeriodicCleanup();
  }

  recordConnectionAttempt() {
    this.metrics.totalConnections++;
    this.metrics.lastConnectionAttempt = Date.now();
    return Date.now(); // Retourne le timestamp de début pour mesurer la durée
  }

  recordConnectionSuccess(startTime) {
    const connectionTime = Date.now() - startTime;
    this.metrics.successfulConnections++;
    this.metrics.currentConnections++;
    this.metrics.peakConnections = Math.max(
      this.metrics.peakConnections,
      this.metrics.currentConnections,
    );

    // Maintenir un historique des temps de connexion (max 100 entrées)
    this.metrics.connectionTimes.push(connectionTime);
    if (this.metrics.connectionTimes.length > 100) {
      this.metrics.connectionTimes.shift();
    }

    // Calculer la moyenne mobile
    this.metrics.averageConnectionTime =
      this.metrics.connectionTimes.reduce((a, b) => a + b, 0) /
      this.metrics.connectionTimes.length;
  }

  recordConnectionFailure(error) {
    this.metrics.failedConnections++;

    // Catégoriser les erreurs
    const errorMessage = error.message?.toLowerCase() || '';
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('timeout')
    ) {
      this.metrics.errors.network++;
    } else if (
      errorMessage.includes('auth') ||
      errorMessage.includes('unauthorized')
    ) {
      this.metrics.errors.authentication++;
    } else if (errorMessage.includes('timeout')) {
      this.metrics.errors.timeout++;
    } else {
      this.metrics.errors.other++;
    }
  }

  recordDisconnection() {
    this.metrics.currentConnections = Math.max(
      0,
      this.metrics.currentConnections - 1,
    );
  }

  getMetrics() {
    const now = Date.now();
    return {
      ...this.metrics,
      successRate:
        this.metrics.totalConnections > 0
          ? (this.metrics.successfulConnections /
              this.metrics.totalConnections) *
            100
          : 100,
      uptimeHours:
        Math.round(((now - this.metrics.uptime) / (1000 * 60 * 60)) * 100) /
        100,
      isHealthy:
        this.metrics.totalConnections === 0 ||
        this.metrics.successfulConnections / this.metrics.totalConnections >
          0.95,
    };
  }

  startPeriodicCleanup() {
    if (typeof setInterval !== 'undefined') {
      // Nettoyer les métriques anciennes toutes les heures
      setInterval(
        () => {
          if (this.metrics.connectionTimes.length > 50) {
            this.metrics.connectionTimes =
              this.metrics.connectionTimes.slice(-50);
          }
        },
        60 * 60 * 1000,
      );
    }
  }
}

// ===== VARIABLES GLOBALES =====
const MONGODB_URI = process.env.DB_URI;

// Variables globales et système de cache amélioré
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
    circuitBreaker: null,
    metrics: null,
    isConnecting: false,
    lastHealthCheck: null,
    healthCheckInterval: null,
  };
}

// Initialiser le circuit breaker et les métriques
if (!cached.circuitBreaker) {
  cached.circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
  });
}

if (!cached.metrics) {
  cached.metrics = new ConnectionMetrics();
}

// ===== FONCTIONS DE SANTÉ ET MONITORING =====

/**
 * Vérifie l'état de santé détaillé de la connexion MongoDB
 * @returns {Promise<Object>} État de santé avec métriques détaillées
 */
export const checkDbHealth = async () => {
  const healthCheck = {
    timestamp: new Date().toISOString(),
    status: 'unknown',
    healthy: false,
    connection: null,
    metrics: null,
    circuitBreaker: null,
    latency: null,
    details: {},
  };

  try {
    const startTime = Date.now();

    if (!cached.conn) {
      healthCheck.status = 'disconnected';
      healthCheck.details.message = 'No MongoDB connection established';
      return healthCheck;
    }

    // Test de ping avec timeout
    const pingPromise = cached.conn.connection.db.admin().ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 5000),
    );

    await Promise.race([pingPromise, timeoutPromise]);

    const latency = Date.now() - startTime;

    // Vérifier l'état de la connexion
    const readyState = cached.conn.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    healthCheck.status = stateMap[readyState] || 'unknown';
    healthCheck.healthy = readyState === 1 && latency < 1000; // Sain si connecté et latence < 1s
    healthCheck.latency = latency;

    // Ajouter les métriques
    healthCheck.metrics = cached.metrics.getMetrics();
    healthCheck.circuitBreaker = cached.circuitBreaker.getMetrics();

    // Détails de connexion (sans données sensibles)
    healthCheck.connection = {
      readyState,
      host: cached.conn.connection.host,
      port: cached.conn.connection.port,
      name: cached.conn.connection.name,
      collections: cached.conn.connection.db
        ? Object.keys(cached.conn.connection.db.collection).length
        : 0,
    };

    // Vérifications supplémentaires
    if (healthCheck.healthy) {
      // Test d'une opération simple
      try {
        await cached.conn.connection.db
          .collection('healthcheck')
          .findOne({}, { limit: 1 });
        healthCheck.details.operationalTest = 'passed';
      } catch (opError) {
        healthCheck.details.operationalTest = 'failed';
        healthCheck.details.operationError = opError.message;
        healthCheck.healthy = false;
      }
    }

    cached.lastHealthCheck = Date.now();

    return healthCheck;
  } catch (error) {
    logger.error('MongoDB health check failed', {
      error: error.message,
      code: error.code,
    });

    healthCheck.status = 'unhealthy';
    healthCheck.healthy = false;
    healthCheck.details.error = error.message;
    healthCheck.details.code = error.code;
    healthCheck.metrics = cached.metrics.getMetrics();
    healthCheck.circuitBreaker = cached.circuitBreaker.getMetrics();

    return healthCheck;
  }
};

/**
 * Démarre un monitoring de santé périodique
 */
export const startHealthMonitoring = () => {
  if (cached.healthCheckInterval) return;

  cached.healthCheckInterval = setInterval(async () => {
    try {
      const health = await checkDbHealth();

      // Alerter si problème détecté
      if (!health.healthy) {
        captureMessage('MongoDB health check failed', {
          level: 'warning',
          tags: {
            component: 'database',
            service: 'health-monitor',
          },
          extra: health,
        });
      }

      // Log périodique des métriques en développement
      if (process.env.NODE_ENV === 'development') {
        logger.info('MongoDB Health Check', {
          status: health.status,
          healthy: health.healthy,
          latency: health.latency,
          metrics: health.metrics,
        });
      }
    } catch (error) {
      logger.error('Health monitoring error', { error: error.message });
    }
  }, 60000); // Toutes les minutes

  // Éviter que l'intervalle bloque le processus
  if (
    cached.healthCheckInterval &&
    typeof cached.healthCheckInterval === 'object'
  ) {
    cached.healthCheckInterval.unref?.();
  }
};

/**
 * Arrête le monitoring de santé
 */
export const stopHealthMonitoring = () => {
  if (cached.healthCheckInterval) {
    clearInterval(cached.healthCheckInterval);
    cached.healthCheckInterval = null;
  }
};

/**
 * Ferme proprement la connexion à MongoDB
 */
export const closeDbConnection = async () => {
  if (cached.conn) {
    try {
      stopHealthMonitoring();
      cached.metrics.recordDisconnection();

      await cached.conn.connection.close();
      cached.conn = null;
      cached.promise = null;

      logger.info('MongoDB connection closed successfully');
    } catch (error) {
      logger.error('Error closing MongoDB connection', {
        error: error.message,
      });
      captureException(error, {
        tags: { service: 'database', action: 'disconnect' },
      });
    }
  }
};

/**
 * Fonction principale de connexion à MongoDB avec circuit breaker
 * @param {boolean} forceNew - Force une nouvelle connexion
 * @returns {Promise<Mongoose>} - Instance de connexion Mongoose
 */
const dbConnect = async (forceNew = false) => {
  // Vérifier l'URI
  if (!MONGODB_URI) {
    const error = new Error(
      'MongoDB URI is not defined in environment variables',
    );
    logger.error('Missing MongoDB URI');
    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });
    throw error;
  }

  if (!isValidMongoURI(MONGODB_URI)) {
    const error = new Error('Invalid MongoDB URI format');
    logger.error('Invalid MongoDB URI format');
    captureException(error, {
      tags: { service: 'database', action: 'connect' },
      level: 'fatal',
    });
    throw error;
  }

  // Si déjà connecté et pas de force, vérifier la santé
  if (cached.conn && !forceNew) {
    try {
      // Vérification rapide de la connexion existante
      await cached.conn.connection.db.admin().ping();
      return cached.conn;
    } catch (error) {
      logger.warn('Existing connection is not responding, will reconnect', {
        error: error.message,
      });
      await closeDbConnection();
    }
  }

  // Éviter les connexions simultanées
  if (cached.isConnecting) {
    return cached.promise;
  }

  cached.isConnecting = true;

  // Options de connexion optimisées
  const opts = {
    bufferCommands: false,
    maxPoolSize: 100,
    minPoolSize: 5,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    serverSelectionTimeoutMS: 30000,
    family: 4,
    heartbeatFrequencyMS: 10000,
    autoIndex: process.env.NODE_ENV !== 'production',
    retryWrites: true,
    ssl: true,
  };

  mongoose.set('strictQuery', true);

  // Nettoyer les écouteurs existants
  mongoose.connection.removeAllListeners('connected');
  mongoose.connection.removeAllListeners('error');
  mongoose.connection.removeAllListeners('disconnected');

  // Configuration des événements
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
    startHealthMonitoring(); // Démarrer le monitoring
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error event received', {
      error: err.message,
      code: err.code,
      name: err.name,
    });
    cached.metrics.recordConnectionFailure(err);
    captureException(err, {
      tags: { service: 'database', action: 'connect' },
    });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    cached.metrics.recordDisconnection();

    // Reconnecter automatiquement en production
    if (!cached.isConnecting && process.env.NODE_ENV === 'production') {
      logger.info('Attempting to reconnect to MongoDB...');
      setTimeout(() => {
        dbConnect(true).catch((err) => {
          logger.error('Failed to reconnect to MongoDB', {
            error: err.message,
          });
        });
      }, 5000);
    }
  });

  // Gestion propre de l'arrêt
  const handleShutdown = async (signal) => {
    logger.info(`Received ${signal} signal, closing MongoDB connection`);
    await closeDbConnection();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Fonction de connexion avec circuit breaker
  const connectOperation = async () => {
    const startTime = cached.metrics.recordConnectionAttempt();

    try {
      logger.info('Attempting to connect to MongoDB via circuit breaker');

      const mongooseInstance = await mongoose.connect(MONGODB_URI, opts);

      cached.metrics.recordConnectionSuccess(startTime);
      logger.info('MongoDB connection established successfully');

      return mongooseInstance;
    } catch (err) {
      cached.metrics.recordConnectionFailure(err);

      logger.error('MongoDB connection attempt failed', {
        error: err.message,
        code: err.code,
        name: err.name,
      });

      // Informations détaillées sur l'erreur
      if (err.name === 'MongoServerSelectionError') {
        logger.error('Server selection error - check network or IP whitelist');
      }
      if (err.name === 'MongoNetworkError') {
        logger.error('Network error - check connectivity');
      }

      captureException(err, {
        tags: { service: 'database', action: 'connect' },
        level: 'error',
        extra: { circuitBreakerState: cached.circuitBreaker.state },
      });

      throw err;
    }
  };

  try {
    // Exécuter la connexion via le circuit breaker
    cached.promise = cached.circuitBreaker.execute(connectOperation);
    cached.conn = await cached.promise;

    return cached.conn;
  } catch (error) {
    cached.promise = null;

    // Log spécifique si le circuit breaker est ouvert
    if (error.message.includes('Circuit breaker OPEN')) {
      logger.error('MongoDB connection blocked by circuit breaker', {
        state: cached.circuitBreaker.state,
        metrics: cached.circuitBreaker.getMetrics(),
      });
    }

    throw error;
  } finally {
    cached.isConnecting = false;
  }
};

/**
 * Obtient les métriques complètes du système de base de données
 * @returns {Object} Métriques détaillées
 */
export const getDbMetrics = () => {
  return {
    connection: cached.metrics.getMetrics(),
    circuitBreaker: cached.circuitBreaker.getMetrics(),
    cache: cached.conn
      ? {
          readyState: cached.conn.connection.readyState,
          host: cached.conn.connection.host,
          port: cached.conn.connection.port,
          name: cached.conn.connection.name,
        }
      : null,
    lastHealthCheck: cached.lastHealthCheck,
    timestamp: new Date().toISOString(),
  };
};

export default dbConnect;
