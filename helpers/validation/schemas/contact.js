// helpers/validation/schemas/contact.js
// Schéma de validation pour le formulaire de contact - Version simplifiée
// Aligné sur le composant Contact.jsx

import * as yup from 'yup';
import { validationUtils } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

/**
 * Schéma de validation principal pour le formulaire de contact
 * Correspond exactement aux champs du composant Contact.jsx
 */
export const contactSchema = yup.object().shape({
  // Sujet du message (obligatoire)
  subject: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Le sujet est obligatoire')
    .min(3, 'Le sujet doit contenir au moins 3 caractères')
    .max(100, 'Le sujet ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z0-9\s\u00C0-\u017F.,!?'\-()]+$/,
      'Le sujet contient des caractères non autorisés',
    )
    .test(
      'no-sql-injection',
      'Format de sujet non autorisé',
      validationUtils.noSqlInjection,
    ),

  // Message (obligatoire)
  message: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Le message est obligatoire')
    .min(10, 'Le message doit contenir au moins 10 caractères')
    .max(1000, 'Le message ne peut pas dépasser 1000 caractères')
    .test(
      'no-sql-injection',
      'Format de message non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-excessive-caps',
      "Évitez d'utiliser trop de majuscules",
      (value) => {
        if (!value) return true;
        const letters = value.replace(/[^a-zA-Z]/g, '');
        if (letters.length === 0) return true;
        const uppercaseRatio =
          letters.split('').filter((char) => char === char.toUpperCase())
            .length / letters.length;
        return uppercaseRatio <= 0.8; // Maximum 80% de majuscules
      },
    ),
});

// ==================== FONCTIONS DE VALIDATION ====================

/**
 * Détection simple de spam (version allégée)
 */
function detectBasicSpam(content) {
  const spamKeywords = [
    'viagra',
    'casino',
    'lottery',
    'free money',
    'click here',
    'buy now',
    'guaranteed',
    'act now',
    'limited time',
  ];

  const lowerContent = content.toLowerCase();
  const detectedSpam = spamKeywords.filter((keyword) =>
    lowerContent.includes(keyword),
  );

  // Détection de patterns suspects simples
  const suspiciousPatterns = [
    /(https?:\/\/[^\s]+.*){3,}/g, // 3+ URLs
    /(.)\1{5,}/g, // Caractères répétés 5+ fois
    /[^\w\s]{5,}/g, // 5+ caractères spéciaux consécutifs
  ];

  const hasPatterns = suspiciousPatterns.some((pattern) =>
    pattern.test(content),
  );

  return {
    isSpam: detectedSpam.length > 0 || hasPatterns,
    spamKeywords: detectedSpam,
    hasPatterns,
  };
}

/**
 * Validation principale du message de contact
 */
export const validateContactMessage = async (contactData) => {
  try {
    const validatedData = await validateWithLogging(
      contactSchema,
      contactData,
      { enableCache: true },
    );

    // Vérifications anti-spam simples
    const combinedText = `${validatedData.subject} ${validatedData.message}`;
    const spamCheck = detectBasicSpam(combinedText);

    const warnings = [];
    const securityFlags = [];

    // Marquer si potentiel spam
    if (spamCheck.isSpam) {
      securityFlags.push('potential_spam');
      warnings.push('spam_detected');
    }

    // Vérifier si message très court
    if (validatedData.message.length < 20) {
      warnings.push('very_short_message');
    }

    // Vérifier si beaucoup de majuscules
    const uppercaseRatio =
      validatedData.message
        .replace(/[^a-zA-Z]/g, '')
        .split('')
        .filter((char) => char === char.toUpperCase()).length /
        validatedData.message.replace(/[^a-zA-Z]/g, '').length || 0;
    if (uppercaseRatio > 0.6) {
      warnings.push('excessive_capitals');
    }

    return {
      isValid: true,
      data: validatedData,
      warnings,
      securityFlags,
      spamAnalysis: spamCheck,
    };
  } catch (error) {
    console.warn('Erreur validation contact:', error.message);

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Classification simple du type de message (optionnel)
 */
export const classifyMessageType = (subject, message) => {
  const content = `${subject} ${message}`.toLowerCase();

  const types = {
    support: ['aide', 'problème', 'erreur', 'bug', 'support'],
    complaint: ['plainte', 'réclamation', 'insatisfait', 'remboursement'],
    question: ['question', 'comment', 'pourquoi', 'quand', 'où'],
    compliment: ['merci', 'félicitation', 'excellent', 'parfait'],
    suggestion: ['suggestion', 'amélioration', 'fonctionnalité', 'idée'],
  };

  for (const [type, keywords] of Object.entries(types)) {
    if (keywords.some((keyword) => content.includes(keyword))) {
      return type;
    }
  }

  return 'general';
};

/**
 * Vérifier si le message semble urgent
 */
export const isMessageUrgent = (subject, message) => {
  const content = `${subject} ${message}`.toLowerCase();
  const urgentKeywords = [
    'urgent',
    'immédiat',
    'rapidement',
    'asap',
    'le plus vite possible',
    'en urgence',
  ];

  return urgentKeywords.some((keyword) => content.includes(keyword));
};

/**
 * Formater le message pour l'envoi par email
 */
export const formatContactEmail = (contactData, userInfo = null) => {
  const { subject, message } = contactData;

  const messageType = classifyMessageType(subject, message);
  const isUrgent = isMessageUrgent(subject, message);

  return {
    subject: `[${messageType.toUpperCase()}] ${subject}`,
    message: message,
    priority: isUrgent ? 'high' : 'normal',
    category: messageType,
    user: userInfo
      ? {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
        }
      : null,
    timestamp: new Date().toISOString(),
  };
};
