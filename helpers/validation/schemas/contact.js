/**
 * Informations requises selon le type de problème
 */
function getRequiredInfoForIssue(issueType) {
  const requirements = {
    login_issue: ['email', 'last_successful_login', 'error_message'],
    payment_problem: ['order_id', 'payment_method', 'error_code'],
    product_defect: ['product_id', 'purchase_date', 'defect_description'],
    delivery_issue: ['order_id', 'expected_delivery_date', 'tracking_number'],
    account_access: ['email', 'last_login_attempt', 'error_details'],
    feature_request: ['feature_description', 'use_case', 'priority_level'],
    bug_report: ['steps_to_reproduce', 'expected_behavior', 'actual_behavior'],
    other: ['detailed_description', 'relevant_context'],
  };

  return requirements[issueType] || requirements.other;
}

/**
 * Actions suggérées selon le type de problème
 */
function getSuggestedActions(issueType) {
  const actions = {
    login_issue: [
      'reset_password',
      'clear_browser_cache',
      'check_email_verification',
      'verify_account_status',
    ],
    payment_problem: [
      'verify_payment_method',
      'check_transaction_status',
      'contact_bank',
      'retry_payment',
    ],
    product_defect: [
      'document_issue_photos',
      'check_warranty_status',
      'prepare_return_process',
      'contact_manufacturer',
    ],
    delivery_issue: [
      'track_package',
      'contact_carrier',
      'verify_delivery_address',
      'check_delivery_instructions',
    ],
    account_access: [
      'reset_password',
      'verify_email',
      'check_account_suspension',
      'contact_support',
    ],
    feature_request: [
      'check_roadmap',
      'provide_detailed_specs',
      'gather_user_feedback',
      'prioritize_request',
    ],
    bug_report: [
      'gather_reproduction_steps',
      'collect_system_info',
      'check_known_issues',
      'create_bug_ticket',
    ],
    other: [
      'gather_more_information',
      'escalate_to_specialist',
      'review_documentation',
      'schedule_follow_up',
    ],
  };

  return actions[issueType] || actions.other;
}

/**
 * Analyse des mots-clés de spam avec scoring pondéré
 */
function analyzeSpamKeywords(content) {
  const spamCategories = {
    // Mots-clés de haute priorité (score élevé)
    highRisk: {
      keywords: [
        'viagra',
        'cialis',
        'casino',
        'lottery',
        'prize winner',
        'congratulations',
        'urgent action required',
        'act now',
        'limited time offer',
        'free money',
        'guaranteed income',
        'work from home',
        'make money fast',
        'investment opportunity',
      ],
      weight: 3,
    },
    // Mots-clés de risque moyen
    mediumRisk: {
      keywords: [
        'click here',
        'buy now',
        'special offer',
        'exclusive deal',
        'lose weight',
        'miracle cure',
        'amazing results',
        'no risk',
        'satisfaction guaranteed',
        'call now',
      ],
      weight: 2,
    },
    // Mots-clés de faible risque
    lowRisk: {
      keywords: [
        'promotion',
        'discount',
        'sale',
        'offer',
        'deal',
        'subscription',
        'newsletter',
        'update',
      ],
      weight: 1,
    },
  };

  let totalScore = 0;
  const detectedKeywords = [];
  const lowerContent = content.toLowerCase();

  Object.entries(spamCategories).forEach(([category, config]) => {
    config.keywords.forEach((keyword) => {
      if (lowerContent.includes(keyword.toLowerCase())) {
        totalScore += config.weight;
        detectedKeywords.push({ keyword, category, weight: config.weight });
      }
    });
  });

  return {
    score: totalScore,
    keywords: detectedKeywords,
    categories: [...new Set(detectedKeywords.map((k) => k.category))],
  };
}

/**
 * Détection de patterns suspects dans le contenu
 */
