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
import * as Sentry from '@sentry/nextjs';
import CartContext from '@/context/CartContext';
import { signOut, useSession } from 'next-auth/react';
import AuthContext from '@/context/AuthContext';

// Chargement dynamique optimisé du composant Search
const Search = dynamic(() => import('./Search'), {
  loading: () => (
    <div className="h-10 w-full max-w-xl bg-gray-100 animate-pulse rounded-md"></div>
  ),
  ssr: true,
});

// =============================================================================
// SOUS-COMPOSANTS MEMOÏSÉS OPTIMISÉS AVEC NOUVEAUX BREAKPOINTS
// =============================================================================

const CartButton = memo(({ cartCount }) => (
  <Link
    href="/cart"
    className="
      px-3 py-2 inline-block text-center text-gray-700 
      bg-white shadow-sm border border-gray-200 rounded-md 
      hover:bg-blue-50 hover:border-blue-200 transition-colors relative
      optimize-large
    "
    aria-label="Panier"
    data-testid="cart-button"
  >
    <i className="text-gray-400 w-5 fa fa-shopping-cart"></i>
    <span className="ml-1">Panier ({cartCount > 0 ? cartCount : 0})</span>
    {cartCount > 0 && (
      <span
        className="
        absolute -top-2 -right-2 bg-red-500 text-white rounded-full 
        w-5 h-5 flex items-center justify-center text-xs
        small-xl:w-6 small-xl:h-6
      "
      >
        {cartCount}
      </span>
    )}
  </Link>
));

CartButton.displayName = 'CartButton';

