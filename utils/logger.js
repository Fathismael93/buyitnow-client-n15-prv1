import winston from 'winston';
import 'winston-daily-rotate-file';
import { hostname } from 'os';
import { join } from 'path';
import chalk from 'chalk';

// Constantes pour les niveaux de log
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Constantes pour les répertoires de logs
const LOG_DIR = process.env.LOG_DIR || 'logs';
const ERROR_LOG_DIR = join(LOG_DIR, 'error');
const COMBINED_LOG_DIR = join(LOG_DIR, 'combined');

// Configuration selon l'environnement
const isDevelopment = process.env.NODE_ENV !== 'production';
const defaultLevel = isDevelopment ? 'debug' : 'info';

// Fonction pour masquer les données sensibles dans les logs
const maskSensitiveData = (info) => {
  if (!info) return info;

  // Cloner l'objet pour ne pas modifier l'original
  const maskedInfo = { ...info };

  // Liste des clés sensibles à masquer
  const sensitiveKeys = [
    'password',
    'token',
    'apiKey',
    'secret',
    'Authorization',
    'cookie',
    'jwt',
    'credit_card',
    'cardNumber',
    'cvv',
    'ssn',
    'email',
    'phone',
    'address',
  ];

  // Fonction récursive pour parcourir l'objet
  const maskRecursively = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    Object.keys(obj).forEach((key) => {
      // Vérifier si la clé est sensible (check partiel)
      const isSensitive = sensitiveKeys.some((sensitiveKey) =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase()),
      );

      if (
        isSensitive &&
        (typeof obj[key] === 'string' || typeof obj[key] === 'number')
      ) {
        // Masquer les valeurs sensibles
        const value = String(obj[key]);
        if (value.length > 0) {
          if (key.toLowerCase().includes('email')) {
            // Format spécial pour les emails
            const [name, domain] = value.split('@');
            if (domain) {
              obj[key] = `${name.charAt(0)}****@${domain}`;
            } else {
              obj[key] = '****';
            }
          } else {
            // Masquage standard pour les autres valeurs
            obj[key] =
              value.length > 4
                ? `${value.substr(0, 2)}****${value.substr(-2)}`
                : '****';
          }
        }
      } else if (obj[key] && typeof obj[key] === 'object') {
        // Récursion pour les objets imbriqués
        maskRecursively(obj[key]);
      }
    });

    return obj;
  };

  // Appliquer le masquage aux données de log
  if (maskedInfo.message && typeof maskedInfo.message === 'object') {
    maskedInfo.message = maskRecursively({ ...maskedInfo.message });
  }

  if (maskedInfo.meta) {
    maskedInfo.meta = maskRecursively({ ...maskedInfo.meta });
  }

  // Parcourir les propriétés de premier niveau
  Object.keys(maskedInfo).forEach((key) => {
    if (
      key !== 'message' &&
      key !== 'meta' &&
      typeof maskedInfo[key] === 'object'
    ) {
      maskedInfo[key] = maskRecursively({ ...maskedInfo[key] });
    }
  });

  return maskedInfo;
};

// Format personnalisé pour le développement (console colorée)
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => maskSensitiveData(info))(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Formater le niveau de log avec des couleurs
    let colorizedLevel;
    switch (level) {
      case 'error':
        colorizedLevel = chalk.bold.red(level);
        break;
      case 'warn':
        colorizedLevel = chalk.keyword('orange')(level);
        break;
      case 'info':
        colorizedLevel = chalk.green(level);
        break;
      case 'http':
        colorizedLevel = chalk.cyan(level);
        break;
      case 'debug':
        colorizedLevel = chalk.blue(level);
        break;
      default:
        colorizedLevel = level;
    }

    // Extraire le stack si présent
    const stack = meta.stack ? `\n${meta.stack}` : '';
    delete meta.stack;

    // Déterminer si nous avons des métadonnées à afficher
    const metaStr =
      Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';

    // Formater le message final
    return `${chalk.gray(timestamp)} [${colorizedLevel}]: ${message}${stack}${metaStr}`;
  }),
);

// Format pour la production (JSON bien structuré)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format((info) => maskSensitiveData(info))(),
  winston.format.json(),
);

// Configuration des options de rotation de fichiers
const fileRotateOptions = {
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
  createSymlink: true,
  symlinkName: 'current.log',
  // Ajouter des informations de contexte
  meta: true,
  // Ajouter le hostname pour les environnements multi-instances
  hostname: hostname(),
};

// Définir les transports selon l'environnement
const transports = [];

// Transport pour la console (toujours actif)
transports.push(
  new winston.transports.Console({
    format: isDevelopment ? developmentFormat : winston.format.simple(),
    level: isDevelopment ? 'debug' : 'info',
  }),
);

// En production, ajouter des transports de fichiers
if (!isDevelopment) {
  // Transport pour les logs d'erreur
  transports.push(
    new winston.transports.DailyRotateFile({
      level: 'error',
      filename: join(ERROR_LOG_DIR, '%DATE%-error.log'),
      ...fileRotateOptions,
    }),
  );

  // Transport pour tous les logs
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: join(COMBINED_LOG_DIR, '%DATE%-combined.log'),
      ...fileRotateOptions,
    }),
  );

  // Transport HTTP pour intégration avec des services de monitoring (optionnel)
  if (process.env.LOG_HTTP_ENDPOINT) {
    transports.push(
      new winston.transports.Http({
        host: process.env.LOG_HTTP_HOST,
        port: process.env.LOG_HTTP_PORT,
        path: process.env.LOG_HTTP_PATH,
        ssl: process.env.LOG_HTTP_SSL === 'true',
        level: 'warn', // Envoyer seulement les warnings et erreurs
      }),
    );
  }
}

// Créer le logger avec les configurations
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || defaultLevel,
  levels: LOG_LEVELS,
  format: isDevelopment ? developmentFormat : productionFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'api-services',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
  },
  transports,
  // Ne pas planter en cas d'erreur dans le logger
  exitOnError: false,
  // Limiter la profondeur des objets pour éviter les problèmes de performance
  depth: 5,
  // Silence les logs pendant les tests
  silent: process.env.NODE_ENV === 'test',
});

// Gestion des exceptions non captées
logger.exceptions.handle(
  new winston.transports.File({
    filename: join(ERROR_LOG_DIR, 'exceptions.log'),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
  }),
);

// Gestion des rejets de promesses non gérés
logger.rejections.handle(
  new winston.transports.File({
    filename: join(ERROR_LOG_DIR, 'rejections.log'),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
  }),
);

// Ajouter des méthodes utilitaires
logger.startTimer = () => {
  const start = process.hrtime();
  return {
    done: (info) => {
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = seconds * 1000 + nanoseconds / 1000000;
      logger.info({
        ...info,
        duration: `${duration.toFixed(3)}ms`,
      });
      return duration;
    },
  };
};

// Créer un stream pour Morgan (middleware HTTP logging)
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Fonction pour créer un logger de composant spécifique
logger.getComponentLogger = (component) => {
  const componentLogger = {};

  // Définir les méthodes pour chaque niveau
  Object.keys(LOG_LEVELS).forEach((level) => {
    componentLogger[level] = (message, meta = {}) => {
      return logger[level](message, { ...meta, component });
    };
  });

  // Ajouter les méthodes auxiliaires
  componentLogger.stream = logger.stream;
  componentLogger.startTimer = logger.startTimer;

  return componentLogger;
};

// Vérifier que tout est configuré correctement
logger.info('Logger initialized', {
  environment: process.env.NODE_ENV || 'development',
  level: logger.level,
  transports: logger.transports.map((t) => t.name),
});

export default logger;
