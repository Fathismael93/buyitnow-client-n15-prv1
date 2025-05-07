// app/me/layout.jsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

// Auth configuration import
import { auth } from '../api/auth/[...nextauth]/route';

// Server-side error monitoring is handled automatically through instrumentation.js
// so explicit imports aren't needed in server components

/**
 * User profile layout component for authenticated users
 * This component handles authentication verification and renders the user profile
 * layout with proper error boundaries and performance optimizations
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render within layout
 * @returns {Promise<JSX.Element>} - User profile layout component
 */
export default async function UserLayout({ children }) {
  // Server-side authentication check with error handling
  let session;
  try {
    session = await getServerSession(auth);
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    // Error caught by onRequestError in instrumentation.js
    // Redirect to error page with minimal information for security
    redirect('/error?code=auth_error');
  }

  // Security: Redirect unauthenticated users to login with secure callback URL
  if (!session) {
    // Security: encoding the callback URL to prevent open redirect vulnerabilities
    const callbackPath = encodeURIComponent('/me');
    return redirect(`/login?callbackUrl=${callbackPath}`);
  }

  // Safe access to user name with fallbacks for robustness
  const userName = session?.user?.name || 'User Profile';

  return (
    <>
      {/* User profile header section with responsive design and print optimization */}
      <section className="flex flex-row py-3 sm:py-7 bg-blue-100 print:hidden">
        <div className="container max-w-[var(--breakpoint-xl)] mx-auto px-4">
          <h2 className="font-medium text-2xl text-slate-800">
            {userName.toUpperCase()}
          </h2>
        </div>
      </section>

      {/* Main content section with responsive layout */}
      <section className="py-6 md:py-10">
        <div className="container max-w-[var(--breakpoint-xl)] mx-auto px-4">
          <div className="flex justify-center items-center flex-col md:flex-row -mx-4">
            <main className="md:w-2/3 lg:w-3/4 px-4 w-full">
              <article className="border border-gray-200 bg-white shadow-sm rounded-md mb-5 p-3 lg:p-5">
                {/* Loading state with optimized skeleton */}
                <Suspense
                  fallback={
                    <div
                      className="animate-pulse"
                      aria-busy="true"
                      aria-live="polite"
                    >
                      <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
                      <div className="h-4 bg-gray-200 rounded w-full mb-2.5" />
                      <div className="h-4 bg-gray-200 rounded w-full mb-2.5" />
                      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2.5" />
                      <span className="sr-only">Loading content...</span>
                    </div>
                  }
                >
                  {children}
                </Suspense>
              </article>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