const UserDropdown = memo(({ user }) => {
  const menuItems = useMemo(
    () => [
      { href: '/me', label: 'Mon profil' },
      { href: '/me/orders', label: 'Mes commandes' },
      { href: '/me/contact', label: 'Contactez le vendeur' },
    ],
    [],
  );

  return (
    <div className="relative group">
      <Link
        href="/me"
        className="
          flex items-center space-x-2 px-3 py-2 rounded-md 
          hover:bg-blue-50 transition-colors
          optimize-large
        "
        aria-expanded="false"
        aria-haspopup="true"
        id="user-menu-button"
      >
        <div
          className="
          relative w-8 h-8 rounded-full overflow-hidden border border-gray-200
          large-sm:w-9 large-sm:h-9
        "
        >
          <Image
            data-testid="profile image"
            alt={`Photo de profil de ${user?.name || 'utilisateur'}`}
            src={user?.avatar ? user?.avatar?.url : '/images/default.png'}
            fill
            sizes="(max-width: 1280px) 32px, 36px"
            className="object-cover"
            priority={false}
          />
        </div>

        {/* Informations utilisateur - Visibles selon la taille d'écran */}
        <div
          className="
          hidden 
          large-xs:block large-xs:max-w-[120px]
          large-sm:max-w-[150px]
          large-lg:max-w-[180px]
        "
        >
          <p
            className="
            text-sm font-medium text-gray-700
            large-sm:text-base
          "
          >
            {user?.name}
          </p>
          <p
            className="
            text-xs text-gray-500 truncate
            large-sm:text-sm
          "
          >
            {user?.email}
          </p>
        </div>
      </Link>

      <div
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="user-menu-button"
        className="
          absolute right-0 mt-1 w-48 bg-white rounded-md 
          shadow-lg border border-gray-200 
          invisible group-hover:visible opacity-0 group-hover:opacity-100 
          transition-all duration-200 z-50
          large-sm:w-52
        "
      >
        <div className="py-1">
          {menuItems.map((item, index) => (
            <Link
              key={`menu-item-${index}`}
              href={item.href}
              className={`
                block px-4 py-2 text-sm text-gray-700 
                hover:bg-blue-50 transition-colors
                large-sm:text-base large-sm:px-5 large-sm:py-3
                ${item.className || ''}
              `}
              role="menuitem"
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="
              block cursor-pointer w-full text-left px-4 py-2 
              text-sm text-red-600 hover:bg-red-50 transition-colors
              large-sm:text-base large-sm:px-5 large-sm:py-3
            "
            role="menuitem"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
});

UserDropdown.displayName = 'UserDropdown';

// =============================================================================
// COMPOSANT PRINCIPAL HEADER OPTIMISÉ
// =============================================================================

const Header = () => {
  const {
    user,
    setLoading: setAuthLoading,
    setUser,
    clearUser,
  } = useContext(AuthContext);
  const { setCartToState, cartCount, clearCartOnLogout } =
    useContext(CartContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoadingCart, setIsLoadingCart] = useState(false);
  const { data } = useSession();

  // Fonction sécurisée pour charger le panier
  const loadCart = useCallback(async () => {
    try {
      setIsLoadingCart(true);
      await setCartToState();
    } catch (error) {
      console.error('Error loading cart:', error);
      Sentry.captureException(error, {
        tags: {
          component: 'Header',
          action: 'loadCart',
        },
      });
    } finally {
      setIsLoadingCart(false);
    }
  }, [setCartToState]);

  // Effet pour charger les données utilisateur et panier
  useEffect(() => {
    if (data) {
      try {
        setUser(data?.user);
        loadCart();
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            component: 'Header',
            action: 'initUserData',
          },
        });
      }
    }
  }, [data, setUser, loadCart]);

  // Fermer le menu mobile si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      const mobileMenu = document.getElementById('mobile-menu');
      if (mobileMenu && !mobileMenu.contains(event.target) && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    // Ajouter la gestion des touches clavier pour l'accessibilité
    const handleEscape = (event) => {
      if (event.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    try {
      // Réinitialiser les contextes
      clearUser();
      clearCartOnLogout();

      // Déconnexion Next-Auth
      await signOut({ callbackUrl: '/login' });

      // Force une navigation hard après une courte pause
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      window.location.href = '/login';
    }
  };

  return (
    <header
      className="
      bg-white border-b sticky top-0 z-50 shadow-sm
      py-2 small-xl:py-3
      medium-sm:py-2
      large-xs:py-3
    "
    >
      {/* Container responsive avec breakpoints optimisés */}
      <div
        className="
        container-responsive
        max-w-[1440px] mx-auto
        px-3 small-sm:px-4
        medium-sm:px-5
        large-xs:px-6
        large-lg:px-8
      "
      >
        <div className="flex flex-wrap items-center justify-between">
          {/* ===== LOGO - RESPONSIVE ===== */}
          <div
            className="
            shrink-0 
            mr-3 small-sm:mr-4 small-lg:mr-5
            medium-sm:mr-6
            large-xs:mr-8
          "
          >
            <Link href="/" aria-label="Accueil Buy It Now">
              <Image
                priority={true}
                src="/images/logo.png"
                height={40}
                width={120}
                alt="BuyItNow"
                className="
                  h-8 w-auto small-sm:h-9 small-lg:h-10
                  medium-sm:h-11
                  large-xs:h-12
                "
                sizes="(max-width: 375px) 96px, (max-width: 768px) 108px, (max-width: 1200px) 120px, 144px"
              />
            </Link>
          </div>

          {/* ===== MENU MOBILE BUTTON - PETITS ÉCRANS UNIQUEMENT ===== */}
          <div
            className="
            flex items-center
            small-only:flex
            medium-sm:hidden
            optimize-small
          "
          >
            {/* Panier mobile - Visible seulement si utilisateur connecté */}
            {user && (
              <Link
                href="/cart"
                className="
                  px-2 py-2 small-sm:px-3
                  inline-block text-center text-gray-700 
                  bg-white shadow-sm border border-gray-200 rounded-md 
                  mr-2 small-sm:mr-3 relative
                  hover:bg-blue-50 transition-colors
                  optimize-small
                "
                aria-label="Panier mobile"
              >
                <i className="text-gray-400 w-4 small-sm:w-5 fa fa-shopping-cart"></i>
                {cartCount > 0 && (
                  <span
                    className="
                    absolute -top-1 -right-1 bg-red-500 text-white rounded-full 
                    w-4 h-4 small-sm:w-5 small-sm:h-5
                    flex items-center justify-center 
                    text-xs small-sm:text-xs
                  "
                  >
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            {/* Bouton hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="
                px-2 py-2 small-sm:px-3 small-sm:py-2
                border border-gray-200 rounded-md text-gray-700
                hover:bg-gray-50 transition-colors
                optimize-small
              "
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <i
                className={`
                  fa text-sm small-sm:text-base
                  ${mobileMenuOpen ? 'fa-times' : 'fa-bars'}
                `}
              ></i>
            </button>
          </div>

          {/* ===== BARRE DE RECHERCHE - MOYENS/GRANDS ÉCRANS ===== */}
          <div
            className="
            hidden 
            medium-sm:block medium-sm:flex-1 medium-sm:max-w-md medium-sm:mx-4
            medium-lg:max-w-lg medium-lg:mx-5
            medium-xxl:max-w-xl
            large-xs:max-w-2xl large-xs:mx-6
            large-sm:mx-8
            large-lg:mx-10
          "
          >
            <Search setLoading={setAuthLoading} />
          </div>

          {/* ===== NAVIGATION UTILISATEUR - MOYENS/GRANDS ÉCRANS ===== */}
          <div
            className="
            hidden 
            medium-sm:flex items-center 
            space-x-2 medium-lg:space-x-3
            large-xs:space-x-4
          "
          >
            {/* Bouton panier - Desktop */}
            {user && <CartButton cartCount={cartCount} />}

            {/* Connexion ou profil utilisateur */}
            {!user ? (
              <Link
                href="/login"
                className="
                  px-3 py-2 inline-block text-center text-gray-700 
                  bg-white shadow-sm border border-gray-200 rounded-md 
                  hover:bg-blue-50 hover:border-blue-200 transition-colors
                  medium-lg:px-4
                  large-xs:px-5
                  optimize-large
                "
                data-testid="login"
              >
                <i className="text-gray-400 w-4 medium-lg:w-5 fa fa-user"></i>
                <span
                  className="
                  ml-1 text-sm medium-lg:text-base
                  hidden medium-lg:inline
                "
                >
                  Connexion
                </span>
              </Link>
            ) : (
              <UserDropdown user={user} />
            )}
          </div>
        </div>

        {/* ===== MENU MOBILE - AFFICHÉ CONDITIONNELLEMENT ===== */}
        {mobileMenuOpen && (
          <div
            id="mobile-menu"
            className="
              small-only:block
              medium-sm:hidden
              mt-3 small-sm:mt-4 border-t pt-3 small-sm:pt-4
              animate-in slide-in-from-top-2 duration-200
              optimize-small
            "
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
          >
            {/* Barre de recherche mobile */}
            <div className="mb-3 small-sm:mb-4">
              <Search setLoading={setAuthLoading} />
            </div>

            {user ? (
              /* Menu utilisateur connecté */
              <div className="space-y-2 small-sm:space-y-3">
                {/* Profil utilisateur */}
                <Link
                  href="/me"
                  className="
                    flex items-center space-x-2 small-sm:space-x-3
                    px-2 py-2 small-sm:px-3 small-sm:py-3
                    rounded-md hover:bg-blue-50 transition-colors
                  "
                >
                  <div
                    className="
                    relative w-8 h-8 small-sm:w-10 small-sm:h-10
                    rounded-full overflow-hidden border border-gray-200
                  "
                  >
                    <Image
                      alt={`Photo de profil de ${user?.name || 'utilisateur'}`}
                      src={
                        user?.avatar ? user?.avatar?.url : '/images/default.png'
                      }
                      fill
                      sizes="(max-width: 375px) 32px, 40px"
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p
                      className="
                      text-sm small-sm:text-base font-medium text-gray-700
                    "
                    >
                      {user?.name}
                    </p>
                    <p
                      className="
                      text-xs small-sm:text-sm text-gray-500 truncate 
                      max-w-[180px] small-sm:max-w-[220px]
                    "
                    >
                      {user?.email}
                    </p>
                  </div>
                </Link>

                {/* Liens du menu */}
                <Link
                  href="/me/orders"
                  className="
                    block px-2 py-2 small-sm:px-3 small-sm:py-3
                    text-sm small-sm:text-base text-gray-700 
                    hover:bg-blue-50 rounded-md transition-colors
                  "
                >
                  Mes commandes
                </Link>
                <Link
                  href="/me/contact"
                  className="
                    block px-2 py-2 small-sm:px-3 small-sm:py-3
                    text-sm small-sm:text-base text-gray-700 
                    hover:bg-blue-50 rounded-md transition-colors
                  "
                >
                  Contactez le vendeur
                </Link>

                {/* Bouton de déconnexion */}
                <button
                  onClick={handleSignOut}
                  className="
                    block cursor-pointer w-full text-left 
                    px-2 py-2 small-sm:px-3 small-sm:py-3
                    text-sm small-sm:text-base text-red-600 
                    hover:bg-red-50 rounded-md transition-colors
                  "
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              /* Bouton de connexion pour utilisateur non connecté */
              <Link
                href="/login"
                className="
                  block w-full text-center 
                  px-4 py-3 small-sm:px-5 small-sm:py-4
                  bg-blue-600 text-white rounded-md 
                  hover:bg-blue-700 transition-colors
                  text-sm small-sm:text-base font-medium
                "
              >
                Connexion
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
