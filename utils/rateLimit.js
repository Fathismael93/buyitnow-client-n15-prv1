import { LRUCache } from 'lru-cache';

export const rateLimit = ({ interval, uniqueTokenPerInterval }) => {
  const tokenCache = new LRUCache({
    max: uniqueTokenPerInterval || 500,
    ttl: interval || 60000,
  });

  return {
    check: (req, limit, token) => {
      const tokenCount = tokenCache.get(token) || [0];
      if (tokenCount[0] === 0) {
        tokenCache.set(token, tokenCount);
      }

      if (tokenCount[0] >= limit) {
        return Promise.reject('Rate limit exceeded');
      }

      tokenCount[0] += 1;
      return Promise.resolve();
    },
  };
};
