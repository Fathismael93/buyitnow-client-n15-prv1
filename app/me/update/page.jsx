import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const UpdateProfile = dynamic(() => import('@/components/auth/UpdateProfile'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Update Profile',
};

const UpdateProfilePage = () => {
  return <UpdateProfile />;
};

export default UpdateProfilePage;
