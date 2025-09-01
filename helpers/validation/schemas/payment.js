// helpers/validation/schemas/payment.js
// Schémas de validation pour les paiements avec plateformes djiboutiennes
// Version simplifiée pour 500 visiteurs/jour

import * as yup from 'yup';
import { validationUtils } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

/**
 * Plateformes de paiement supportées à Djibouti
 */
export const SUPPORTED_PLATFORMS = ['waafi', 'cac-pay', 'bci-pay', 'd-money'];

/**
 * Schéma de validation principal pour les paiements djiboutiens
 */
export const djiboutiPaymentSchema = yup.object().shape({
  // Plateforme sélectionnée (radiobutton)
  paymentPlatform: yup
    .string()
    .required('Veuillez sélectionner une plateforme de paiement')
    .oneOf(
      SUPPORTED_PLATFORMS,
      'Plateforme non supportée. Choisissez: WAAFI, CAC-PAY, BCI-PAY ou D-MONEY',
    ),

  // Nom complet (input text)
  accountHolderName: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Le nom complet est obligatoire')
    .min(3, 'Le nom doit contenir au moins 3 caractères')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z\u00C0-\u017F\s'-]+$/,
      'Le nom ne doit contenir que des lettres, espaces et tirets',
    )
    .test(
      'has-first-and-last-name',
      'Veuillez saisir votre prénom et nom',
      (value) => {
        if (!value) return true;
        const words = value.trim().split(/\s+/);
        return words.length >= 2 && words.every((word) => word.length >= 2);
      },
    ),

  // Numéro de téléphone djiboutien (input tel)
  phoneNumber: yup
    .string()
    .transform((value) => (value ? value.replace(/\s|-/g, '') : value))
    .required('Le numéro de téléphone est obligatoire')
    .matches(
      /^77[0-9]{6}$/,
      'Format requis: 77XXXXXX (8 chiffres commençant par 77)',
    )
    .test('not-too-simple', 'Numéro invalide', (value) => {
      if (!value) return true;
      // Éviter les patterns trop évidents
      return !/(77000000|77111111|77123456|77654321)/.test(value);
    }),
});

/**
 * Schéma pour les factures (version simplifiée)
 */
export const simpleInvoiceSchema = yup.object().shape({
  amount: yup
    .number()
    .required('Montant requis')
    .positive('Le montant doit être positif')
    .max(999999, 'Montant trop élevé'),

  currency: yup
    .string()
    .required('Devise requise')
    .oneOf(['DJF', 'USD'], 'Devise non supportée'),

  description: yup.string().nullable().max(200, 'Description trop longue'),
});

// ==================== FONCTIONS UTILITAIRES SIMPLES ====================

/**
 * Noms d'affichage des plateformes
 */
const PLATFORM_NAMES = {
  waafi: 'WAAFI',
  'cac-pay': 'CAC-PAY',
  'bci-pay': 'BCI-PAY',
  'd-money': 'D-MONEY',
};

/**
 * Obtenir le nom d'affichage d'une plateforme
 */
export const getPlatformName = (platform) => {
  return PLATFORM_NAMES[platform] || platform.toUpperCase();
};

/**
 * Obtenir la liste des plateformes pour le formulaire
 */
export const getPlatformOptions = () => {
  return SUPPORTED_PLATFORMS.map((platform) => ({
    value: platform,
    label: getPlatformName(platform),
  }));
};

/**
 * Validation du format téléphone djiboutien
 */
export const isValidDjiboutiPhone = (phone) => {
  if (!phone) return false;
  const cleaned = phone.replace(/\s|-/g, '');
  return /^77[0-9]{6}$/.test(cleaned);
};

/**
 * Formater un numéro pour l'affichage (+253 77 XX XX XX)
 */
export const formatDjiboutiPhone = (phone) => {
  if (!phone || phone.length !== 8) return phone;
  return `+253 ${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 6)} ${phone.slice(6, 8)}`;
};

// ==================== FONCTION DE VALIDATION PRINCIPALE ====================

/**
 * Validation principale pour les paiements djiboutiens
 */
export const validateDjiboutiPayment = async (paymentData) => {
  try {
    const validatedData = await validateWithLogging(
      djiboutiPaymentSchema,
      paymentData,
    );

    // Formatage pour l'affichage
    const result = {
      ...validatedData,
      platformDisplayName: getPlatformName(validatedData.paymentPlatform),
      formattedPhone: formatDjiboutiPhone(validatedData.phoneNumber),
    };

    return {
      isValid: true,
      data: result,
    };
  } catch (error) {
    console.warn('Erreur validation paiement:', error.message);

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation de facture simplifiée
 */
export const validateSimpleInvoice = async (invoiceData) => {
  try {
    const validatedData = await validateWithLogging(
      simpleInvoiceSchema,
      invoiceData,
    );

    // Calcul simple de la TVA (7% à Djibouti)
    const tax = validatedData.amount * 0.07;
    const total = validatedData.amount + tax;

    return {
      isValid: true,
      data: validatedData,
      calculations: {
        subtotal: validatedData.amount,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100,
      },
    };
  } catch (error) {
    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};
