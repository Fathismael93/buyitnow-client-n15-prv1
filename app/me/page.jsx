import React from 'react';
import dynamic from 'next/dynamic';

import { getAllAddresses } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

const Profile = dynamic(() => import('@/components/auth/Profile'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Your Profile',
};

const ProfilePage = async () => {
  const data = await getAllAddresses('profile');

  return <Profile addresses={data?.addresses} />;
};

export default ProfilePage;
