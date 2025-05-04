// 'use client';

// import { useContext } from 'react';

// import AuthContext from '@/context/AuthContext';

export default function UserLayout({ children }) {
  // const { user } = useContext(AuthContext);

  return (
    <>
      <section className="flex flex-row py-3 sm:py-7 bg-blue-100">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          {/* <h2 className="font-medium text-2xl">{user?.name?.toUpperCase()}</h2> */}
          <h2 className="font-medium text-2xl">Fathi Ahmed</h2>
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
