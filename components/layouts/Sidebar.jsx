/* eslint-disable react/prop-types */
'use client';

import React from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Sidebar = ({ open, setOpen }) => {
  const pathName = usePathname();

  const active = 'bg-blue-100 text-blue-500';
  const hover = 'hover:bg-blue-100 hover:text-blue-500';

  const isMeLinks = () => {
    let isMe;
    switch (pathName) {
      case '/me':
        isMe = true;
        break;
      case '/address/new':
        isMe = true;
        break;
      case '/me/update':
        isMe = true;
        break;
      case '/me/update_password':
        isMe = true;
        break;

      default:
        isMe = false;
        break;
    }

    return isMe;
  };

  const logoutHandler = () => {
    setOpen((prev) => !prev);
    signOut();
  };

  return (
    <aside
      className={`${open ? 'block' : 'hidden'} md:block md:w-1/3 lg:w-1/4 px-4`}
    >
      <ul className="sidebar">
        <li>
          {' '}
          <Link
            href="/me"
            className={`${isMeLinks() ? active : hover} block px-3 py-2 text-gray-800 rounded-md`}
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            Your Profile
          </Link>
        </li>
        <li>
          {' '}
          <Link
            href="/me/orders"
            className={`${pathName === '/me/orders' ? active : hover} block px-3 py-2 text-gray-800 rounded-md`}
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            Purchases
          </Link>
        </li>
        <li>
          {' '}
          <Link
            href="/me/contact"
            className={`${pathName === '/me/contact' ? active : hover} block px-3 py-2 text-gray-800 rounded-md`}
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            Contact
          </Link>
        </li>

        <li>
          {' '}
          <p
            className="block px-3 py-2 text-red-800 hover:bg-red-100 hover:text-white-500 rounded-md cursor-pointer"
            onClick={logoutHandler}
          >
            Logout
          </p>
        </li>
      </ul>
    </aside>
  );
};

export default Sidebar;
