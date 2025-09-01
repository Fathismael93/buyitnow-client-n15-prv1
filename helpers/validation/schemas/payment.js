// helpers/validation/schemas/payment.js
// Schémas de validation pour les paiements et la facturation

import * as yup from 'yup';
import { validationUtils, REGEX } from '../core/constants';
import {
  validateWithLogging,
  formatValidationErrors,
  validateBatch,
} from '../core/utils';
import { captureException } from '@/monitoring/sentry';

/**
 * Schéma de validation principal pour les paiements
 */
export const paymentSchema = yup.object().shape({
  paymentType: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Veuillez sélectionner un moyen de paiement')
    .max(100, 'Le nom du moyen de paiement est trop long')
    .test(
      'no-sql-injection',
      'Format de moyen de paiement non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de moyen de paiement non autorisé',
      validationUtils.noNoSqlInjection,
    )
    .test(
      'only-alphanumeric-and-spaces',
      'Le moyen de paiement contient des caractères non autorisés',
      (value) => {
        if (!value) return true;
        return /^[a-zA-Z0-9\u00C0-\u017F\s._'-]+$/.test(value);
      },
    ),

  accountName: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Le nom du compte est obligatoire')
    .min(3, 'Le nom du compte doit contenir au moins 3 caractères')
    .max(100, 'Le nom du compte ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z\u00C0-\u017F\s'-]+$/,
      'Le nom du compte ne doit contenir que des lettres, espaces et tirets',
    )
    .test(
      'no-sql-injection',
      'Format de nom de compte non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de nom de compte non autorisé',
      validationUtils.noNoSqlInjection,
    )
    .test(
      'no-consecutive-special-chars',
      'Le nom du compte contient trop de caractères spéciaux consécutifs',
      (value) => {
        if (!value) return true;
        return !/[^\w\s]{2,}/.test(value);
      },
    ),

  accountNumber: yup
    .string()
    .transform((value) => (value ? value.replace(/\s/g, '') : value))
    .required('Le numéro de compte est obligatoire')
    .matches(
      /^[0-9]{4,}$/,
      'Le numéro de compte doit contenir uniquement des chiffres (minimum 4)',
    )
    .min(4, 'Le numéro de compte doit contenir au moins 4 chiffres')
    .max(30, 'Le numéro de compte ne peut pas dépasser 30 chiffres')
    .test(
      'no-common-patterns',
      'Le numéro de compte ne doit pas contenir de séquences trop simples',
      (value) => {
        if (!value) return true;
        return !/(0000|1111|2222|3333|4444|5555|6666|7777|8888|9999|1234|4321|0123)/.test(
          value,
        );
      },
    )
    .test(
      'not-all-zeros',
      'Le numéro de compte ne peut pas être composé uniquement de zéros',
      (value) => {
        if (!value) return true;
        return !/^0+$/.test(value);
      },
    ),
});

/**
 * Schéma de validation pour les cartes de crédit
 */
