import Link from 'next/link';
import Image from 'next/image';
import { memo } from 'react';

const ItemCart = memo(function ItemCart({
  cartItem,
  deleteItemFromCart,
  decreaseQty,
  increaseQty,
}) {
  if (!cartItem) return null;

  // Extraction et validation des propriétés avec valeurs par défaut
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
  const canDecreaseQuantity = quantity > 1;

  // Formater le prix avec 2 décimales de manière sécurisée
  const formatPrice = (value) => {
    const numValue = parseFloat(value);
    return isNaN(numValue) ? '0.00' : numValue.toFixed(2);
  };

  return (
    <div className="cart-item p-4 lg:p-5" data-testid={`cart-item-${id}`}>
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
        {/* Section image et info du produit */}
        <div className="w-full md:w-2/5 xl:w-2/4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 rounded border border-gray-200 overflow-hidden relative bg-gray-50">
                <Image
                  src={imageUrl || '/images/default_product.png'}
                  alt={productName}
                  title={productName}
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                  onError={handleImageError}
                  loading="lazy"
                />
              </div>
            </div>
            <div className="ml-4">
              <h3 className="font-medium text-gray-800 mb-1">
                <Link
                  href={`/product/${productId}`}
                  className="hover:text-primary transition-colors"
                  aria-label={`View details of ${productName}`}
                >
                  {productName}
                </Link>
              </h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span
                  className="text-gray-600"
                  aria-label={`${stock} items in stock`}
                >
                  Stock:{' '}
                  <span
                    className={
                      stock < 10 ? 'text-danger-dark' : 'text-success-dark'
                    }
                  >
                    {stock}
                  </span>
                </span>
                <span className="text-gray-600 md:hidden">
                  Price:{' '}
                  <span className="font-medium">${formatPrice(price)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Contrôles de quantité */}
        <div className="w-32 sm:w-36">
          <div className="flex h-10 rounded-lg relative bg-gray-50 border border-gray-200">
            <button
              type="button"
              aria-label={
                canDecreaseQuantity
                  ? 'Decrease quantity'
                  : 'Minimum quantity reached'
              }
              title={
                canDecreaseQuantity
                  ? 'Decrease quantity'
                  : 'Minimum quantity reached'
              }
              className={`flex-1 flex items-center justify-center text-gray-600 rounded-l-lg ${
                canDecreaseQuantity
                  ? 'hover:bg-gray-200 active:bg-gray-300'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={() => canDecreaseQuantity && decreaseQty(cartItem)}
              disabled={!canDecreaseQuantity}
              data-testid="decrement"
            >
              <span className="text-xl">−</span>
            </button>
            <input
              type="text"
              className="outline-none focus:outline-none text-center w-full bg-transparent font-medium text-gray-800"
              name="quantity"
              value={quantity}
              readOnly
              aria-label={`Quantity: ${quantity}`}
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
              className={`flex-1 flex items-center justify-center text-gray-600 rounded-r-lg ${
                canIncreaseQuantity
                  ? 'hover:bg-gray-200 active:bg-gray-300'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={() => canIncreaseQuantity && increaseQty(cartItem)}
              disabled={!canIncreaseQuantity}
              data-testid="increment"
            >
              <span className="text-xl">+</span>
            </button>
          </div>
        </div>

        {/* Prix */}
        <div className="w-28 hidden md:block">
          <div>
            <p
              className="font-medium text-gray-800"
              aria-label={`Total: $${formatPrice(subtotal)}`}
            >
              ${formatPrice(subtotal)}
            </p>
            <p className="text-sm text-gray-500">
              ${formatPrice(price)} / each
            </p>
          </div>
        </div>

        {/* Prix pour mobile */}
        <div className="w-full sm:w-auto md:hidden">
          <p
            className="font-medium text-gray-800"
            aria-label={`Total: $${formatPrice(subtotal)}`}
          >
            Total: ${formatPrice(subtotal)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex-auto flex justify-end">
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-danger border border-danger-light rounded hover:bg-danger-light transition-colors focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
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
  );
});

// Définir displayName pour aider au débuggage
ItemCart.displayName = 'ItemCart';

export default ItemCart;