function detectSuspiciousPatterns(content) {
  const patterns = {
    // URLs multiples (plus de 3)
    multipleUrls: {
      pattern: /(https?:\/\/[^\s]+)/g,
      threshold: 3,
      weight: 2,
    },
    // Emails multiples (plus de 2)
    multipleEmails: {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      threshold: 2,
      weight: 2,
    },
    // Numéros de téléphone multiples (plus de 2)
    multiplePhones: {
      pattern: /\b\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4,6}\b/g,
      threshold: 2,
      weight: 2,
    },
    // Caractères répétés (plus de 5 fois)
    repeatedChars: {
      pattern: /(.)\1{5,}/g,
      threshold: 0,
      weight: 2,
    },
    // Majuscules excessives (plus de 70%)
    excessiveCaps: {
      test: (text) => {
        const letters = text.replace(/[^a-zA-Z]/g, '');
        if (letters.length === 0) return false;
        const upperRatio =
          letters.split('').filter((c) => c === c.toUpperCase()).length /
          letters.length;
        return upperRatio > 0.7;
      },
      weight: 2,
    },
    // Caractères spéciaux excessifs
    excessiveSpecialChars: {
      pattern: /[^\w\s]{3,}/g,
      threshold: 0,
      weight: 1,
    },
  };

  let suspiciousScore = 0;
  const detectedPatterns = [];

  Object.entries(patterns).forEach(([name, config]) => {
    if (config.test) {
      // Pattern avec fonction de test custom
      if (config.test(content)) {
        suspiciousScore += config.weight;
        detectedPatterns.push(name);
      }
    } else {
      // Pattern avec regex
      const matches = content.match(config.pattern) || [];
      if (matches.length > config.threshold) {
        suspiciousScore += config.weight;
        detectedPatterns.push(name);
      }
    }
  });

  return {
    score: suspiciousScore,
    patterns: detectedPatterns,
  };
}

/**
 * Analyse anti-spam complète et améliorée
 */
function analyzeSpamContent(content) {
  const keywordAnalysis = analyzeSpamKeywords(content);
  const patternAnalysis = detectSuspiciousPatterns(content);

  const totalScore = keywordAnalysis.score + patternAnalysis.score;

  // Détection de langue suspecte (non français/anglais)
  const suspiciousLanguageScore = detectSuspiciousLanguage(content);

  // Score final ajusté
  const finalScore = totalScore + suspiciousLanguageScore;

  // Classification du niveau de spam
  let spamLevel = 'clean';
  if (finalScore >= 8) spamLevel = 'high_spam';
  else if (finalScore >= 5) spamLevel = 'medium_spam';
  else if (finalScore >= 2) spamLevel = 'low_spam';

  return {
    spamScore: finalScore,
    spamLevel,
    isLikelySpam: finalScore >= 5,
    requiresModeration: finalScore >= 3,
    analysis: {
      keywords: keywordAnalysis,
      patterns: patternAnalysis,
      languageScore: suspiciousLanguageScore,
    },
    spamFlags: [
      ...keywordAnalysis.keywords.map((k) => `spam_keyword_${k.category}`),
      ...patternAnalysis.patterns.map((p) => `suspicious_${p}`),
    ],
  };
}

/**
 * Détection de langue suspecte
 */
function detectSuspiciousLanguage(content) {
  // Caractères non-latin suspects (potentiels caractères de substitution)
  const suspiciousChars = /[^\u0000-\u017F\u00C0-\u017F]/g;
  const suspiciousMatches = content.match(suspiciousChars) || [];

  // Trop de caractères non-latin pourrait indiquer du spam
  const suspiciousRatio = suspiciousMatches.length / content.length;

  if (suspiciousRatio > 0.3) return 3; // Score élevé si plus de 30% de caractères suspects
  if (suspiciousRatio > 0.1) return 1; // Score moyen si plus de 10%

  return 0;
}

/**
 * Analyse de sentiment améliorée avec score de confiance
 */
