import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Login = dynamic(() => import('@/components/auth/Login'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Login',
};

const LoginPage = () => {
  return <Login />;
};

export default LoginPage;
