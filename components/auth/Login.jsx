/* eslint-disable no-unused-vars */
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { validateWithLogging } from '@/helpers/schemas';
import { parseCallbackUrl } from '@/helpers/helpers';
import { loginSchema } from '@/helpers/schemas';

const Login = ({ referer, csrfToken }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  const router = useRouter();
  const params = useSearchParams();
  const callBackUrl = params.get('callbackUrl');

  // Validation en temps réel
  const validateField = async (field, value) => {
    try {
      await loginSchema.validateAt(field, { [field]: value });
      setValidationErrors((prev) => ({ ...prev, [field]: null }));
      return true;
    } catch (error) {
      setValidationErrors((prev) => ({ ...prev, [field]: error.message }));
      return false;
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();

    setIsLoading(true);
    setValidationErrors({});

    try {
      // Validation complète avant soumission
      await validateWithLogging(loginSchema, { email, password });

      const data = await signIn('credentials', {
        email,
        password,
        callbackUrl: callBackUrl ? parseCallbackUrl(callBackUrl) : '/',
        redirect: false, // Ne pas rediriger automatiquement pour gérer les erreurs
      });

      if (data?.error) {
        // Gérer les erreurs spécifiques avec des messages appropriés
        if (
          data.error.includes('rate limit') ||
          data.error.includes('too many')
        ) {
          toast.error(
            'Trop de tentatives de connexion. Veuillez réessayer plus tard.',
          );
        } else if (data.error.includes('locked')) {
          toast.error(
            'Votre compte est temporairement bloqué suite à plusieurs tentatives échouées.',
          );
        } else {
          toast.error(
            data.error || 'Erreur de connexion. Vérifiez vos identifiants.',
          );
        }
      } else if (data?.url) {
        // Connexion réussie, redirection
        router.push(data.url);
        toast.success('Connexion réussie!');
      } else {
        // Redirection par défaut en cas de succès sans URL spécifiée
        router.push('/');
        toast.success('Connexion réussie!');
      }
    } catch (error) {
      // Gérer les erreurs de validation Yup
      if (error.name === 'ValidationError') {
        const fieldErrors = {};

        if (Array.isArray(error.inner)) {
          error.inner.forEach((err) => {
            fieldErrors[err.path] = err.message;
          });
        } else {
          // Message d'erreur général si pas de détails
          fieldErrors[error.path || 'general'] = error.message;
        }

        setValidationErrors(fieldErrors);
        toast.error('Veuillez corriger les erreurs dans le formulaire.');
      } else {
        // Autres types d'erreurs
        toast.error('Une erreur est survenue. Veuillez réessayer.');
        console.error('Login error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <form
        onSubmit={submitHandler}
        className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-4"
      >
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
          Connexion
        </h2>

        {/* Champ email */}
        <div className="mb-4">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="email"
          >
            Adresse email
          </label>
          <input
            id="email"
            className={`shadow appearance-none border ${validationErrors.email ? 'border-red-500' : 'border-gray-300'} rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500`}
            type="email"
            placeholder="Votre email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              validateField('email', e.target.value);
            }}
            disabled={isLoading}
            required
            autoComplete="email"
          />
          {validationErrors.email && (
            <p className="text-red-500 text-xs italic mt-1">
              {validationErrors.email}
            </p>
          )}
        </div>

        {/* Champ mot de passe */}
        <div className="mb-6">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="password"
          >
            Mot de passe
          </label>
          <input
            id="password"
            className={`shadow appearance-none border ${validationErrors.password ? 'border-red-500' : 'border-gray-300'} rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500`}
            type="password"
            placeholder="Votre mot de passe"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              validateField('password', e.target.value);
            }}
            disabled={isLoading}
            required
            autoComplete="current-password"
            minLength={6}
          />
          {validationErrors.password && (
            <p className="text-red-500 text-xs italic mt-1">
              {validationErrors.password}
            </p>
          )}
        </div>

        {/* Bouton de soumission */}
        <div className="flex items-center justify-between">
          <button
            type="submit"
            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </div>

        {/* Lien vers la récupération de mot de passe */}
        <div className="text-center mt-4">
          <Link
            href="/forgot-password"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <hr className="my-6 border-gray-300" />

        {/* Lien vers l'inscription */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Vous n&apos;avez pas encore de compte ?{' '}
            <Link
              href="/register"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              S&apos;inscrire
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
};

export default Login;
