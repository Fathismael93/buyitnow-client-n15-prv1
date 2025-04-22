/* eslint-disable no-unused-vars */
'use client';

import { registerSchema } from '@/helpers/schemas';
import {
  sanitizeEmail,
  sanitizeName,
  sanitizePassword,
  sanitizePhone,
} from '@/utils/authSanitizers';
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

      // Sanitiser les entrées grâce aux utilitaires spécialisés
      const sanitizedName = sanitizeName(name, { minLength: 2, maxLength: 50 });
      const sanitizedPhone = sanitizePhone(phone, {
        minLength: 6,
        maxLength: 15,
      });
      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedPassword = sanitizePassword(password, {
        minLength: 8,
        maxLength: 100,
      });

      // Vérification des données sanitisées
      if (!sanitizedName) {
        setError(
          'Le nom est invalide ou contient des caractères non autorisés',
        );
        toast.error(
          'Le nom est invalide ou contient des caractères non autorisés',
        );
        setLoading(false);
        return;
      }

      if (!sanitizedPhone) {
        setError('Le numéro de téléphone est invalide');
        toast.error('Le numéro de téléphone est invalide');
        setLoading(false);
        return;
      }

      if (!sanitizedEmail) {
        setError("L'adresse email est invalide");
        toast.error("L'adresse email est invalide");
        setLoading(false);
        return;
      }

      if (!sanitizedPassword) {
        setError(
          'Le mot de passe est invalide ou ne respecte pas les critères de sécurité',
        );
        toast.error(
          'Le mot de passe est invalide ou ne respecte pas les critères de sécurité',
        );
        setLoading(false);
        return;
      }

      // Création de l'objet avec les données sanitisées
      const sanitizedData = {
        name: sanitizedName,
        phone: sanitizedPhone,
        email: sanitizedEmail,
        password: sanitizedPassword,
      };

      // Validation avec le schéma
      try {
        await registerSchema.validate(sanitizedData, { abortEarly: false });
      } catch (validationError) {
        const fieldErrors = {};

        if (validationError.inner) {
          validationError.inner.forEach((err) => {
            fieldErrors[err.path] = err.message;
          });
          setError('Validation failed');
          toast.error('Veuillez corriger les erreurs dans le formulaire');
        } else {
          setError(validationError.message);
          toast.error(validationError.message);
        }

        setLoading(false);
        return;
      }

      // Vérification du CSRF Token
      // if (!csrfToken) {
      //   setError('Erreur de sécurité: token manquant');
      //   toast.error('Erreur de sécurité: veuillez rafraîchir la page');
      //   setLoading(false);
      //   return;
      // }

      // Vérifier le rate limiting côté client
      // On utilise l'email comme identifiant pour éviter les créations multiples de comptes
      const clientIp = 'CLIENT-IP'; // En réalité, ce serait déterminé côté serveur
      const clientRateLimitKey = `register:${sanitizedEmail}:${clientIp}`;
      const maxClientAttempts = 5; // 5 tentatives maximum - défini ici pour être utilisé partout

      // Utiliser le cache pour suivre les tentatives d'inscription (en mémoire, côté client)
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
      };

      try {
        // Ajouter headers de cache pour indiquer de ne pas mettre en cache cette requête
        headers['Cache-Control'] =
          'no-store, no-cache, must-revalidate, proxy-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(sanitizedData),
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

          if (statusCode === 400) {
            // Erreur de validation - Géré par toast
            setError(errorData.message || "Données d'inscription invalides");
            toast.error(errorData.message || "Données d'inscription invalides");
          } else if (statusCode === 409) {
            // Conflit (email déjà utilisé) - Géré par toast
            setError('Cet email est déjà utilisé');
            toast.error(
              'Cet email est déjà utilisé. Veuillez vous connecter ou utiliser un autre email.',
            );

            // Réinitialiser le compteur de tentatives pour cet email
            if (appCache.ui) {
              appCache.ui.delete(clientRateLimitKey);
            }
          } else if (statusCode === 401 || statusCode === 403) {
            // Erreur d'authentification - Géré par toast
            setError("Erreur d'authentification");
            toast.error(
              'Votre session a expiré ou le token CSRF est invalide. Veuillez rafraîchir la page.',
            );
          } else {
            // Erreurs serveur - Lancer une erreur pour le composant d'erreur global
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
          // Erreur applicative - Gestion par toast
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/address`,
        {
          method: 'POST',
          body: JSON.stringify(address),
        },
      );

      const data = await res.json();

      if (data?.success === false) {
        toast.info(data?.message);
        return;
      }

      if (data?.data) {
        router.push('/me');
      }
    } catch (error) {
      setError(error?.response?.data?.message);
    }
  };

  const updateAddress = async (id, address) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/address/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(address),
        },
      );

      const data = await res.json();

      if (data?.success === false) {
        toast.info(data?.message);
        return;
      }

      if (data?.data) {
        setUpdated(true);
        router.replace(`/address/${id}`);
      }
    } catch (error) {
      setError(error?.response?.data?.message);
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
