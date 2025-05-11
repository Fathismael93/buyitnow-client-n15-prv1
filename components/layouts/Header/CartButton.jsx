'use client';

import Link from 'next/link';

const CartButton = ({ cartCount }) => {
  return (
    <Link
      href="/cart"
      className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-200 transition-colors relative"
      aria-label="Panier"
      data-testid="cart-button"
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
};

CartButton.displayName = 'CartButton';

export default CartButton;
