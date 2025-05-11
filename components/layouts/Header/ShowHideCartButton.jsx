'use client';

import { useEffect, useState } from 'react';
import CartButton from './CartButton';

const ShowHideCartButton = ({ user, cartCount }) => {
  const [displayButton, setDisplayButton] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayButton(true);
    }
  }, [user, cartCount]);

  return displayButton ? <CartButton cartCount={cartCount} /> : null;
};

export default ShowHideCartButton;
