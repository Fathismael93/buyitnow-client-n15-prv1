'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-toastify';

import { parseCallbackUrl } from '@/helpers/helpers';
import { loginSchema } from '@/helpers/schemas';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const router = useRouter();
  const params = useSearchParams();
  const callBackUrl = params.get('callbackUrl');

  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      const result = await loginSchema.validate({ email, password });

      if (result) {
        const data = await signIn('credentials', {
          email,
          password,
          callbackUrl: callBackUrl ? parseCallbackUrl(callBackUrl) : '/',
        });

        if (data?.error) {
          toast.error(data?.error);
        }

        if (data?.ok) {
          router.push('/');
        }
      }
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div
      style={{ maxWidth: '480px' }}
      className="mt-10 mb-20 p-4 md:p-7 mx-auto rounded-sm bg-white shadow-lg"
    >
      <form onSubmit={submitHandler}>
        <h2 className="mb-5 text-2xl font-semibold">Login</h2>

        <div className="mb-4">
          <label className="block mb-1"> Email </label>
          <input
            className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
            type="email"
            placeholder="Type your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1"> Password </label>
          <input
            className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
            type="password"
            placeholder="Type your password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="my-2 px-4 py-2 text-center w-full inline-block text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
        >
          Login
        </button>

        <hr className="mt-4" />

        <p className="text-center mt-5">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-800 font-semibold">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Login;
