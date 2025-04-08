import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import queryString from 'query-string';
import { getCookieName } from '@/helpers/helpers';
import { toast } from 'react-toastify';
import { getCacheHeaders } from '@/utils/cache';
import {
  categorySchema,
  pageSchema,
  priceRangeSchema,
  searchSchema,
} from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';

// Cache TTL en secondes
const CACHE_TTL = {
  products: 300, // 5 minutes
  product: 600, // 10 minutes
  addresses: 900, // 15 minutes
  orders: 300, // 5 minutes
};

export const getAllProducts = async (searchParams) => {
  try {
    // Créer un objet pour stocker les paramètres filtrés
    const urlParams = {};

    // Validation avec les schémas Yup après sanitisation
    const validationPromises = [];
    const validationErrors = [];

    console.log('searchParams:', searchParams);

    // Vérifier si searchParams est défini avant d'y accéder
    if (searchParams) {
      // Validation du paramètre de recherche, keyword
      console.log('Validating keyword:', searchParams.keyword);

      if (searchParams.keyword) {
        validationPromises.push(
          searchSchema
            .validate({ keyword: searchParams.keyword }, { abortEarly: false })
            .catch((err) => {
              validationErrors.push({
                field: 'keyword',
                message: err.errors[0],
              });
            }),
        );
      }

      console.log('Validating page:', searchParams.page);

      if (searchParams.page) {
        validationPromises.push(
          pageSchema
            .validate({ page: searchParams.page }, { abortEarly: false })
            .catch((err) => {
              validationErrors.push({
                field: 'page',
                message: err.errors[0],
              });
            }),
        );
      }

      console.log('Validating category:', searchParams.category);

      if (searchParams.category) {
        validationPromises.push(
          categorySchema
            .validate({ value: searchParams.category }, { abortEarly: false })
            .catch((err) => {
              validationErrors.push({
                field: 'category',
                message: err.errors[0],
              });
            }),
        );
      }

      console.log(
        'Validating price range:',
        searchParams.min,
        searchParams.max,
      );

      if (searchParams.min || searchParams.max) {
        validationPromises.push(
          priceRangeSchema
            .validate(
              {
                minPrice: searchParams.min,
                maxPrice: searchParams.max,
              },
              { abortEarly: false },
            )
            .catch((err) => {
              validationErrors.push({
                field: 'price',
                message: err.errors[0],
              });
            }),
        );
        urlParams['price[gte]'] = searchParams.min;
      }

      console.log('Starting validation promises...');

      // Exécuter toutes les validations en parallèle
      await Promise.all(validationPromises);

      console.log('Validation promises completed.');
    }

    // Si des erreurs de validation sont trouvées, retourner immédiatement
    if (validationErrors?.length > 0) {
      console.error('Validation errors:', validationErrors);
      // a completer
      return;
    } else {
      console.log('No validation errors found.');
      // Ajouter les paramètres qui existent
      if (searchParams.keyword) {
        urlParams.keyword = searchParams.keyword;
      }
      if (searchParams.page) urlParams.page = searchParams.page;
      if (searchParams.category) urlParams.category = searchParams.category;
      if (searchParams.min) urlParams['price[gte]'] = searchParams.min;
      if (searchParams.max) urlParams['price[lte]'] = searchParams.max;
    }

    // Construire la chaîne de requête
    const searchQuery = new URLSearchParams(urlParams).toString();
    const cacheControl = getCacheHeaders('products');

    console.log('Search query:', searchQuery);
    console.log('Cache-Control header:', cacheControl);

    // S'assurer que l'URL est correctement formatée
    const apiUrl = `${process.env.API_URL || ''}/api/products${searchQuery ? `?${searchQuery}` : ''}`;

    console.log('API URL:', apiUrl);

    const res = await fetch(apiUrl, {
      next: {
        revalidate: CACHE_TTL.products,
        tags: [
          'products',
          ...(urlParams.category ? [`category-${urlParams.category}`] : []),
        ],
      },
      headers: {
        'Cache-Control': cacheControl,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Error in getAllProducts API call:', res.status, errorText);
      return { products: [], totalPages: 0 };
    }

    try {
      const data = await res.json();
      console.log(
        'Successfully parsed products data, count:',
        data?.products?.length || 0,
      );

      console.log('Data:', data);

      return data;
    } catch (parseError) {
      console.error('JSON parsing error in getAllProducts:', parseError);
      const rawText = await res.clone().text();
      console.error('Raw response text:', rawText.substring(0, 200) + '...'); // Log des premiers 200 caractères
      return { products: [], totalPages: 0 };
    }
  } catch (error) {
    console.error('Exception in getAllProducts:', error);
    captureException(error, {
      tags: { action: 'get_all_products' },
      extra: { searchParams },
    });

    // Renvoyer un objet vide pour éviter de planter l'application
    return { products: [], totalPages: 0 };
  }
};

export const getCategories = async () => {
  try {
    const res = await fetch(`${process.env.API_URL}/api/category`);

    const data = await res.json();

    if (data?.success === false) {
      toast.info(data?.message);
      return [];
    }

    return data?.data?.categories;
  } catch (error) {
    console.error(error);
    toast.error('Something went wrong!');
    return [];
  }
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

  if (data?.data?.product === undefined) {
    console.error('Product not found');
    return notFound();
  }

  if (data?.error !== undefined) {
    console.error('Error fetching product details');
    ///////
    return [];
  }

  return data?.data;
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
