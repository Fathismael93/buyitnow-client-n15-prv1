import Link from 'next/link';
import Image from 'next/image';
import { memo } from 'react';

const ItemCart = memo(function ItemCart({
  cartItem,
  deleteItemFromCart,
  decreaseQty,
  increaseQty,
}) {
  // Validation des propriétés pour éviter les erreurs potentielles
  if (!cartItem) {
    return null;
  }

  const {
    id,
    productId,
    productName = 'Product',
    imageUrl,
    stock = 0,
    quantity = 0,
    price = 0,
    subtotal = 0,
  } = cartItem;

  // Gestion d'erreur d'image avec image par défaut
  const handleImageError = (e) => {
    e.target.src = '/images/default_product.png';
    e.target.onerror = null; // Éviter les boucles de rechargement
  };

  // Vérification que la quantité ne dépasse pas le stock
  const canIncreaseQuantity = quantity < stock;

  // Formater le prix avec 2 décimales de manière sécurisée
  const formatPrice = (value) => {
    const numValue = parseFloat(value);
    return isNaN(numValue) ? '0.00' : numValue.toFixed(2);
  };

  return (
    <div className="cart-item" data-testid={`cart-item-${id}`}>
      <div className="flex flex-wrap lg:flex-row gap-5 mb-4">
        <div className="w-full lg:w-2/5 xl:w-2/4">
          <figure className="flex leading-5">
            <div>
              <div className="block w-16 h-16 rounded-sm border border-gray-200 overflow-hidden">
                <Image
                  src={imageUrl || '/images/default_product.png'}
                  alt={productName}
                  title={productName}
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                  onError={handleImageError}
                  loading="lazy"
                  priority={false}
                />
              </div>
            </div>
            <figcaption className="ml-3">
              <p>
                <Link
                  href={`/product/${productId}`}
                  className="hover:text-blue-600 font-semibold"
                  aria-label={`View details of ${productName}`}
                >
                  {productName}
                </Link>
              </p>
              <p
                className="mt-1 text-gray-800"
                aria-label={`${stock} items in stock`}
              >
                Stock: {stock} items
              </p>
            </figcaption>
          </figure>
        </div>
        <div className="w-24">
          <div className="flex flex-row h-10 w-full rounded-lg relative bg-transparent mt-1">
            <button
              type="button"
              aria-label="Reduce quantity"
              title="Reduce quantity"
              data-action="decrement"
              data-testid="decrement"
              className="bg-gray-300 text-gray-600 hover:text-gray-700 hover:bg-gray-400 h-full w-20 rounded-l cursor-pointer outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => decreaseQty(cartItem)}
              disabled={quantity <= 1}
            >
              <span className="m-auto text-2xl font-thin">−</span>
            </button>
            <input
              type="number"
              className="outline-none focus:outline-none text-center w-full bg-gray-300 font-semibold text-md hover:text-black focus:text-black md:text-base cursor-default flex items-center text-gray-900"
              name="custom-input-number"
              value={quantity}
              readOnly
              aria-label={`Quantity: ${quantity}`}
              title="Item quantity"
            />
            <button
              type="button"
              aria-label={
                canIncreaseQuantity
                  ? 'Increase quantity'
                  : 'Maximum stock reached'
              }
              title={
                canIncreaseQuantity
                  ? 'Increase quantity'
                  : 'Maximum stock reached'
              }
              data-action="increment"
              data-testid="increment"
              className={`bg-gray-300 text-gray-600 hover:text-gray-700 hover:bg-gray-400 h-full w-20 rounded-r cursor-pointer focus:ring-2 focus:ring-blue-500 ${!canIncreaseQuantity ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => canIncreaseQuantity && increaseQty(cartItem)}
              disabled={!canIncreaseQuantity}
            >
              <span className="m-auto text-2xl font-thin">+</span>
            </button>
          </div>
        </div>
        <div>
          <div className="leading-5">
            <p
              className="font-semibold not-italic"
              aria-label={`Total: $${formatPrice(subtotal)}`}
              title="Total price for this item"
            >
              ${formatPrice(subtotal)}
            </p>
            <small className="text-gray-800" data-testid="unit-price-per-item">
              ${formatPrice(price)} / per item
            </small>
          </div>
        </div>
        <div className="flex-auto">
          <div className="float-right">
            <button
              type="button"
              className="px-4 py-2 inline-block text-red-600 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-gray-100 cursor-pointer focus:ring-2 focus:ring-red-500"
              onClick={() => deleteItemFromCart(id)}
              aria-label={`Remove ${productName} from cart`}
              title="Remove from cart"
              data-testid="remove-item"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <hr className="my-4" />
    </div>
  );
});

// Définir displayName pour aider au débuggage
ItemCart.displayName = 'ItemCart';

export default ItemCart;
