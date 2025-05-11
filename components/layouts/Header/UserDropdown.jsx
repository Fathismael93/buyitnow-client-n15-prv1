'use client';

import { memo, useMemo } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

const UserDropdown = memo(({ user }) => {
  const menuItems = useMemo(
    () => [
      { href: '/me', label: 'Mon profil' },
      { href: '/me/orders', label: 'Mes commandes' },
      { href: '/me/contact', label: 'Contacter le vendeur' },
    ],
    [],
  );

  const logoutHandler = (e) => {
    e.preventDefault();
    signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="relative group">
      <Link
        href="/me"
        className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-blue-50 transition-colors"
        aria-expanded="false"
        aria-haspopup="true"
        id="user-menu-button"
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
});

UserDropdown.displayName = 'UserDropdown';

export default UserDropdown;
