/* eslint-disable react/prop-types */
import React from 'react';
import dynamic from 'next/dynamic';

import { getSingleAddress } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

const UpdateAddress = dynamic(() => import('@/components/user/UpdateAddress'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Update Address',
};

const UpdateAddressPage = async ({ params }) => {
  const address = await getSingleAddress((await params)?.id);

  return <UpdateAddress id={params?.id} address={address} />;
};

export default UpdateAddressPage;
