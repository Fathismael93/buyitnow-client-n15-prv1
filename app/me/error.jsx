'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import monitoring from '@/monitoring/sentry';

/**
 * Error boundary component for user profile pages
 * Provides a user-friendly error interface with recovery options
 *
 * @param {Object} props - Component props from Next.js error boundary
 * @param {Error} props.error - The error that was thrown
 * @param {Function} props.reset - Function to reset the error boundary
 */
export default function UserProfileError({ error, reset }) {
  // Send error to monitoring system
  useEffect(() => {
    // Only log in production to avoid noise in development
    if (process.env.NODE_ENV === 'production') {
      // Anonymous function to avoid recreating on each render
      const logError = () => {
        monitoring.captureException(error, {
          tags: {
            component: 'UserProfileError',
            route: '/me',
          },
          level: 'error',
        });
      };

      logError();
    }

    // Cleanup function not needed here since logging happens only once
  }, [error]);

  // Safe error display - don't expose sensitive details
  const errorMessage =
    error?.message && !containsSensitiveInfo(error.message)
      ? error.message
      : 'An unexpected error occurred';

  // Attempt automatic recovery after a timeout
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Try to recover automatically after 10 seconds
      try {
        reset();
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        // Silent catch - if auto recovery fails, user can still use the button
      }
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [reset]);

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm border border-red-100">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 rounded-full bg-red-50 p-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Something went wrong
          </h2>

          <p className="mt-1 text-sm text-gray-600">{errorMessage}</p>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => reset()}
              className="inline-flex items-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              type="button"
            >
              Try again
            </button>

            <button
              onClick={() => (window.location.href = '/')}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              type="button"
            >
              Return home
            </button>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            <span className="countdown font-mono">
              Auto-retry in progress...
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Check if a string contains potentially sensitive information
 * to prevent exposing private data in error messages
 *
 * @param {string} str - String to check for sensitive information
 * @returns {boolean} - True if sensitive information is detected
 */
function containsSensitiveInfo(str) {
  if (!str || typeof str !== 'string') return false;

  // Patterns to detect sensitive data
  const patterns = [
    /password/i,
    /token/i,
    /api[_-]?key/i,
    /secret/i,
    /auth/i,
    /cookie/i,
    /session/i,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email pattern
    /\b(?:\d{4}[ -]?){3}\d{4}\b/, // Credit card pattern
    /\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/, // SSN pattern
  ];

  return patterns.some((pattern) => pattern.test(str));
}
