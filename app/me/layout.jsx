import { getServerSession } from 'next-auth';
import { auth } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export default async function UserLayout({ children }) {
  const session = await getServerSession(auth);

  console.log('Session:', session);

  if (!session) {
    // Rediriger vers la page de connexion si l'utilisateur n'est pas authentifié
    redirect('/login?callbackUrl=/me');
  }

  return (
    <>
      <section className="flex flex-row py-3 sm:py-7 bg-blue-100">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <h2 className="font-medium text-2xl">
            {session?.user?.name?.toUpperCase()}
          </h2>
        </div>
      </section>
      <section className="py-10">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="flex flex-col md:flex-row -mx-4">
            <main className="md:w-2/3 lg:w-3/4 px-4">
              <article className="border border-gray-200 bg-white shadow-xs rounded-sm mb-5 p-3 lg:p-5">
                {children}
              </article>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
