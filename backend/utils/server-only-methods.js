import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import queryString from 'query-string';
import { getCookieName } from '@/helpers/helpers';
import { toast } from 'react-toastify';

export const getAllProducts = async (searchParams) => {
  const urlParams = {
    keyword: (await searchParams).keyword,
    page: (await searchParams).page,
    category: (await searchParams).category,
    'price[gte]': (await searchParams).min,
    'price[lte]': (await searchParams).max,
    'ratings[gte]': (await searchParams).ratings,
  };

  const searchQuery = queryString.stringify(urlParams);

  const res = await fetch(`${process.env.API_URL}/api/products?${searchQuery}`);

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.error !== undefined) {
    ///////
  }

  return data?.data;
};

export const getProductDetails = async (id) => {
  const isValidId = mongoose.isValidObjectId(id);

  if (id === undefined || id === null || !isValidId) {
    return notFound();
  }

  const res = await fetch(`${process.env.API_URL}/api/products/${id}`);

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.product === undefined) {
    return notFound();
  }

  if (data?.error !== undefined) {
    ///////
    return [];
  }

  return data;
};

export const getAllAddresses = async (page) => {
  try {
    const nextCookies = await cookies();
    const nextAuthSessionToken = nextCookies.get(
      '__Secure-next-auth.session-token',
    );

    const res = await fetch(`${process.env.API_URL}/api/address`, {
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
      },
    });

    const data = await res.json();

    if (data?.success === false) {
      toast.info(data?.message);
      return [];
    }

    if (data?.error !== undefined) {
      ///////
      return [];
    }

    if (page === 'profile') {
      delete data?.data?.paymentTypes;
    }

    return data?.data;
    // eslint-disable-next-line no-unused-vars, no-empty
  } catch (error) {}
};

export const getSingleAddress = async (id) => {
  if (id === undefined || id === null) {
    return notFound();
  }

  const nextCookies = await cookies();

  const cookieName = getCookieName();
  const nextAuthSessionToken = nextCookies.get(cookieName);

  const res = await fetch(`${process.env.API_URL}/api/address/${id}`, {
    headers: {
      Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
    },
  });

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.error !== undefined) {
    ///////
    return [];
  }

  if (data?.data === undefined) {
    return notFound();
  }

  return data?.data?.address;
};

export const getAllOrders = async (searchParams) => {
  const nextCookies = await cookies();

  const nextAuthSessionToken = nextCookies.get(
    '__Secure-next-auth.session-token',
  );

  const urlParams = {
    page: (await searchParams)?.page || 1,
  };

  const searchQuery = queryString.stringify(urlParams);

  const res = await fetch(
    `${process.env.API_URL}/api/orders/me?${searchQuery}`,
    {
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
      },
    },
  );

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.error !== undefined) {
    ///////
    return [];
  }

  if (data?.data === undefined) {
    return notFound();
  }

  return data?.data;
};
