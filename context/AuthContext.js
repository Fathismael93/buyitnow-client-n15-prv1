/* eslint-disable no-unused-vars */
'use client';

import { validateRegister } from '@/helpers/validation/schemas/auth';
import { captureException } from '@/monitoring/sentry';
import { sanitizeRegisterData } from '@/utils/authSanitizers';
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
      setLoading(true);
      setError(null);

      // 3. Simple fetch avec timeout court
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s comme vos APIs

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ name, phone, email, password }),
          signal: controller.signal,
          credentials: 'include',
        },
      );

      clearTimeout(timeoutId);

      const data = await res.json();

      // 4. Gestion simple des erreurs (comme vos APIs)
      if (!res.ok) {
        switch (res.status) {
          case 400:
            setError(data.message || "Données d'inscription invalides");
            break;
          case 409:
            setError('Cet email est déjà utilisé');
            break;
          case 429:
            setError('Trop de tentatives. Réessayez plus tard.');
            break;
          default:
            setError(data.message || "Erreur lors de l'inscription");
        }
        setLoading(false);
        return;
      }

      // 5. Succès
      if (data.success) {
        toast.success('Inscription réussie!');
        setTimeout(() => router.push('/login'), 1000);
      }
    } catch (error) {
      // 6. Erreurs réseau uniquement - PAS de Sentry ici
      if (error.name === 'AbortError') {
        setError('La requête a pris trop de temps');
      } else {
        setError('Problème de connexion. Vérifiez votre connexion.');
      }

      // L'API capturera les vraies erreurs serveur
      console.error('Registration error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async ({ name, phone, avatar }) => {
    try {
      setLoading(true);
      setError(null);

      // Validation basique côté client
      if (!name || name.trim() === '') {
        setError('Le nom est obligatoire');
        setLoading(false);
        return;
      }

      // Simple fetch avec timeout court
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s comme vos APIs

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone ? phone.trim() : '',
            avatar,
          }),
          signal: controller.signal,
          credentials: 'include',
        },
      );

      clearTimeout(timeoutId);

      const data = await res.json();

      // Gestion simple des erreurs (comme registerUser)
      if (!res.ok) {
        switch (res.status) {
          case 400:
            setError(data.message || 'Données de profil invalides');
            break;
          case 401:
            setError('Session expirée. Veuillez vous reconnecter');
            setTimeout(() => router.push('/login'), 2000);
            break;
          case 429:
            setError('Trop de tentatives. Réessayez plus tard.');
            break;
          default:
            setError(data.message || 'Erreur lors de la mise à jour');
        }
        setLoading(false);
        return;
      }

      // Succès
      if (data.success) {
        setUser(data.data.updatedUser);
        toast.success('Profil mis à jour avec succès!');
        router.push('/me');
      }
    } catch (error) {
      // Erreurs réseau uniquement - PAS de Sentry ici
      if (error.name === 'AbortError') {
        setError('La requête a pris trop de temps');
      } else {
        setError('Problème de connexion. Vérifiez votre connexion.');
      }

      // L'API capturera les vraies erreurs serveur
      console.error('Profile update error:', error.message);
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
      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Vérifier le rate limiting côté client
      const clientRateLimitKey = `address:delete:${user?.email || 'anonymous'}:${id}`;
      const maxClientAttempts = 3; // 3 tentatives maximum par minute

      // Utiliser le cache pour suivre les tentatives de suppression d'adresse
      let deleteAttempts = 0;

      try {
        // Utilisation du PersistentCache pour stocker les tentatives
        if (appCache.ui) {
          deleteAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // Si trop de tentatives, bloquer temporairement
          if (deleteAttempts >= maxClientAttempts) {
            const retryAfter = 60; // 1 minute en secondes
            setError(
              `Trop de tentatives de suppression d'adresse. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute.`,
            );
            setLoading(false);
            return;
          }

          // Incrémenter le compteur de tentatives
          appCache.ui.set(clientRateLimitKey, deleteAttempts + 1, {
            ttl: 60 * 1000, // 1 minute
          });
        }
      } catch (cacheError) {
        // Si erreur de cache, continuer quand même (fail open)
        console.warn(
          'Cache error during address deletion attempt tracking:',
          cacheError,
        );
      }

      // Validation des entrées côté client
      if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
        setError("Format d'identifiant d'adresse invalide");
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
            method: 'DELETE',
            headers,
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
              setError(
                data.message || "Format d'identifiant d'adresse invalide",
              );
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              // Rediriger vers la page de connexion après un court délai
              setTimeout(() => router.push('/login'), 2000);
              break;
            case 403:
              // Accès interdit
              setError(
                "Vous n'avez pas l'autorisation de supprimer cette adresse",
              );
              break;
            case 404:
              // Adresse non trouvée
              setError("L'adresse que vous essayez de supprimer n'existe pas");
              // Rediriger vers la page de profil
              setTimeout(() => router.push('/me'), 2000);
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
                serverError.componentName = 'AddressDelete';
                serverError.additionalInfo = {
                  context: 'address',
                  operation: 'delete',
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
                  `Erreur lors de la suppression de l'adresse (${statusCode})`,
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
              console.info('Address deleted successfully', {
                userId: user?._id
                  ? `${user._id.toString().substring(0, 2)}...${user._id.toString().slice(-2)}`
                  : 'unknown',
                addressId: id.substring(0, 2) + '...' + id.slice(-2),
              });
            }

            // Afficher un message de réussite (seul toast autorisé)
            toast.success(data.message || 'Adresse supprimée avec succès!');

            // Redirection avec un délai pour que le toast soit visible
            setTimeout(() => router.push('/me'), 1000);
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || "Échec de la suppression de l'adresse");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || "Échec de la suppression de l'adresse"}: ${data.errors.map((e) => e.message || e).join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError(
              "Réponse inattendue du serveur lors de la suppression de l'adresse",
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
            "La requête de suppression d'adresse a pris trop de temps. Veuillez réessayer.",
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la suppression de l'adresse: ${fetchError.message}`,
          );

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'AddressDelete';
            fetchError.additionalInfo = {
              context: 'address',
              operation: 'delete',
              addressId: id,
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'AddressDelete',
                action: 'deleteAddress',
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
        "Une erreur inattendue est survenue lors de la suppression de l'adresse",
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Address deletion error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'AddressDelete';
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

  const sendEmail = async ({ subject, message }) => {
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

      // Validation des entrées côté client
      if (!subject || subject.trim() === '') {
        setError('Le sujet est obligatoire');
        setLoading(false);
        return;
      }

      if (!message || message.trim() === '') {
        setError('Le message est obligatoire');
        setLoading(false);
        return;
      }

      // Limiter la taille des entrées
      if (subject.length > 200) {
        setError('Le sujet ne peut pas dépasser 200 caractères');
        setLoading(false);
        return;
      }

      if (message.length > 5000) {
        setError('Le message ne peut pas dépasser 5000 caractères');
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
          `${process.env.NEXT_PUBLIC_API_URL}/api/emails`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ subject, message }),
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
            res.headers.get('Retry-After') || '600',
            10,
          );
          setError(
            `Trop de tentatives d'envoi. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
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
                  `Validation échouée: ${data.errors.map((e) => e.message || e).join(', ')}`,
                );
              } else {
                setError(data.message || 'Données de message invalides');
              }
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              // Rediriger vers la page de connexion après un court délai
              setTimeout(
                () => router.push('/login?callbackUrl=/contact'),
                2000,
              );
              break;
            case 403:
              // Accès interdit
              setError("Vous n'avez pas l'autorisation d'envoyer un message");
              break;
            case 404:
              // Utilisateur non trouvé
              setError('Utilisateur non trouvé');
              break;
            case 413:
              // Payload trop grand
              setError('Le message est trop volumineux');
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
              // Erreur serveur interne
              setError(
                'Une erreur est survenue lors du traitement de votre message. Veuillez réessayer plus tard.',
              );

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'EmailSend';
                serverError.additionalInfo = {
                  context: 'email',
                  operation: 'send',
                  statusCode,
                  responseMessage: data.message,
                  requestId: data.requestId,
                };
                captureException(serverError);
              }
              break;
            case 503:
              // Service indisponible (souvent erreur de connexion à la BD ou au service d'email)
              setError(
                "Le service d'envoi d'email est temporairement indisponible. Veuillez réessayer plus tard.",
              );
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de l'envoi du message (${statusCode})`,
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
              console.info('Email sent successfully', {
                userId: user?._id
                  ? `${user._id.toString().substring(0, 2)}...${user._id.toString().slice(-2)}`
                  : 'unknown',
                requestId: data.requestId,
              });
            }

            // Afficher un message de réussite
            toast.success(data.message || 'Message envoyé avec succès!');

            // Redirection avec un délai pour que le toast soit visible
            setTimeout(() => router.push('/me'), 1000);
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || "Échec de l'envoi du message");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || "Échec de l'envoi du message"}: ${data.errors.map((e) => e.message || e).join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError(
              "Réponse inattendue du serveur lors de l'envoi du message",
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
            "La requête d'envoi de message a pris trop de temps. Veuillez réessayer.",
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(`Erreur lors de l'envoi du message: ${fetchError.message}`);

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'ContactForm';
            fetchError.additionalInfo = {
              context: 'contact',
              operation: 'send',
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'ContactForm',
                action: 'sendEmail',
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
      setError("Une erreur inattendue est survenue lors de l'envoi du message");

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Email send error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'ContactForm';
          error.additionalInfo = {
            context: 'contact',
          };
        }
        captureException(error);
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
