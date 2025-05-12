/* eslint-disable no-unused-vars */
'use client';

import { captureException } from '@/monitoring/sentry';
import { appCache, getCacheKey } from '@/utils/cache';
import { useRouter } from 'next/navigation';
import { createContext, useState } from 'react';
import { toast } from 'react-toastify';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);

  const router = useRouter();

  const registerUser = async ({ name, phone, email, password }) => {
    try {
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientIp = 'CLIENT-IP'; // En réalité, ce serait déterminé côté serveur
      const clientRateLimitKey = `register:${email}:${clientIp}`;
      const maxClientAttempts = 5; // 5 tentatives maximum

      // Utiliser le cache pour suivre les tentatives d'inscription
      let registrationAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives d'inscription
        if (appCache.ui) {
          registrationAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (registrationAttempts >= maxClientAttempts) {
            const retryAfter = 10 * 60; // 10 minutes en secondes
            setError(
              `Trop de tentatives d'inscription. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, registrationAttempts + 1, {
            ttl: 10 * 60 * 1000, // 10 minutes
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during registration attempt tracking:',
          cacheError,
        );
      }

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, email, phone, password }),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Vérifier le rate limiting côté serveur (en fonction des headers de réponse)
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives d'inscription. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
          );

          // Mettre à jour le cache des tentatives locales
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Erreur lors du traitement de la réponse du serveur');
          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              setError(data.message || "Données d'inscription invalides");
              break;
            case 409:
              // Conflit (email déjà utilisé)
              setError('Cet email est déjà utilisé');

              // Réinitialiser le compteur de tentatives pour cet email
              if (appCache.ui) {
                appCache.ui.delete(clientRateLimitKey);
              }
              break;
            case 401:
            case 403:
              // Erreur d'authentification
              setError("Erreur de sécurité lors de l'inscription");
              break;
            case 422:
              // Erreur de validation avec détails
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(data.errors.join(', '));
              } else {
                setError(data.message || 'Erreur de validation des données');
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                "Le service d'inscription est temporairement indisponible. Veuillez réessayer plus tard.",
              );
              break;
            default:
              // Autres erreurs
              setError(
                data.message || `Erreur lors de l'inscription (${statusCode})`,
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Cas de succès - Réinitialiser le compteur de tentatives
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }

            // Loguer le succès (uniquement en local)
            console.info('User registered successfully', {
              component: 'auth',
              action: 'register',
            });

            // Afficher un message de réussite (seul toast autorisé)
            toast.success(
              'Inscription réussie! Vous pouvez maintenant vous connecter.',
            );

            // Redirection avec un délai pour que le toast soit visible
            setTimeout(() => router.push('/login'), 1000);
          } else {
            // Cas où success est explicitement false
            setError(data.message || "Échec de l'inscription");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || "Échec de l'inscription"}: ${data.errors.join(', ')}`,
              );
            }
          }
        } else {
          // Réponse vide ou mal formatée
          setError("Réponse inattendue du serveur lors de l'inscription");
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError sans toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            "La requête d'inscription a pris trop de temps. Veuillez réessayer.",
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(`Erreur lors de l'inscription: ${fetchError.message}`);

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'RegisterPage';
            fetchError.additionalInfo = {
              context: 'registration',
              operation: 'fetch',
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError);
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError("Une erreur inattendue est survenue lors de l'inscription");

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Registration error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'RegisterPage';
          error.additionalInfo = {
            context: 'registration',
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async ({ name, phone, avatar }) => {
    try {
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientRateLimitKey = `profile:update:${user?.email || 'anonymous'}`;
      const maxClientAttempts = 5; // 5 tentatives maximum par heure

      // Utiliser le cache pour suivre les tentatives de mise à jour de profil
      let profileUpdateAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives
        if (appCache.ui) {
          profileUpdateAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (profileUpdateAttempts >= maxClientAttempts) {
            const retryAfter = 60 * 60; // 1 heure en secondes
            setError(
              `Trop de tentatives de mise à jour de profil. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, profileUpdateAttempts + 1, {
            ttl: 60 * 60 * 1000, // 1 heure
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during profile update attempt tracking:',
          cacheError,
        );
      }

      // Valider les entrées côté client
      if (!name || name.trim() === '') {
        setError('Le nom est obligatoire');
        setLoading(false);
        return;
      }

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              name: name.trim(),
              phone: phone ? phone.trim() : '',
              avatar,
            }),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Erreur lors du traitement de la réponse du serveur');
          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives de mise à jour. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          // Mettre à jour le cache des tentatives locales
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(`Validation échouée: ${data.errors.join(', ')}`);
              } else {
                setError(data.message || 'Données de profil invalides');
              }
              break;
            case 401:
            case 403:
              // Erreur d'authentification
              setError('Session expirée ou accès non autorisé');
              // Rediriger vers la page de connexion après un court délai
              setTimeout(() => router.push('/login'), 2000);
              break;
            case 404:
              // Utilisateur non trouvé
              setError('Utilisateur non trouvé');
              break;
            case 413:
              // Taille de requête excessive
              setError('Image de profil trop volumineuse');
              break;
            case 422:
              // Erreur de validation détaillée
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(`Erreur de validation: ${data.errors.join(', ')}`);
              } else {
                setError(data.message || 'Validation échouée');
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'ProfileUpdate';
                serverError.additionalInfo = {
                  context: 'profile',
                  operation: 'update',
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de la mise à jour du profil (${statusCode})`,
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true && data.data) {
            // Réinitialiser le compteur de tentatives en cas de succès
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }

            // Invalidation des caches pertinents
            try {
              // Utiliser getCacheKey pour générer des clés de cache cohérentes
              const userProfileCacheKey = getCacheKey('user_profile', {
                userId: user?._id?.toString() || '',
              });

              // Invalider le cache du profil utilisateur
              if (appCache.products) {
                appCache.products.delete(userProfileCacheKey);
                appCache.products.invalidatePattern(/^user:/);
              }
            } catch (cacheError) {
              // Erreur non critique, juste logger en dev
              if (process.env.NODE_ENV === 'development') {
                console.warn('Cache invalidation error:', cacheError);
              }
            }

            // Journaliser de façon anonyme en production
            if (process.env.NODE_ENV === 'production') {
              console.info('Profile updated successfully', {
                userId: user?._id
                  ? `${user._id.toString().substring(0, 2)}...${user._id.toString().slice(-2)}`
                  : 'unknown',
              });
            }

            // Mise à jour de l'état utilisateur
            setUser(data.data.updatedUser);

            // Afficher un message de réussite (seul toast autorisé)
            toast.success(data.message || 'Profil mis à jour avec succès!');

            // Rediriger vers la page de profil
            router.push('/me');
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || 'Échec de la mise à jour du profil');

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || 'Échec de la mise à jour du profil'}: ${data.errors.join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError(
              'Réponse inattendue du serveur lors de la mise à jour du profil',
            );
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError sans toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError('La requête a pris trop de temps. Veuillez réessayer.');
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la mise à jour du profil: ${fetchError.message}`,
          );

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'ProfileUpdate';
            fetchError.additionalInfo = {
              context: 'profile',
              operation: 'update',
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'ProfileUpdate',
                action: 'updateProfile',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
              },
              extra: {
                userAnonymized: user?.email
                  ? `${user.email.charAt(0)}***${user.email.slice(user.email.indexOf('@'))}`
                  : 'unknown',
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        'Une erreur inattendue est survenue lors de la mise à jour du profil',
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Profile update error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'ProfileUpdate';
          error.additionalInfo = {
            context: 'profile',
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async ({ currentPassword, newPassword }) => {
    try {
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientRateLimitKey = `password:update:${user?.email || 'anonymous'}`;
      const maxClientAttempts = 3; // 3 tentatives maximum par heure

      // Utiliser le cache pour suivre les tentatives de mise à jour de mot de passe
      let passwordAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives
        if (appCache.ui) {
          passwordAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (passwordAttempts >= maxClientAttempts) {
            const retryAfter = 60 * 60; // 1 heure en secondes
            setError(
              `Trop de tentatives de modification de mot de passe. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, passwordAttempts + 1, {
            ttl: 60 * 60 * 1000, // 1 heure
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during password update attempt tracking:',
          cacheError,
        );
      }

      // Validation des entrées côté client
      if (!currentPassword || currentPassword.trim() === '') {
        setError('Le mot de passe actuel est obligatoire');
        setLoading(false);
        return;
      }

      if (!newPassword || newPassword.trim() === '') {
        setError('Le nouveau mot de passe est obligatoire');
        setLoading(false);
        return;
      }

      if (currentPassword === newPassword) {
        setError(
          'Le nouveau mot de passe doit être différent du mot de passe actuel',
        );
        setLoading(false);
        return;
      }

      // Vérification minimale de la complexité du mot de passe
      if (newPassword.length < 8) {
        setError('Le nouveau mot de passe doit contenir au moins 8 caractères');
        setLoading(false);
        return;
      }

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update_password`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              currentPassword,
              newPassword,
            }),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Erreur lors du traitement de la réponse du serveur');
          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives de modification de mot de passe. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          // Mettre à jour le cache des tentatives locales
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou mot de passe incorrect
              if (data.message && data.message.includes('current password')) {
                setError('Le mot de passe actuel est incorrect');
              } else if (
                data.message &&
                data.message.includes('same as current')
              ) {
                setError(
                  'Le nouveau mot de passe doit être différent du mot de passe actuel',
                );
              } else if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(
                  `Validation échouée: ${data.errors.map((e) => e.message || e).join(', ')}`,
                );
              } else {
                setError(data.message || 'Données de mot de passe invalides');
              }
              break;
            case 401:
              // Mot de passe actuel incorrect
              setError('Mot de passe actuel incorrect');
              break;
            case 403:
              // Compte verrouillé ou non autorisé
              if (data.message && data.message.includes('locked')) {
                setError(
                  'Compte temporairement verrouillé. Veuillez réessayer plus tard ou réinitialiser votre mot de passe.',
                );
              } else {
                setError('Session expirée ou accès non autorisé');
                // Rediriger vers la page de connexion après un court délai
                setTimeout(() => router.push('/login'), 2000);
              }
              break;
            case 404:
              // Utilisateur non trouvé
              setError('Utilisateur non trouvé');
              break;
            case 422:
              // Erreur de validation détaillée
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(
                  `Erreur de validation: ${data.errors.map((e) => e.message || e).join(', ')}`,
                );
              } else {
                setError(data.message || 'Validation échouée');
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'PasswordUpdate';
                serverError.additionalInfo = {
                  context: 'password',
                  operation: 'update',
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de la mise à jour du mot de passe (${statusCode})`,
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Succès - Réinitialiser le compteur de tentatives
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }

            // Journaliser de façon anonyme en production
            if (process.env.NODE_ENV === 'production') {
              console.info('Password updated successfully', {
                userId: user?._id
                  ? `${user._id.toString().substring(0, 2)}...${user._id.toString().slice(-2)}`
                  : 'unknown',
              });
            }

            // Afficher un message de réussite (seul toast autorisé)
            toast.success(
              data.message || 'Mot de passe mis à jour avec succès!',
            );

            // Redirection avec un délai pour que le toast soit visible
            router.replace('/me');
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || 'Échec de la mise à jour du mot de passe');

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || 'Échec de la mise à jour du mot de passe'}: ${data.errors.map((e) => e.message || e).join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError(
              'Réponse inattendue du serveur lors de la mise à jour du mot de passe',
            );
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError sans toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError('La requête a pris trop de temps. Veuillez réessayer.');
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la mise à jour du mot de passe: ${fetchError.message}`,
          );

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'PasswordUpdate';
            fetchError.additionalInfo = {
              context: 'password',
              operation: 'update',
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'UpdatePassword',
                action: 'updatePassword',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
              },
              extra: {
                userAnonymized: user?.email
                  ? `${user.email.charAt(0)}***${user.email.slice(user.email.indexOf('@'))}`
                  : 'unknown',
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        'Une erreur inattendue est survenue lors de la mise à jour du mot de passe',
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Password update error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'PasswordUpdate';
          error.additionalInfo = {
            context: 'password',
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const addNewAddress = async (address) => {
    try {
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientRateLimitKey = `address:add:${user?.email || 'anonymous'}`;
      const maxClientAttempts = 3; // 3 tentatives maximum par minute

      // Utiliser le cache pour suivre les tentatives d'ajout d'adresse
      let addressAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives
        if (appCache.ui) {
          addressAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (addressAttempts >= maxClientAttempts) {
            const retryAfter = 60; // 1 minute en secondes
            setError(
              `Trop de tentatives d'ajout d'adresse. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, addressAttempts + 1, {
            ttl: 60 * 1000, // 1 minute
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during address attempt tracking:',
          cacheError,
        );
      }

      // Validation des données d'adresse côté client
      if (!address) {
        setError("Les données d'adresse sont manquantes");
        setLoading(false);
        return;
      }

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/address`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(address),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Erreur lors du traitement de la réponse du serveur');
          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives d'ajout d'adresse. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          // Mettre à jour le cache des tentatives locales
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(
                  `Validation échouée: ${data.errors.map((e) => e.message || e.field + ': ' + e.message || e).join(', ')}`,
                );
              } else {
                setError(data.message || "Données d'adresse invalides");
              }
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              // Rediriger vers la page de connexion après un court délai
              setTimeout(
                () => router.push('/login?callbackUrl=/address/new'),
                2000,
              );
              break;
            case 403:
              // Accès interdit
              setError("Vous n'avez pas l'autorisation d'ajouter une adresse");
              break;
            case 404:
              // Ressource non trouvée
              setError('Service non disponible');
              break;
            case 413:
              // Payload trop grand
              setError('Les données envoyées sont trop volumineuses');
              break;
            case 422:
              // Erreur de validation avec détails
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(
                  `Erreur de validation: ${data.errors.map((e) => e.message || e).join(', ')}`,
                );
              } else {
                setError(data.message || 'Validation échouée');
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );

              // Capture d'erreur pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'AddressCreation';
                serverError.additionalInfo = {
                  context: 'address',
                  operation: 'create',
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de l'ajout de l'adresse (${statusCode})`,
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Cas de succès - Réinitialiser le compteur de tentatives
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }

            // Invalider les caches pertinents
            try {
              // Utiliser getCacheKey pour générer des clés de cache cohérentes
              const addressListCacheKey = getCacheKey('addresses', {
                userId: user?._id?.toString() || '',
              });

              // Invalider le cache des adresses
              if (appCache.products) {
                appCache.products.delete(addressListCacheKey);
                appCache.products.invalidatePattern(/^address:/);
              }
            } catch (cacheError) {
              // Erreur non critique, juste logger en dev
              if (process.env.NODE_ENV === 'development') {
                console.warn('Cache invalidation error:', cacheError);
              }
            }

            // Journaliser en production (anonymisé)
            if (process.env.NODE_ENV === 'production') {
              console.info('Address added successfully', {
                userId: user?._id
                  ? `${user._id.toString().substring(0, 2)}...${user._id.toString().slice(-2)}`
                  : 'unknown',
              });
            }

            // Afficher un message de réussite (seul toast autorisé)
            toast.success(data.message || 'Adresse ajoutée avec succès!');

            // Redirection avec un délai pour que le toast soit visible
            setTimeout(() => router.push('/me'), 1000);
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || "Échec de l'ajout d'adresse");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || "Échec de l'ajout d'adresse"}: ${data.errors.map((e) => e.message || e).join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError(
              "Réponse inattendue du serveur lors de l'ajout de l'adresse",
            );
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError sans toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            "La requête d'ajout d'adresse a pris trop de temps. Veuillez réessayer.",
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de l'ajout de l'adresse: ${fetchError.message}`,
          );

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'AddNewAddress';
            fetchError.additionalInfo = {
              context: 'address',
              operation: 'create',
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'AddNewAddress',
                action: 'addNewAddress',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
              },
              extra: {
                userAnonymized: user?.email
                  ? `${user.email.charAt(0)}***${user.email.slice(user.email.indexOf('@'))}`
                  : 'unknown',
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        "Une erreur inattendue est survenue lors de l'ajout de l'adresse",
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Address creation error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'AddNewAddress';
          error.additionalInfo = {
            context: 'address',
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateAddress = async (id, address) => {
    try {
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientRateLimitKey = `address:update:${user?.email || 'anonymous'}:${id}`;
      const maxClientAttempts = 3; // 3 tentatives maximum par minute

      // Utiliser le cache pour suivre les tentatives de mise à jour d'adresse
      let updateAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives
        if (appCache.ui) {
          updateAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (updateAttempts >= maxClientAttempts) {
            const retryAfter = 60; // 1 minute en secondes
            setError(
              `Trop de tentatives de modification d'adresse. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, updateAttempts + 1, {
            ttl: 60 * 1000, // 1 minute
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during address update attempt tracking:',
          cacheError,
        );
      }

      // Validation des entrées côté client
      if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
        setError("Format d'identifiant d'adresse invalide");
        setLoading(false);
        return;
      }

      // Vérification de la présence et validité de l'objet adresse
      if (
        !address ||
        typeof address !== 'object' ||
        Object.keys(address).length === 0
      ) {
        setError("Les données d'adresse sont invalides ou vides");
        setLoading(false);
        return;
      }

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/address/${id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify(address),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Erreur lors du traitement de la réponse du serveur');
          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          // Mettre à jour le cache des tentatives locales
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(
                  `Validation échouée: ${data.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message || e)).join(', ')}`,
                );
              } else {
                setError(data.message || "Données d'adresse invalides");
              }
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              // Rediriger vers la page de connexion après un court délai
              setTimeout(
                () => router.push(`/login?callbackUrl=/address/${id}/edit`),
                2000,
              );
              break;
            case 403:
              // Accès interdit
              setError(
                "Vous n'avez pas l'autorisation de modifier cette adresse",
              );
              break;
            case 404:
              // Adresse non trouvée
              setError("L'adresse que vous essayez de modifier n'existe pas");
              // Rediriger vers la page de profil
              setTimeout(() => router.push('/me'), 2000);
              break;
            case 409:
              // Conflit (duplication)
              setError('Cette adresse existe déjà');
              break;
            case 413:
              // Payload trop grand
              setError('Les données envoyées sont trop volumineuses');
              break;
            case 422:
              // Erreur de validation avec détails
              if (
                data.errors &&
                Array.isArray(data.errors) &&
                data.errors.length > 0
              ) {
                setError(
                  `Erreur de validation: ${data.errors.map((e) => e.message || e).join(', ')}`,
                );
              } else {
                setError(data.message || 'Validation échouée');
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );

              // Capture d'erreur pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'AddressUpdate';
                serverError.additionalInfo = {
                  context: 'address',
                  operation: 'update',
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de la modification de l'adresse (${statusCode})`,
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Cas de succès - Réinitialiser le compteur de tentatives
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }

            // Invalider les caches pertinents
            try {
              // Cache de l'adresse individuelle
              const addressDetailCacheKey = getCacheKey('address_detail', {
                userId: user?._id?.toString() || '',
                addressId: id,
              });

              // Cache de la liste des adresses
              const addressListCacheKey = getCacheKey('addresses', {
                userId: user?._id?.toString() || '',
              });

              // Invalider les caches
              if (appCache.products) {
                appCache.products.delete(addressDetailCacheKey);
                appCache.products.delete(addressListCacheKey);
                appCache.products.invalidatePattern(/^address:/);
              }
            } catch (cacheError) {
              // Erreur non critique, juste logger en dev
              if (process.env.NODE_ENV === 'development') {
                console.warn('Cache invalidation error:', cacheError);
              }
            }

            // Journaliser en production (anonymisé)
            if (process.env.NODE_ENV === 'production') {
              console.info('Address updated successfully', {
                userId: user?._id
                  ? `${user._id.toString().substring(0, 2)}...${user._id.toString().slice(-2)}`
                  : 'unknown',
                addressId: id.substring(0, 2) + '...' + id.slice(-2),
              });
            }

            // Afficher un message de réussite (seul toast autorisé)
            toast.success(data.message || 'Adresse modifiée avec succès!');

            // Mettre à jour l'état local
            setUpdated(true);

            // Redirection avec un délai pour que le toast soit visible
            setTimeout(() => router.replace(`/address/${id}`), 1000);
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || "Échec de la modification de l'adresse");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || "Échec de la modification de l'adresse"}: ${data.errors.map((e) => e.message || e).join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError(
              "Réponse inattendue du serveur lors de la modification de l'adresse",
            );
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError sans toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            "La requête de modification d'adresse a pris trop de temps. Veuillez réessayer.",
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la modification de l'adresse: ${fetchError.message}`,
          );

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'AddressUpdate';
            fetchError.additionalInfo = {
              context: 'address',
              operation: 'update',
              addressId: id,
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'AddressUpdate',
                action: 'updateAddress',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
                addressId: id,
              },
              extra: {
                userAnonymized: user?.email
                  ? `${user.email.charAt(0)}***${user.email.slice(user.email.indexOf('@'))}`
                  : 'unknown',
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        "Une erreur inattendue est survenue lors de la modification de l'adresse",
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Address update error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'AddressUpdate';
          error.additionalInfo = {
            context: 'address',
            addressId: id,
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteAddress = async (id) => {
    try {
      // Update loading state
      setLoading(true);
      setError(null);

      // Client-side rate limiting check
      const clientRateLimitKey = `address:delete:${user?.email || 'anonymous'}:${id}`;
      const maxClientAttempts = 3; // Maximum 3 attempts per minute

      // Use cache to track address deletion attempts
      let deleteAttempts = 0;

      try {
        // Use PersistentCache to store deletion attempts
        if (appCache.ui) {
          deleteAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // If too many attempts, temporarily block
          if (deleteAttempts >= maxClientAttempts) {
            const retryAfter = 60; // 1 minute in seconds
            setError(
              `Trop de tentatives de suppression d'adresse. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute.`,
            );
            toast.error(
              `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute.`,
            );
            setLoading(false);
            return;
          }

          // Increment attempt counter
          appCache.ui.set(clientRateLimitKey, deleteAttempts + 1, {
            ttl: 60 * 1000, // 1 minute
          });
        }
      } catch (cacheError) {
        // If cache error, continue anyway (fail open)
        console.warn(
          'Cache error during address deletion attempt tracking:',
          cacheError,
        );
      }

      // Use AbortController to cancel the request if needed
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configure headers with protection against attacks
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Extra CSRF protection
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        // Input validation - ensure ID is valid
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
          setError("Format d'identifiant d'adresse non valide");
          toast.error("Format d'adresse non valide. Veuillez réessayer.");
          setLoading(false);
          return;
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/address/${id}`,
          {
            method: 'DELETE',
            headers,
            signal: controller.signal,
            credentials: 'include', // Include cookies for sessions
          },
        );

        clearTimeout(timeoutId);

        // Check server-side rate limiting
        if (res.status === 429) {
          // Extract wait time from headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          toast.error(
            `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          // Update local attempt cache
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Handle HTTP errors
        if (!res.ok) {
          const statusCode = res.status;
          let errorData;

          try {
            errorData = await res.json();
          } catch (e) {
            errorData = { message: `Erreur HTTP: ${res.status}` };
          }

          // Unified HTTP error handling
          if (statusCode === 400) {
            // Validation error
            setError(errorData.message || 'Données invalides');
            toast.error(
              errorData.message || 'Données invalides pour la suppression',
            );
          } else if (statusCode === 401 || statusCode === 403) {
            // Authentication error
            setError('Session expirée ou accès non autorisé');
            toast.error(
              "Votre session a expiré ou vous n'êtes pas autorisé à effectuer cette action. Veuillez vous reconnecter.",
            );
            // Redirect to login page after a short delay
            setTimeout(() => router.push('/login'), 2000);
          } else if (statusCode === 404) {
            // Address not found
            setError('Adresse non trouvée');
            toast.error(
              "L'adresse que vous essayez de supprimer n'existe pas.",
            );
            setTimeout(() => router.push('/me'), 2000);
          } else if (statusCode >= 400 && statusCode < 500) {
            // Other client errors
            setError(errorData.message || 'Erreur dans la requête');
            toast.error(
              errorData.message ||
                "Une erreur est survenue lors de la suppression de l'adresse",
            );
          } else {
            // Server errors
            setError('Erreur serveur');
            toast.error(
              'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
            );
          }

          setLoading(false);
          return;
        }

        // Process JSON response with error handling
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Réponse du serveur invalide');
          toast.error('Réponse du serveur invalide. Veuillez réessayer.');
          setLoading(false);
          return;
        }

        // Check response structure
        if (!data || data.success === false) {
          // Application error
          setError(data?.message || "Échec de la suppression d'adresse");
          toast.error(data?.message || "Échec de la suppression d'adresse");
          setLoading(false);
          return;
        }

        // Success
        if (data.success) {
          // Reset attempt counter on success
          if (appCache.ui) {
            appCache.ui.delete(clientRateLimitKey);
          }

          // Invalidate related cache entries
          try {
            // Clear address detail cache
            const detailCacheKey = getCacheKey('address_detail', {
              userId: user?._id?.toString() || '',
              addressId: id,
            });
            appCache.products.delete(detailCacheKey);

            // Clear address list cache
            const listCacheKey = getCacheKey('addresses', {
              userId: user?._id?.toString() || '',
            });
            appCache.products.delete(listCacheKey);
          } catch (cacheError) {
            // Non-critical error, just log in dev
            if (process.env.NODE_ENV === 'development') {
              console.warn('Cache invalidation error:', cacheError);
            }
          }

          // Show success message
          toast.success(data.message || 'Adresse supprimée avec succès!');

          // Redirect to addresses page
          setTimeout(() => router.push('/me'), 1000);
        } else {
          // Malformatted success
          setError('Réponse inattendue du serveur');
          toast.warning('Opération terminée, mais le résultat est incertain');
          setLoading(false);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Network error categorization
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError('La requête a pris trop de temps');
          toast.error(
            'La connexion au serveur est trop lente. Veuillez réessayer plus tard.',
          );
        } else if (isNetworkError) {
          // Network error
          setError('Problème de connexion internet');
          toast.error(
            'Impossible de se connecter au serveur. Vérifiez votre connexion internet.',
          );
        } else {
          // Other errors
          setError("Erreur lors de la suppression de l'adresse");
          toast.error(
            'Une erreur inattendue est survenue. Veuillez réessayer.',
          );

          // Log in dev only
          if (process.env.NODE_ENV === 'development') {
            console.error('Address deletion error:', fetchError);
          }
        }
      }
    } catch (error) {
      // Unhandled general errors
      setError('Une erreur inattendue est survenue');
      toast.error(
        'Une erreur inattendue est survenue. Veuillez réessayer plus tard.',
      );

      // Log in dev only
      if (process.env.NODE_ENV === 'development') {
        console.error('Address deletion unexpected error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async (newEmail) => {
    try {
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientRateLimitKey = `email:send:${user?.email || 'anonymous'}`;
      const maxClientAttempts = 5; // 5 tentatives maximum par heure

      // Utiliser le cache pour suivre les tentatives d'envoi d'email
      let emailAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives
        if (appCache.ui) {
          emailAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (emailAttempts >= maxClientAttempts) {
            const retryAfter = 60 * 60; // 1 heure en secondes
            setError(
              `Trop de tentatives d'envoi d'email. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
            );
            toast.error(
              `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, emailAttempts + 1, {
            ttl: 60 * 60 * 1000, // 1 heure
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during email send attempt tracking:',
          cacheError,
        );
      }

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/emails`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(newEmail),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de tentatives. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          toast.error(
            `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          // Mettre à jour le cache des tentatives locales
          if (appCache.ui) {
            appCache.ui.set(clientRateLimitKey, maxClientAttempts, {
              ttl: retryAfter * 1000,
            });
          }

          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;
          let errorData;

          try {
            errorData = await res.json();
          } catch (e) {
            errorData = { message: `Erreur HTTP: ${res.status}` };
          }

          // Traitement unifié des erreurs HTTP
          if (statusCode === 400) {
            // Erreur de validation
            setError(errorData.message || 'Données invalides');
            toast.error(
              errorData.message || 'Veuillez vérifier les informations saisies',
            );
          } else if (statusCode === 401 || statusCode === 403) {
            // Erreur d'authentification
            setError('Session expirée ou accès non autorisé');
            toast.error(
              "Votre session a expiré ou vous n'êtes pas autorisé à effectuer cette action. Veuillez vous reconnecter.",
            );
            // Rediriger vers la page de connexion après un court délai
            setTimeout(() => router.push('/login'), 2000);
          } else if (statusCode >= 400 && statusCode < 500) {
            // Autres erreurs client
            setError(errorData.message || 'Erreur dans la requête');
            toast.error(
              errorData.message ||
                "Une erreur est survenue lors de l'envoi de l'email",
            );
          } else {
            // Erreurs serveur
            setError('Erreur serveur');
            toast.error(
              'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
            );

            // Capturer l'exception pour Sentry en production
            if (process.env.NODE_ENV === 'production') {
              const serverError = new Error(
                errorData.message || `Erreur serveur (${statusCode})`,
              );
              serverError.statusCode = statusCode;
              serverError.componentName = 'EmailSend';
              serverError.additionalInfo = {
                context: 'email',
                operation: 'send',
                statusCode,
                responseMessage: errorData.message,
              };
              captureException(serverError);
            }
          }

          setLoading(false);
          return;
        }

        // Traitement de la réponse JSON avec gestion d'erreur
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError('Réponse du serveur invalide');
          toast.error('Réponse du serveur invalide. Veuillez réessayer.');
          setLoading(false);
          return;
        }

        // Vérification de la structure de la réponse
        if (!data) {
          setError('Réponse du serveur vide');
          toast.error('Erreur lors du traitement de la réponse.');
          setLoading(false);
          return;
        }

        // Succès
        if (data.success) {
          // Réinitialiser le compteur de tentatives en cas de succès
          if (appCache.ui) {
            appCache.ui.delete(clientRateLimitKey);
          }

          toast.success(data.message || 'Email envoyé avec succès!');
          setTimeout(() => router.push('/me'), 1000);
        } else {
          // Cas d'erreur applicative
          setError(data?.message || "Échec de l'envoi d'email");
          toast.info(data?.message || "Échec de l'envoi d'email");
          setLoading(false);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Catégorisation des erreurs réseau
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError('La requête a pris trop de temps');
          toast.error(
            'La connexion au serveur est trop lente. Veuillez réessayer plus tard.',
          );
        } else if (isNetworkError) {
          // Erreur réseau
          setError('Problème de connexion internet');
          toast.error(
            'Impossible de se connecter au serveur. Vérifiez votre connexion internet.',
          );
        } else {
          // Autres erreurs
          setError("Erreur lors de l'envoi de l'email");
          toast.error(
            'Une erreur inattendue est survenue. Veuillez réessayer.',
          );

          // Journalisation en dev uniquement
          if (process.env.NODE_ENV === 'development') {
            console.error('Email send error:', fetchError);
          }

          // Capturer l'exception pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'EmailSend',
                action: 'sendEmail',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
              },
            });
          }
        }
      }
    } catch (error) {
      // Erreurs générales non gérées
      setError('Une erreur inattendue est survenue');
      toast.error(
        'Une erreur inattendue est survenue. Veuillez réessayer plus tard.',
      );

      // Journalisation en dev uniquement
      if (process.env.NODE_ENV === 'development') {
        console.error('Email send unexpected error:', error);
      }

      // Capturer l'exception pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        captureException(error, {
          tags: { component: 'EmailSend', action: 'sendEmail' },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Ajoutez cette méthode
  const clearUser = () => {
    setUser(null);
    setError(null);
    setUpdated(false);
  };

  const clearErrors = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        error,
        loading,
        updated,
        setUpdated,
        setUser,
        setLoading,
        registerUser,
        updateProfile,
        updatePassword,
        addNewAddress,
        updateAddress,
        deleteAddress,
        sendEmail,
        clearUser,
        clearErrors,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
