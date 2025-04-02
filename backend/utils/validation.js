/**
 * Vérifie si une chaîne est une URI MongoDB valide
 * @param {string} uri - URI à valider
 * @returns {boolean} - True si l'URI est valide
 */
export function isValidMongoURI(uri) {
  if (!uri || typeof uri !== 'string') {
    return false;
  }

  // Vérifier si l'URI commence par mongodb:// ou mongodb+srv://
  const validProtocols = ['mongodb://', 'mongodb+srv://'];
  const hasValidProtocol = validProtocols.some((protocol) =>
    uri.startsWith(protocol),
  );

  if (!hasValidProtocol) {
    return false;
  }

  try {
    // Vérifier si l'URI peut être construite en URL valide
    // Note: cette vérification est assez permissive
    const url = new URL(uri);

    // Vérifier qu'il y a un hôte valide
    if (!url.hostname) {
      return false;
    }

    // Vérifications supplémentaires spécifiques à MongoDB
    // Si l'URI contient des paramètres d'authentification, ils doivent être correctement formatés
    if (url.username && !url.password) {
      // MongoDB nécessite généralement un mot de passe si un nom d'utilisateur est spécifié
      // Mais certaines configurations pourraient ne pas en avoir besoin
      // donc nous ne considérons pas cela comme une erreur fatale
    }

    // Vérifier si un nom de base de données est spécifié (après le premier slash)
    // Non obligatoire, mais typique dans une URI MongoDB
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) {
      // C'est OK, pas de base de données spécifiée
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Vérifie si un serveur MongoDB est accessible
 * @param {string} uri - URI MongoDB
 * @param {number} timeoutMs - Délai d'attente en ms avant échec
 * @returns {Promise<boolean>} - True si le serveur est accessible
 */
export async function isMongoDBAvailable(uri, timeoutMs = 5000) {
  const mongoose = require('mongoose');

  // Créer une instance Mongoose temporaire pour le test
  const tempMongoose = new mongoose.Mongoose();

  try {
    // Définir un délai d'attente court pour ce test
    const connectOpts = {
      connectTimeoutMS: timeoutMs,
      socketTimeoutMS: timeoutMs,
      serverSelectionTimeoutMS: timeoutMs,
      bufferCommands: false,
    };

    // Tenter de se connecter
    await tempMongoose.connect(uri, connectOpts);

    // Fermer la connexion si réussie
    await tempMongoose.connection.close();
    return true;
  } catch (error) {
    // Essayer de fermer la connexion en cas d'erreur
    try {
      await tempMongoose.connection.close();
    } catch (closeError) {
      // Ignorer les erreurs lors de la fermeture
    }
    return false;
  }
}

/**
 * Vérifie si une collection existe dans une base de données MongoDB
 * @param {mongoose.Connection} connection - Connexion Mongoose
 * @param {string} collectionName - Nom de la collection à vérifier
 * @returns {Promise<boolean>} - True si la collection existe
 */
export async function collectionExists(connection, collectionName) {
  try {
    const collections = await connection.db
      .listCollections({ name: collectionName })
      .toArray();
    return collections.length > 0;
  } catch (error) {
    throw new Error(`Failed to check collection existence: ${error.message}`);
  }
}

/**
 * Vérifie l'état de la réplication pour les clusters MongoDB
 * @param {mongoose.Connection} connection - Connexion Mongoose
 * @returns {Promise<Object>} - Statut de la réplication
 */
export async function checkReplicationStatus(connection) {
  try {
    const status = await connection.db.admin().replSetGetStatus();
    return {
      isReplicaSet: true,
      members: status.members.map((member) => ({
        id: member._id,
        name: member.name,
        state: member.stateStr,
        health: member.health === 1,
        uptime: member.uptime,
      })),
      primary:
        status.members.find((m) => m.stateStr === 'PRIMARY')?.name || null,
      hasWriteMajority: status.writeMajorityStatus === 1,
    };
  } catch (error) {
    // Si la commande échoue car ce n'est pas un replica set
    if (error.codeName === 'NoReplicationEnabled') {
      return {
        isReplicaSet: false,
        message: 'This MongoDB instance is not running as a replica set',
      };
    }
    throw new Error(`Failed to check replication status: ${error.message}`);
  }
}