function analyzeSentiment(text) {
  const sentimentWords = {
    veryPositive: {
      words: [
        'excellent',
        'fantastique',
        'parfait',
        'merveilleux',
        'exceptionnel',
        'génial',
      ],
      weight: 3,
    },
    positive: {
      words: [
        'bien',
        'bon',
        'super',
        'cool',
        'sympa',
        'agréable',
        'satisfait',
        'content',
      ],
      weight: 2,
    },
    negative: {
      words: [
        'mauvais',
        'nul',
        'décevant',
        'problème',
        'erreur',
        'bug',
        'lent',
      ],
      weight: -2,
    },
    veryNegative: {
      words: [
        'horrible',
        'terrible',
        'catastrophique',
        'scandaleux',
        'inacceptable',
        'arnaque',
      ],
      weight: -3,
    },
  };

  const lowerText = text.toLowerCase();
  let sentimentScore = 0;
  let totalWords = 0;
  const detectedWords = [];

  Object.entries(sentimentWords).forEach(([category, config]) => {
    config.words.forEach((word) => {
      const matches = (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || [])
        .length;
      if (matches > 0) {
        sentimentScore += matches * config.weight;
        totalWords += matches;
        detectedWords.push({ word, category, matches, weight: config.weight });
      }
    });
  });

  // Normalisation du score
  const normalizedScore = totalWords > 0 ? sentimentScore / totalWords : 0;

  // Détermination du sentiment
  let sentiment = 'neutral';
  let confidence = 0;

  if (normalizedScore > 1) {
    sentiment = 'positive';
    confidence = Math.min(normalizedScore / 2, 1);
  } else if (normalizedScore < -1) {
    sentiment = 'negative';
    confidence = Math.min(Math.abs(normalizedScore) / 2, 1);
  }

  // Détection spécifique de plainte
  const complaintKeywords = [
    'plainte',
    'réclamation',
    'problème',
    'insatisfait',
    'remboursement',
  ];
  const isComplaint =
    complaintKeywords.some((keyword) => lowerText.includes(keyword)) ||
    (sentiment === 'negative' && confidence > 0.6);

  return {
    sentiment,
    score: normalizedScore,
    confidence,
    detectedWords,
    totalWords,
    isComplaint,
    // Indicateurs additionnels
    isUrgent: lowerText.includes('urgent') || lowerText.includes('rapidement'),
    containsThreats: /menace|procès|avocat|justice/.test(lowerText),
  };
}

/**
 * Détection d'urgence basée sur le contenu et le contexte
 */
function detectUrgency(data) {
  const urgencyIndicators = {
    keywords: [
      'urgent',
      'immédiat',
      'rapidement',
      'asap',
      'emergency',
      'critique',
    ],
    phrases: [
      'le plus vite possible',
      'dans les plus brefs délais',
      'en urgence',
    ],
    contextual: {
      payment_problem: 2, // Les problèmes de paiement sont souvent urgents
      login_issue: 1,
      account_access: 2,
    },
  };

  let urgencyScore = 0;
  const content = `${data.subject || ''} ${data.message || ''}`.toLowerCase();

  // Vérification des mots-clés
  urgencyIndicators.keywords.forEach((keyword) => {
    if (content.includes(keyword)) urgencyScore += 1;
  });

  // Vérification des phrases
  urgencyIndicators.phrases.forEach((phrase) => {
    if (content.includes(phrase)) urgencyScore += 2;
  });

  // Score contextuel basé sur le type de problème
  if (data.category && urgencyIndicators.contextual[data.category]) {
    urgencyScore += urgencyIndicators.contextual[data.category];
  }

  return {
    score: urgencyScore,
    isUrgent: urgencyScore >= 3,
    level:
      urgencyScore >= 5 ? 'critical' : urgencyScore >= 3 ? 'high' : 'normal',
  };
}

/**
 * Détection de la langue d'un nom (basique)
 */
function detectNameLanguage(name) {
  const languagePatterns = {
    fr: /^[a-zA-ZÀ-ÿ\s'-]+$/,
    en: /^[a-zA-Z\s'-]+$/,
    es: /^[a-zA-ZÀ-ÿÑñ\s'-]+$/,
    de: /^[a-zA-ZÀ-ÿÄäÖöÜü\s'-]+$/,
  };

  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    if (pattern.test(name)) {
      return lang;
    }
  }

  return 'unknown';
}

// Export des utilitaires pour usage externe
export {
  analyzeSpamContent,
  analyzeSentiment,
  detectUrgency,
  getRequiredInfoForIssue,
  getSuggestedActions,
};
