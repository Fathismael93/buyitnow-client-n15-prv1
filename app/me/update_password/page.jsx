import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const UpdatePassword = dynamic(
  () => import('@/components/auth/UpdatePassword'),
  {
    loading: () => <Loading />,
  },
);

export const metadata = {
  title: 'Buy It Now - Update Password',
};

const PasswordPage = () => {
  return <UpdatePassword />;
};

export default PasswordPage;
