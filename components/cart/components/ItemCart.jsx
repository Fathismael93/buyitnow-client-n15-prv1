import Link from 'next/link';
import Image from 'next/image';

const ItemCart = ({
  cartItem,
  deleteItemFromCart,
  decreaseQty,
  increaseQty,
}) => {
  // Gestion d'erreur d'image avec image par défaut
  const handleImageError = (e) => {
    e.target.src = '/images/default_product.png';
  };

  // Vérification que la quantité ne dépasse pas le stock
  const canIncreaseQuantity = cartItem.quantity < cartItem.stock;

  console.log('ItemCart', cartItem);

  return (
    <div className="cart-item">
      <div className="flex flex-wrap lg:flex-row gap-5 mb-4">
        <div className="w-full lg:w-2/5 xl:w-2/4">
          <figure className="flex leading-5">
            <div>
              <div className="block w-16 h-16 rounded-sm border border-gray-200 overflow-hidden">
                <Image
                  src={cartItem.imageUrl || '/images/default_product.png'}
                  alt={cartItem.productName}
                  title={cartItem.productName}
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                  onError={handleImageError}
                />
              </div>
            </div>
            <figcaption className="ml-3">
              <p>
                <Link
                  href={`/product/${cartItem.productId}`}
                  className="hover:text-blue-600 font-semibold"
                  aria-label={`View details of ${cartItem.productName}`}
                >
                  {cartItem.productName}
                </Link>
              </p>
              <p
                className="mt-1 text-gray-800"
                aria-label={`${cartItem.stock} items in stock`}
              >
                Stock: {cartItem.stock} items
              </p>
            </figcaption>
          </figure>
        </div>
        <div className="w-24">
          <div className="flex flex-row h-10 w-full rounded-lg relative bg-transparent mt-1">
            <button
              aria-label="Reduce quantity"
              title="Reduce quantity"
              data-action="decrement"
              data-testid="decrement"
              className="bg-gray-300 text-gray-600 hover:text-gray-700 hover:bg-gray-400 h-full w-20 rounded-l cursor-pointer outline-none"
              onClick={() => decreaseQty(cartItem)}
            >
              <span className="m-auto text-2xl font-thin">−</span>
            </button>
            <input
              type="number"
              className="outline-none focus:outline-none text-center w-full bg-gray-300 font-semibold text-md hover:text-black focus:text-black md:text-base cursor-default flex items-center text-gray-900"
              name="custom-input-number"
              value={cartItem.quantity}
              readOnly
              aria-label={`Quantity: ${cartItem.quantity}`}
              title="Item quantity"
            />
            <button
              aria-label="Increase quantity"
              title={
                canIncreaseQuantity
                  ? 'Increase quantity'
                  : 'Maximum stock reached'
              }
              data-action="increment"
              className={`bg-gray-300 text-gray-600 hover:text-gray-700 hover:bg-gray-400 h-full w-20 rounded-r cursor-pointer ${!canIncreaseQuantity ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              aria-label={`Total: $${cartItem.subtotal.toFixed(2)}`}
              title="Total price for this item"
            >
              ${cartItem.subtotal.toFixed(2)}
            </p>
            <small className="text-gray-800" data-testid="unit price per item">
              ${cartItem.price.toFixed(2)} / per item
            </small>
          </div>
        </div>
        <div className="flex-auto">
          <div className="float-right">
            <button
              className="px-4 py-2 inline-block text-red-600 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-gray-100 cursor-pointer"
              onClick={() => deleteItemFromCart(cartItem.id)}
              aria-label={`Remove ${cartItem.productName} from cart`}
              title="Remove from cart"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <hr className="my-4" />
    </div>
  );
};

export default ItemCart;
