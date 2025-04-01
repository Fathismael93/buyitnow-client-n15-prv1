import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Register = dynamic(() => import('@/components/auth/Register'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Registration',
};

const RegisterPage = () => {
  return <Register />;
};

export default RegisterPage;
