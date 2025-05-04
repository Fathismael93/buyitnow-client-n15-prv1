/* eslint-disable no-unused-vars */
'use client';

import { appCache } from '@/utils/cache';
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
            toast.error(
              `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
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
          toast.error(
            `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minutes.`,
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
          if (statusCode === 409) {
            // Conflit (email déjà utilisé)
            setError('Cet email est déjà utilisé');
            toast.error(
              'Cet email est déjà utilisé. Veuillez vous connecter ou utiliser un autre email.',
            );

            // Réinitialiser le compteur de tentatives pour cet email
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }
          } else if (statusCode === 401 || statusCode === 403) {
            // Erreur d'authentification
            setError('Erreur de sécurité');
            toast.error(
              'Erreur de sécurité. Veuillez rafraîchir la page et réessayer.',
            );
          } else if (statusCode >= 400 && statusCode < 500) {
            // Autres erreurs client (incluant 400 - Bad Request)
            setError(errorData.message || 'Erreur dans les données envoyées');
            toast.error(
              errorData.message || 'Erreur dans les données envoyées',
            );
          } else {
            // Erreurs serveur
            const serverError = new Error(
              errorData.message || `Erreur serveur (${statusCode})`,
            );
            serverError.statusCode = statusCode;
            serverError.componentName = 'RegisterPage';
            serverError.additionalInfo = {
              context: 'registration',
              operation: 'fetch',
              statusCode,
              responseMessage: errorData.message,
            };

            throw serverError;
          }

          setLoading(false);
          return;
        }

        const data = await res.json();

        if (data?.success === false) {
          // Erreur applicative
          setError(data?.message || "Échec de l'inscription");
          toast.error(data?.message || "Échec de l'inscription");
          setLoading(false);
          return;
        }

        if (data?.data) {
          // Réinitialiser le compteur de tentatives en cas de succès
          if (appCache.ui) {
            appCache.ui.delete(clientRateLimitKey);
          }

          // Loguer le succès (uniquement en local)
          console.info('User registered successfully', {
            component: 'auth',
            action: 'register',
          });

          // Afficher un message de réussite
          toast.success(
            'Inscription réussie! Vous pouvez maintenant vous connecter.',
          );

          // Redirection avec un délai pour que le toast soit visible
          setTimeout(() => router.push('/login'), 1000);
        } else {
          // Cas où success n'est pas false mais data?.data est undefined
          const unexpectedError = new Error('Réponse inattendue du serveur');
          unexpectedError.componentName = 'RegisterPage';
          unexpectedError.additionalInfo = {
            context: 'registration',
            operation: 'processResponse',
          };

          throw unexpectedError;
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Gérer certaines par toast, d'autres par le composant d'erreur
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout - Gérer par toast
          setError('La requête a pris trop de temps');
          toast.error(
            'La connexion au serveur est trop lente. Veuillez réessayer plus tard.',
          );
        } else if (isNetworkError) {
          // Erreur réseau simple - Gérer par toast
          setError('Problème de connexion internet');
          toast.error(
            'Impossible de se connecter au serveur. Vérifiez votre connexion internet.',
          );
        } else {
          // Autres erreurs - laisser remonter au boundary d'erreur
          if (!fetchError.componentName) {
            fetchError.componentName = 'RegisterPage';
            fetchError.additionalInfo = {
              context: 'registration',
              operation: 'fetch',
            };
          }

          throw fetchError;
        }

        setLoading(false);
        return;
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement, l'enrichir de contexte
      if (!error.componentName) {
        error.componentName = 'RegisterPage';
        error.additionalInfo = {
          ...(error.additionalInfo || {}),
          context: 'registration',
        };
      }

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Registration error:', error);
      }

      // La relancer pour que le boundary d'erreur la traite
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loadUser = async () => {
    try {
      setLoading(true);

      const res = await fetch('/api/auth/session?update=');
      const data = await res.json();

      if (data?.user) {
        setUser(data.user);
        router.push('/me');
      }
    } catch (error) {
      setError(error?.response?.data?.message);
    }
  };

  const updateProfile = async ({ name, phone, avatar }) => {
    try {
      setLoading(true);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name,
            phone,
            avatar,
          }),
        },
      );

      const data = await res.json();

      if (data?.success === false) {
        toast.info(data?.message);
        return;
      }

      if (data?.data) {
        loadUser();
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      setError(error?.response?.data?.message);
    }
  };

  const updatePassword = async ({ currentPassword, newPassword }) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update_password`,
        {
          method: 'PUT',
          body: JSON.stringify({
            currentPassword,
            newPassword,
            user,
          }),
        },
      );

      const data = await res.json();

      if (data?.success) {
        toast.success(data?.message);
        router.replace('/me');
      } else {
        toast.info(data?.message);
        return;
      }
    } catch (error) {
      toast.error(error?.response?.data?.message);
      setError(error?.response?.data?.message);
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
            toast.error(
              `Limite de tentatives atteinte. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute.`,
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
          } else if (statusCode === 413) {
            // Requête trop grande
            setError('Données trop volumineuses');
            toast.error('Les données envoyées sont trop volumineuses');
          } else if (statusCode >= 400 && statusCode < 500) {
            // Autres erreurs client
            setError(errorData.message || 'Erreur dans la requête');
            toast.error(
              errorData.message ||
                "Une erreur est survenue lors de l'ajout de l'adresse",
            );
          } else {
            // Erreurs serveur
            setError('Erreur serveur');
            toast.error(
              'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
            );
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
        if (!data || data.success === false) {
          // Erreur applicative
          setError(data?.message || "Échec de l'ajout d'adresse");
          toast.error(data?.message || "Échec de l'ajout d'adresse");
          setLoading(false);
          return;
        }

        // Succès
        if (data.data) {
          // Réinitialiser le compteur de tentatives en cas de succès
          if (appCache.ui) {
            appCache.ui.delete(clientRateLimitKey);
          }

          // Afficher un message de réussite
          toast.success(data.message || 'Adresse ajoutée avec succès!');

          // Redirection avec un délai pour que le toast soit visible
          setTimeout(() => router.push('/me'), 1000);
        } else {
          // Cas de succès mal formaté
          setError('Réponse inattendue du serveur');
          toast.warning('Opération terminée, mais le résultat est incertain');
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
          setError("Erreur lors de l'ajout de l'adresse");
          toast.error(
            'Une erreur inattendue est survenue. Veuillez réessayer.',
          );

          // Journalisation en dev uniquement
          if (process.env.NODE_ENV === 'development') {
            console.error('Address addition error:', fetchError);
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
        console.error('Address addition unexpected error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateAddress = async (id, address) => {
    try {
      // Update loading state
      setLoading(true);
      setError(null);

      // Client-side rate limiting check
      const clientRateLimitKey = `address:update:${user?.email || 'anonymous'}:${id}`;
      const maxClientAttempts = 3; // Maximum 3 attempts per minute

      // Use cache to track address update attempts
      let updateAttempts = 0;

      try {
        // Use PersistentCache to store update attempts
        if (appCache.ui) {
          updateAttempts = appCache.ui.get(clientRateLimitKey) || 0;

          // If too many attempts, temporarily block
          if (updateAttempts >= maxClientAttempts) {
            const retryAfter = 60; // 1 minute in seconds
            setError(
              `Too many address update attempts. Please try again in ${Math.ceil(retryAfter / 60)} minute.`,
            );
            toast.error(
              `Rate limit reached. Please try again in ${Math.ceil(retryAfter / 60)} minute.`,
            );
            setLoading(false);
            return;
          }

          // Increment attempt counter
          appCache.ui.set(clientRateLimitKey, updateAttempts + 1, {
            ttl: 60 * 1000, // 1 minute
          });
        }
      } catch (cacheError) {
        // If cache error, continue anyway (fail open)
        console.warn(
          'Cache error during address update attempt tracking:',
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
          setError('Invalid address ID format');
          toast.error('Invalid address format. Please try again.');
          setLoading(false);
          return;
        }

        // Check if address object is valid
        if (
          !address ||
          typeof address !== 'object' ||
          Object.keys(address).length === 0
        ) {
          setError('Address data is invalid');
          toast.error('Address data is invalid. Please try again.');
          setLoading(false);
          return;
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/address/${id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify(address),
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
            `Too many attempts. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          toast.error(
            `Rate limit reached. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
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
            errorData = { message: `HTTP Error: ${res.status}` };
          }

          // Unified HTTP error handling
          if (statusCode === 400) {
            // Validation error
            setError(errorData.message || 'Invalid data');
            toast.error(
              errorData.message || 'Please check the information entered',
            );
          } else if (statusCode === 401 || statusCode === 403) {
            // Authentication error
            setError('Session expired or unauthorized access');
            toast.error(
              'Your session has expired or you are not authorized to perform this action. Please login again.',
            );
            // Redirect to login page after a short delay
            setTimeout(() => router.push('/login'), 2000);
          } else if (statusCode === 404) {
            // Address not found
            setError('Address not found');
            toast.error('The address you are trying to update does not exist.');
            setTimeout(() => router.push('/me'), 2000);
          } else if (statusCode === 413) {
            // Request too large
            setError('Data too large');
            toast.error('The data sent is too large');
          } else if (statusCode >= 400 && statusCode < 500) {
            // Other client errors
            setError(errorData.message || 'Request error');
            toast.error(
              errorData.message ||
                'An error occurred while updating the address',
            );
          } else {
            // Server errors
            setError('Server error');
            toast.error(
              'The service is temporarily unavailable. Please try again later.',
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
          setError('Invalid server response');
          toast.error('Invalid server response. Please try again.');
          setLoading(false);
          return;
        }

        // Check response structure
        if (!data || data.success === false) {
          // Application error
          setError(data?.message || 'Failed to update address');
          toast.error(data?.message || 'Failed to update address');
          setLoading(false);
          return;
        }

        // Success
        if (data.data) {
          // Reset attempt counter on success
          if (appCache.ui) {
            appCache.ui.delete(clientRateLimitKey);
          }

          // Show success message
          toast.success(data.message || 'Address updated successfully!');

          // Update state and redirect
          setUpdated(true);
          setTimeout(() => router.replace(`/address/${id}`), 1000);
        } else {
          // Malformatted success
          setError('Unexpected server response');
          toast.warning('Operation completed, but the result is uncertain');
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
          setError('Request took too long');
          toast.error(
            'The connection to the server is too slow. Please try again later.',
          );
        } else if (isNetworkError) {
          // Network error
          setError('Internet connection problem');
          toast.error(
            'Unable to connect to the server. Check your internet connection.',
          );
        } else {
          // Other errors
          setError('Error updating address');
          toast.error('An unexpected error occurred. Please try again.');

          // Log in dev only
          if (process.env.NODE_ENV === 'development') {
            console.error('Address update error:', fetchError);
          }
        }
      }
    } catch (error) {
      // Unhandled general errors
      setError('An unexpected error occurred');
      toast.error('An unexpected error occurred. Please try again later.');

      // Log in dev only
      if (process.env.NODE_ENV === 'development') {
        console.error('Address update unexpected error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteAddress = async (id) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/address/${id}`,
        {
          method: 'DELETE',
        },
      );

      const data = await res.json();

      if (data?.success) {
        toast.success(data?.message);
        router.push('/me');
      } else {
        toast.info(data?.message);
        return;
      }
    } catch (error) {
      setError(error?.response?.data?.message);
    }
  };

  const sendEmail = async (newEmail) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/emails`, {
        method: 'POST',
        body: JSON.stringify(newEmail),
      });

      const data = await res.json();

      if (data?.success) {
        toast.success(data?.message);
        router.push('/me');
      } else {
        toast.info(data?.message);
        return;
      }
    } catch (error) {
      setError(error?.response?.data?.message);
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
