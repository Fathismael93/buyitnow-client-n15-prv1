'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { throttle } from '@/utils/performance';

/**
 * Hook pour détecter si l'élément est visible dans le viewport
 * @param {Object} options - Options pour l'IntersectionObserver
 * @returns {Array} - [ref, isVisible]
 */
export function useInView(options = { threshold: 0.1 }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [options]);

  return [ref, isVisible];
}

/**
 * Hook pour la détection du mode sombre/clair
 * @returns {boolean} - True si le mode sombre est activé
 */
export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Vérifier si le mode sombre est activé au chargement
    if (typeof window !== 'undefined') {
      const darkModeMediaQuery = window.matchMedia(
        '(prefers-color-scheme: dark)',
      );
      setIsDarkMode(darkModeMediaQuery.matches);

      // Mettre à jour l'état lorsque la préférence change
      const handleChange = (e) => {
        setIsDarkMode(e.matches);
      };

      darkModeMediaQuery.addEventListener('change', handleChange);

      return () => {
        darkModeMediaQuery.removeEventListener('change', handleChange);
      };
    }
  }, []);

  return isDarkMode;
}

/**
 * Hook pour utiliser localStorage avec fallback
 * @param {string} key - La clé de stockage
 * @param {any} initialValue - La valeur initiale
 * @returns {Array} - [storedValue, setValue]
 */
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

/**
 * Hook pour la gestion du redimensionnement de la fenêtre
 * @returns {Object} - { width, height }
 */
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = throttle(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, 200);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return windowSize;
}

/**
 * Hook pour détecter si l'utilisateur est en ligne
 * @returns {boolean} - True si l'utilisateur est en ligne
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook pour détecter si la page a été chargée depuis le cache
 * @returns {boolean} - True si la page a été chargée depuis le cache
 */
export function useCacheStatus() {
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('performance' in window)) return;

    // Attendre que toutes les ressources soient chargées
    window.addEventListener('load', () => {
      const navigationEntry = performance.getEntriesByType('navigation')[0];
      if (navigationEntry && navigationEntry.type === 'back_forward') {
        setLoadedFromCache(true);
      }
    });
  }, []);

  return loadedFromCache;
}

/**
 * Hook pour détecter le scroll
 * @returns {Object} - { scrollX, scrollY, scrollDirection }
 */
export function useScroll() {
  const [scrollPosition, setScrollPosition] = useState({
    scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
    scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    scrollDirection: 'none',
  });

  const lastScrollTop = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = throttle(() => {
      const currentScrollY = window.scrollY;
      const direction =
        currentScrollY > lastScrollTop.current
          ? 'down'
          : currentScrollY < lastScrollTop.current
            ? 'up'
            : 'none';

      lastScrollTop.current = currentScrollY;

      setScrollPosition({
        scrollX: window.scrollX,
        scrollY: currentScrollY,
        scrollDirection: direction,
      });
    }, 100);

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return scrollPosition;
}

/**
 * Hook pour détecter les clics à l'extérieur d'un élément
 * @param {Function} callback - Fonction à appeler lors d'un clic extérieur
 * @returns {Object} - Référence à attacher à l'élément
 */
export function useOutsideClick(callback) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [callback]);

  return ref;
}

/**
 * Hook pour créer un état avec un historique (undo/redo)
 * @param {any} initialState - L'état initial
 * @returns {Object} - { state, set, undo, redo, canUndo, canRedo, history }
 */
export function useStateWithHistory(initialState) {
  const [state, setState] = useState(initialState);
  const [history, setHistory] = useState([initialState]);
  const [pointer, setPointer] = useState(0);

  const set = useCallback(
    (newState) => {
      setState(newState);

      // Ajouter au nouvel état à l'historique
      setHistory((prev) => {
        const newHistory = [...prev.slice(0, pointer + 1), newState];
        return newHistory;
      });

      setPointer((prev) => prev + 1);
    },
    [pointer],
  );

  const undo = useCallback(() => {
    if (pointer <= 0) return;

    const newPointer = pointer - 1;
    setPointer(newPointer);
    setState(history[newPointer]);
  }, [history, pointer]);

  const redo = useCallback(() => {
    if (pointer >= history.length - 1) return;

    const newPointer = pointer + 1;
    setPointer(newPointer);
    setState(history[newPointer]);
  }, [history, pointer]);

  return {
    state,
    set,
    undo,
    redo,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    history,
  };
}
