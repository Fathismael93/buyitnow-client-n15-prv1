'use client';

import {
  useContext,
  useEffect,
  useState,
  useCallback,
  memo,
  useMemo,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import CartContext from '@/context/CartContext';
import { signOut, useSession } from 'next-auth/react';
import AuthContext from '@/context/AuthContext';
import { throwEnrichedError, handleAsyncError } from '@/monitoring/errorUtils';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

// Chargement dynamique optimisé du composant Search
const Search = dynamic(() => import('./Search'), {
  loading: () => (
    <div className="h-10 w-full max-w-xl bg-gray-100 animate-pulse rounded-md"></div>
  ),
  ssr: true,
});

// Sous-composants memoïsés pour éviter les re-rendus inutiles
const CartButton = memo(({ cartCount, pathname }) => {
  const handleClick = () => {
    if ([pathname].includes('/cart') === false) {
      window.location.href = '/cart';
    }
  };
  return (
    <Link
      href="/cart"
      className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-200 transition-colors relative"
      aria-label="Panier"
      data-testid="cart-button"
      onClick={handleClick}
    >
      <i className="text-gray-400 w-5 fa fa-shopping-cart"></i>
      <span className="ml-1">Panier ({cartCount > 0 ? cartCount : 0})</span>
      {cartCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
          {cartCount}
        </span>
      )}
    </Link>
  );
});

CartButton.displayName = 'CartButton';

