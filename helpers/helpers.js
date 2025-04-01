export const getPriceQueryParams = (queryParams, key, value) => {
  const hasValueInParam = queryParams.has(key);

  if (value && hasValueInParam) {
    queryParams.set(key, value);
  } else if (value) {
    queryParams.append(key, value);
  } else if (hasValueInParam) {
    queryParams.delete(key);
  }
  return queryParams;
};

export const parseCallbackUrl = (url) => {
  const res = url.replace(/%3A/g, ':').replace(/%2F/g, '/');
  return res;
};

export const getCookieName = () => {
  let cookieName = '';

  if (process.env.NODE_ENV === 'development') {
    cookieName = 'next-auth.session-token';
  }

  if (process.env.NODE_ENV === 'production') {
    cookieName = '__Secure-next-auth.session-token';
  }

  return cookieName;
};

// Demo: https://res.cloudinary.com/demo/image/upload/w_300,c_limit,q_auto/turtles.jpg
export function cloudinaryLoader({ src, width, quality }) {
  return `${src}?w=${width}&q=${quality || 75}`;
}

export const arrayHasData = (array) => {
  return array === undefined || !Array.isArray(array) || array?.length === 0;
};