export const creditCardSchema = yup.object().shape({
  cardNumber: yup
    .string()
    .transform((value) => (value ? value.replace(/[\s-]/g, '') : value))
    .required('Le numéro de carte est requis')
    .matches(/^[0-9]{13,19}$/, 'Format de numéro de carte invalide')
    .test('valid-card-number', 'Numéro de carte invalide', (value) => {
      if (!value) return true;
      return validateLuhn(value);
    })
    .test('supported-card-type', 'Type de carte non supporté', (value) => {
      if (!value) return true;
      const cardType = getCardType(value);
      const supportedTypes = ['visa', 'mastercard', 'amex', 'discover'];
      return supportedTypes.includes(cardType);
    }),

  expiryMonth: yup
    .number()
    .required("Le mois d'expiration est requis")
    .integer('Le mois doit être un entier')
    .min(1, 'Mois invalide')
    .max(12, 'Mois invalide'),

  expiryYear: yup
    .number()
    .required("L'année d'expiration est requise")
    .integer("L'année doit être un entier")
    .min(new Date().getFullYear(), 'La carte a expiré')
    .max(new Date().getFullYear() + 20, "Année d'expiration trop éloignée")
    .test('not-expired', 'La carte a expiré', function (value) {
      const { expiryMonth } = this.parent;
      if (!value || !expiryMonth) return true;

      const currentDate = new Date();
      const expiryDate = new Date(value, expiryMonth - 1);
      return expiryDate > currentDate;
    }),

  cvv: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Le code CVV est requis')
    .matches(/^[0-9]{3,4}$/, 'Le CVV doit contenir 3 ou 4 chiffres')
    .test(
      'cvv-length-for-card-type',
      'Longueur de CVV incorrecte pour ce type de carte',
      function (value) {
        const { cardNumber } = this.parent;
        if (!value || !cardNumber) return true;

        const cardType = getCardType(cardNumber);
        if (cardType === 'amex') {
          return value.length === 4;
        }
        return value.length === 3;
      },
    ),

  cardholderName: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Le nom du porteur est requis')
    .min(2, 'Nom trop court')
    .max(50, 'Nom trop long')
    .matches(
      /^[a-zA-Z\u00C0-\u017F\s'-]+$/,
      'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets',
    )
    .test(
      'no-sql-injection',
      'Format de nom non autorisé',
      validationUtils.noSqlInjection,
    ),
});

/**
 * Schéma de validation pour PayPal
 */
export const paypalSchema = yup.object().shape({
  email: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Email PayPal requis')
    .email("Format d'email invalide")
    .matches(REGEX.EMAIL, "Format d'email invalide")
    .max(100, 'Email trop long')
    .test(
      'no-sql-injection',
      "Format d'email non autorisé",
      validationUtils.noSqlInjection,
    ),

  paypalId: yup
    .string()
    .nullable()
    .transform(validationUtils.sanitizeString)
    .matches(/^[A-Z0-9]{13,17}$/, "Format d'ID PayPal invalide"),
});

/**
 * Schéma de validation pour virements bancaires
 */
export const bankTransferSchema = yup.object().shape({
  iban: yup
    .string()
    .transform((value) =>
      value ? value.replace(/\s/g, '').toUpperCase() : value,
    )
    .required('IBAN requis')
    .matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/, 'Format IBAN invalide')
    .test('valid-iban', 'IBAN invalide', validateIBAN),

  bic: yup
    .string()
    .transform((value) =>
      value ? value.replace(/\s/g, '').toUpperCase() : value,
    )
    .required('Code BIC requis')
    .matches(
      /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/,
      'Format BIC invalide',
    ),

  bankName: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Nom de la banque requis')
    .min(2, 'Nom de banque trop court')
    .max(100, 'Nom de banque trop long')
    .test(
      'no-sql-injection',
      'Format de nom de banque non autorisé',
      validationUtils.noSqlInjection,
    ),

  accountHolder: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Nom du titulaire requis')
    .min(2, 'Nom du titulaire trop court')
    .max(100, 'Nom du titulaire trop long')
    .matches(
      /^[a-zA-Z\u00C0-\u017F\s'-]+$/,
      'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets',
    )
    .test(
      'no-sql-injection',
      'Format de nom non autorisé',
      validationUtils.noSqlInjection,
    ),
});

/**
 * Schéma de validation pour les cryptomonnaies
 */
export const cryptoPaymentSchema = yup.object().shape({
  cryptoType: yup
    .string()
    .required('Type de cryptomonnaie requis')
    .oneOf(
      ['bitcoin', 'ethereum', 'litecoin', 'ripple'],
      'Cryptomonnaie non supportée',
    ),

  walletAddress: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Adresse de portefeuille requise')
    .test(
      'valid-crypto-address',
      'Adresse de portefeuille invalide',
      function (value) {
        const { cryptoType } = this.parent;
        if (!value || !cryptoType) return true;

        return validateCryptoAddress(value, cryptoType);
      },
    ),

  amount: yup
    .number()
    .required('Montant requis')
    .positive('Le montant doit être positif')
    .test(
      'valid-crypto-amount',
      'Montant de cryptomonnaie invalide',
      (value) => {
        if (!value) return true;
        // Vérifier que le montant n'a pas trop de décimales (8 max pour la plupart des cryptos)
        return Number(value.toFixed(8)) === value;
      },
    ),
});

/**
 * Schéma de validation pour les paiements mobiles
 */
export const mobilePaymentSchema = yup.object().shape({
  phoneNumber: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Numéro de téléphone requis')
    .matches(REGEX.PHONE, 'Format de téléphone invalide')
    .test(
      'is-valid-phone',
      'Numéro de téléphone invalide',
      validationUtils.isValidPhone,
    ),

  provider: yup
    .string()
    .required('Fournisseur de paiement mobile requis')
    .oneOf(
      ['orange_money', 'mtn_money', 'moov_money', 'wave'],
      'Fournisseur non supporté',
    ),

  pin: yup.string().when('provider', {
    is: (val) => ['orange_money', 'mtn_money'].includes(val),
    then: yup
      .string()
      .required('Code PIN requis')
      .matches(/^[0-9]{4,6}$/, 'Le PIN doit contenir 4 à 6 chiffres'),
    otherwise: yup.string().nullable(),
  }),
});

/**
 * Schéma de validation pour les factures
 */
export const invoiceSchema = yup.object().shape({
  invoiceNumber: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Numéro de facture requis')
    .matches(/^[A-Z0-9-]{3,20}$/, 'Format de numéro de facture invalide'),

  amount: yup
    .number()
    .required('Montant requis')
    .positive('Le montant doit être positif')
    .max(999999999, 'Montant trop élevé')
    .test('valid-decimal-places', 'Maximum 2 décimales autorisées', (value) => {
      if (!value) return true;
      return Number(value.toFixed(2)) === value;
    }),

  currency: yup
    .string()
    .required('Devise requise')
    .matches(/^[A-Z]{3}$/, 'Format de devise invalide (ex: EUR, USD)')
    .oneOf(['EUR', 'USD', 'GBP', 'CAD', 'XOF', 'XAF'], 'Devise non supportée'),

  taxRate: yup
    .number()
    .nullable()
    .min(0, 'Le taux de taxe ne peut pas être négatif')
    .max(100, 'Le taux de taxe ne peut pas dépasser 100%')
    .transform((value, originalValue) => {
      return originalValue === '' ? null : value;
    }),

  dueDate: yup
    .date()
    .nullable()
    .min(new Date(), "La date d'échéance ne peut pas être dans le passé")
    .max(
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      "La date d'échéance ne peut pas dépasser 1 an",
    ),

  description: yup
    .string()
    .nullable()
    .transform(validationUtils.sanitizeString)
    .max(500, 'Description trop longue')
    .test(
      'no-sql-injection',
      'Format de description non autorisé',
      validationUtils.noSqlInjection,
    ),
});

/**
 * Schéma de validation pour les remboursements
 */
export const refundSchema = yup.object().shape({
  originalTransactionId: yup
    .string()
    .required('ID de transaction original requis')
    .test(
      'is-valid-object-id',
      "Format d'ID de transaction invalide",
      validationUtils.isValidObjectId,
    ),

  refundAmount: yup
    .number()
    .required('Montant du remboursement requis')
    .positive('Le montant doit être positif')
    .max(999999999, 'Montant trop élevé'),

  reason: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Raison du remboursement requise')
    .min(10, 'La raison doit contenir au moins 10 caractères')
    .max(500, 'La raison ne peut pas dépasser 500 caractères')
    .test(
      'no-sql-injection',
      'Format de raison non autorisé',
      validationUtils.noSqlInjection,
    ),

  refundType: yup
    .string()
    .required('Type de remboursement requis')
    .oneOf(['full', 'partial'], 'Type de remboursement invalide'),
});

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Validation de l'algorithme de Luhn pour les cartes de crédit
 */
function validateLuhn(cardNumber) {
  if (!cardNumber || typeof cardNumber !== 'string') return false;

  let sum = 0;
  let isEven = false;

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber.charAt(i), 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Détection du type de carte de crédit
 */
function getCardType(cardNumber) {
  if (!cardNumber) return 'unknown';

  const patterns = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber)) {
      return type;
    }
  }

  return 'unknown';
}