const UserDropdown = memo(
  ({ user, pathname, clearUser, clearCartOnLogout }) => {
    const menuItems = useMemo(
      () => [
        { href: '/me/orders', label: 'Mes commandes' },
        { href: '/me/contact', label: 'Contacter le vendeur' },
      ],
      [],
    );

    const logoutHandler = (e) => {
      e.preventDefault();
      // Réinitialiser les contextes
      clearUser();
      clearCartOnLogout();
      signOut({ callbackUrl: '/login' });
    };

    const handleClick = () => {
      if ([pathname].includes('/me') === false) {
        window.location.href = '/me';
      }
    };

    return (
      <div className="relative group">
        <Link
          href="/me"
          className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-blue-50 transition-colors"
          aria-expanded="false"
          aria-haspopup="true"
          id="user-menu-button"
          onClick={handleClick}
        >
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200">
            <Image
              data-testid="profile image"
              alt={`Photo de profil de ${user?.name || 'utilisateur'}`}
              src={
                user?.avatar?.url !== null
                  ? user?.avatar?.url
                  : '/images/default.png'
              }
              fill
              sizes="32px"
              className="object-cover"
              priority={false}
            />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-gray-700">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate max-w-[150px]">
              {user?.email}
            </p>
          </div>
        </Link>

        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
          className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 z-50"
        >
          <div className="py-1">
            {menuItems.map((item, index) => (
              <Link
                key={`menu-item-${index}`}
                href={item.href}
                className={`block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 ${item.className || ''}`}
                role="menuitem"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={logoutHandler}
              className="block cursor-pointer w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              role="menuitem"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    );
  },
);

UserDropdown.displayName = 'UserDropdown';

const Header = () => {
  const {
    user,
    setLoading: setAuthLoading,
    setUser,
    clearUser,
  } = useContext(AuthContext);

  const { error, clearError, setCartToState, cartCount, clearCartOnLogout } =
    useContext(CartContext);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isLoadingCart, setIsLoadingCart] = useState(false);
  const { data } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Nous utilisons maintenant les utilitaires centralisés pour gérer les erreurs

  // Fonction sécurisée pour charger le panier
  const loadCart = useCallback(async () => {
    try {
      setIsLoadingCart(true);
      await setCartToState();
    } catch (error) {
      console.error('Error loading cart:', error);
      // Utilisation de l'utilitaire pour enrichir et propager l'erreur
      throwEnrichedError(error, 'Header', {
        action: 'loadCart',
        userId: user?.id,
      });
      setIsLoadingCart(false);
    }
  }, []);

  // Handle auth context updates
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  // Effet pour charger les données utilisateur et panier
  useEffect(() => {
    if (data?.user) {
      try {
        setUser(data?.user);
        loadCart();
      } catch (error) {
        // Utiliser l'utilitaire pour gérer l'erreur de manière asynchrone
        handleAsyncError(error, 'Header', {
          action: 'initUserData',
          userEmail: data?.user?.email,
        });
      }
    }
  }, [data]);

  const handleSignOut = async () => {
    try {
      setMobileMenuOpen(false);
      // Réinitialiser les contextes
      clearUser();
      clearCartOnLogout();

      // Déconnexion Next-Auth
      signOut({ callbackUrl: '/login' });
    } catch (error) {
      setMobileMenuOpen(false);
      console.error('Erreur lors de la déconnexion:', error);
      // Utiliser l'utilitaire avec une fonction de fallback
      handleAsyncError(error, 'Header', { action: 'handleSignOut' }, () => {
        // Fonction de fallback qui sera exécutée en cas d'erreur
        console.warn(
          'Fallback après erreur de déconnexion - redirection sécurisée',
        );
      });
      // Fallback de sécurité
      router.push('/login');
    }
  };

  const handleClick = () => {
    if ([pathname].includes('/me') === false) {
      setMobileMenuOpen(false);
      window.location.href = '/me';
    } else setMobileMenuOpen(false);
  };

  return (
    <header className="bg-white py-2 border-b sticky top-0 z-50 shadow-sm">
      <div className="container max-w-[1440px] mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between">
          {/* Logo */}
          <div className="shrink-0 mr-5">
            <Link href="/" aria-label="Accueil Buy It Now">
              <Image
                priority={true}
                src="/images/logo.png"
                height={40}
                width={120}
                alt="BuyItNow"
                className="h-10 w-auto"
              />
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            {user && <CartButton cartCount={cartCount} pathname={pathname} />}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              type="button"
              className="px-3 py-2 border border-gray-200 rounded-md text-gray-700"
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <i
                className={`fa ${mobileMenuOpen ? 'fa-times' : 'fa-bars'}`}
              ></i>
            </button>
          </div>

          {/* Search - Desktop */}
          <div className="hidden md:block md:flex-1 max-w-xl mx-4">
            <Search setLoading={setAuthLoading} />
          </div>

          {/* User navigation - Desktop */}
          <div className="hidden md:flex items-center space-x-3">
            {user && <CartButton cartCount={cartCount} />}

            {user ? (
              <UserDropdown
                user={user}
                pathname={pathname}
                clearUser={clearUser}
                clearCartOnLogout={clearCartOnLogout}
              />
            ) : (
              <Link
                href="/login"
                className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-200 transition-colors"
                data-testid="login"
              >
                <i className="text-gray-400 w-5 fa fa-user"></i>
                <span className="ml-1">Connexion</span>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id="mobile-menu"
          className={`md:hidden ${mobileMenuOpen ? 'mt-4 border-t pt-4' : 'hidden'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
        >
          <div className="mb-4">
            <Search setLoading={setAuthLoading} />
          </div>
          {user ? (
            <div className="space-y-3">
              <Link
                href="/me"
                className="flex items-center space-x-2 px-2 py-2 rounded-md hover:bg-blue-50"
                onClick={handleClick}
              >
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200">
                  <Image
                    alt={`Photo de profil de ${user?.name || 'utilisateur'}`}
                    src={
                      user?.avatar?.url !== null
                        ? user?.avatar?.url
                        : '/images/default.png'
                    }
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">
                    {user?.email}
                  </p>
                </div>
              </Link>
              <Link
                href="/me/orders"
                className="block px-2 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Mes commandes
              </Link>
              <Link
                href="/me/contact"
                className="block px-2 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                contacter le vendeur
              </Link>
              <button
                onClick={handleSignOut}
                className="block cursor-pointer w-full text-left px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
