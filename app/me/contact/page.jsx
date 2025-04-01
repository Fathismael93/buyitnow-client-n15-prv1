import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Contact = dynamic(() => import('@/components/user/Contact'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Contact the owner',
};

const ContactPage = () => {
  return <Contact />;
};

export default ContactPage;