/**
 * Validation de l'IBAN (International Bank Account Number)
 */
function validateIBAN(iban) {
  if (!iban) return false;

  // Supprimer les espaces et convertir en majuscules
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();

  // Vérifier la longueur (22 à 34 caractères)
  if (cleanIban.length < 22 || cleanIban.length > 34) return false;

  // Réorganiser: déplacer les 4 premiers caractères à la fin
  const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);

  // Remplacer les lettres par des chiffres (A=10, B=11, ..., Z=35)
  const numericString = rearranged.replace(/[A-Z]/g, (letter) => {
    return (letter.charCodeAt(0) - 55).toString();
  });

  // Calculer le modulo 97
  let remainder = 0;
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder * 10 + parseInt(numericString[i], 10)) % 97;
  }

  return remainder === 1;
}

/**
 * Validation des adresses de cryptomonnaies
 */
function validateCryptoAddress(address, cryptoType) {
  if (!address) return false;

  const patterns = {
    bitcoin: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
    ethereum: /^0x[a-fA-F0-9]{40}$/,
    litecoin: /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/,
    ripple: /^r[0-9a-zA-Z]{24,34}$/,
  };

  return patterns[cryptoType]?.test(address) || false;
}

// ==================== FONCTIONS DE VALIDATION AVANCÉES ====================

/**
 * Validation avec prise en compte du contexte des moyens de paiement disponibles
 */
export const validatePaymentDetails = async (
  paymentData,
  availablePaymentTypes = [],
) => {
  try {
    // Validation structurelle
    const validatedData = await validateWithLogging(
      paymentSchema,
      paymentData,
      {
        enableCache: true,
      },
    );

    // Vérification de disponibilité du moyen de paiement
    if (availablePaymentTypes.length > 0) {
      const paymentTypeExists = availablePaymentTypes.some(
        (pt) => pt.paymentName === validatedData.paymentType,
      );

      if (!paymentTypeExists) {
        throw new yup.ValidationError(
          "Le moyen de paiement sélectionné n'est pas disponible",
          validatedData.paymentType,
          'paymentType',
        );
      }
    }

    // Analyse heuristique du numéro de compte
    const accountNumber = validatedData.accountNumber;
    const suspiciousPatterns = [
      /^12345/, // Commence par 12345
      /98765$/, // Termine par 98765
      /(\d)\1{5,}/, // Plus de 5 chiffres identiques consécutifs
    ];

    const warnings = [];
    if (suspiciousPatterns.some((pattern) => pattern.test(accountNumber))) {
      console.warn('Numéro de compte potentiellement suspect détecté', {
        accountNumberPrefix: accountNumber.substring(0, 2) + '****',
      });
      warnings.push('pattern_warning');
    }

    return {
      isValid: true,
      data: validatedData,
      warnings,
    };
  } catch (error) {
    console.warn('Validation de paiement échouée', {
      errorCount: error.inner?.length || 1,
      fields: Object.keys(paymentData).filter(
        (key) => !key.includes('accountNumber'),
      ),
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Payment', action: 'validatePayment' },
        extra: {
          paymentTypeProvided: !!paymentData.paymentType,
        },
      });
    }

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation de carte de crédit avec vérifications avancées
 */
export const validateCreditCard = async (cardData) => {
  try {
    const validatedData = await validateWithLogging(
      creditCardSchema,
      cardData,
      {
        enableCache: false, // Pas de cache pour les données sensibles
      },
    );

    // Vérifications de sécurité supplémentaires
    const securityFlags = [];

    // Vérifier que la carte n'expire pas dans les 30 prochains jours
    const expiryDate = new Date(
      validatedData.expiryYear,
      validatedData.expiryMonth - 1,
    );
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (expiryDate <= thirtyDaysFromNow) {
      securityFlags.push('card_expiring_soon');
    }

    // Détection du type de carte pour le retour d'information
    const cardType = getCardType(validatedData.cardNumber);

    return {
      isValid: true,
      data: {
        ...validatedData,
        // Masquer le numéro de carte dans la réponse
        cardNumber: '**** **** **** ' + validatedData.cardNumber.slice(-4),
      },
      cardType,
      securityFlags,
    };
  } catch (error) {
    console.warn('Validation de carte de crédit échouée', {
      error: error.message,
      hasCardNumber: !!cardData.cardNumber,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation batch pour plusieurs méthodes de paiement
 */
export const validatePaymentMethodsBatch = async (
  paymentMethods,
  options = {},
) => {
  try {
    const { results, errors } = await validateBatch(
      paymentSchema,
      paymentMethods,
      {
        concurrent: 3, // Limite pour les données sensibles
        stopOnFirstError: false,
        ...options,
      },
    );

    // Analyse des patterns suspects sur l'ensemble
    const suspiciousPayments = results.filter((result) => {
      const accountNumber = result.data.accountNumber;
      return /^(12345|98765|(\d)\1{4,})/.test(accountNumber);
    });

    return {
      isValid: errors.length === 0,
      validatedData: results.map((r) => r.data),
      errors: errors.map((e) => ({
        index: e.index,
        errors: formatValidationErrors(e.error),
      })),
      securityAnalysis: {
        suspiciousCount: suspiciousPayments.length,
        totalProcessed: results.length,
      },
    };
  } catch (error) {
    console.warn('Validation batch des paiements échouée', {
      error: error.message,
      count: paymentMethods.length,
    });

    return {
      isValid: false,
      errors: [{ general: 'Erreur de validation batch des paiements' }],
    };
  }
};

/**
 * Validation de remboursement avec vérifications métier
 */
export const validateRefund = async (
  refundData,
  originalTransaction = null,
) => {
  try {
    const validatedData = await validateWithLogging(refundSchema, refundData);

    const warnings = [];

    // Vérifier que le montant de remboursement ne dépasse pas le montant original
    if (originalTransaction) {
      if (validatedData.refundAmount > originalTransaction.amount) {
        throw new yup.ValidationError(
          'Le montant du remboursement ne peut pas dépasser le montant original',
          validatedData.refundAmount,
          'refundAmount',
        );
      }

      // Vérifier le délai de remboursement (ex: pas de remboursement après 90 jours)
      const transactionDate = new Date(originalTransaction.createdAt);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      if (transactionDate < ninetyDaysAgo) {
        warnings.push('transaction_too_old_for_refund');
      }
    }

    return {
      isValid: true,
      data: validatedData,
      warnings,
    };
  } catch (error) {
    console.warn('Validation de remboursement échouée', {
      error: error.message,
      refundAmount: refundData?.refundAmount,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation de facture avec calculs automatiques
 */
export const validateInvoice = async (invoiceData) => {
  try {
    const validatedData = await validateWithLogging(invoiceSchema, invoiceData);

    // Calculs automatiques
    const calculations = {
      subtotal: validatedData.amount,
      taxAmount: validatedData.taxRate
        ? (validatedData.amount * validatedData.taxRate) / 100
        : 0,
    };

    calculations.total = calculations.subtotal + calculations.taxAmount;

    // Vérifications métier
    const warnings = [];

    if (calculations.total > 10000) {
      warnings.push('high_amount_invoice');
    }

    if (validatedData.dueDate && validatedData.dueDate <= new Date()) {
      warnings.push('due_date_in_past');
    }

    return {
      isValid: true,
      data: validatedData,
      calculations,
      warnings,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};
