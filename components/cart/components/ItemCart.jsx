// import Link from 'next/link';
// import Image from 'next/image';
// import { memo } from 'react';

// const ItemCart = memo(function ItemCart({
//   cartItem,
//   deleteItemFromCart,
//   decreaseQty,
//   increaseQty,
// }) {
//   if (!cartItem) return null;

//   // Extraction et validation des propriétés avec valeurs par défaut
//   const {
//     id,
//     productId,
//     productName = 'Product',
//     imageUrl,
//     stock = 0,
//     quantity = 0,
//     price = 0,
//     subtotal = 0,
//   } = cartItem;

//   // Gestion d'erreur d'image avec image par défaut
//   const handleImageError = (e) => {
//     e.target.src = '/images/default_product.png';
//     e.target.onerror = null; // Éviter les boucles de rechargement
//   };

//   // Vérification que la quantité ne dépasse pas le stock
//   const canIncreaseQuantity = quantity < stock;
//   const canDecreaseQuantity = quantity > 1;

//   // Formater le prix avec 2 décimales de manière sécurisée
//   const formatPrice = (value) => {
//     const numValue = parseFloat(value);
//     return isNaN(numValue) ? '0.00' : numValue.toFixed(2);
//   };

//   // Déterminer la classe de couleur pour le stock
//   const getStockColorClass = () => {
//     if (stock === 0) return 'text-danger font-medium';
//     if (stock < 5) return 'text-danger-dark font-medium';
//     if (stock < 10) return 'text-yellow-600 font-medium';
//     return 'text-success font-medium';
//   };

//   return (
//     <div
//       className="cart-item p-4 lg:p-5 hover:bg-secondary-light transition-colors duration-200"
//       data-testid={`cart-item-${id}`}
//     >
//       <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
//         {/* Section image et info du produit */}
//         <div className="w-full md:w-2/5 xl:w-2/4">
//           <div className="flex items-start">
//             <div className="flex-shrink-0">
//               <div className="w-16 h-16 rounded-md border border-gray-200 overflow-hidden relative bg-white shadow-sm">
//                 <Image
//                   src={imageUrl || '/images/default_product.png'}
//                   alt={productName}
//                   title={productName}
//                   width={64}
//                   height={64}
//                   className="object-cover w-full h-full"
//                   onError={handleImageError}
//                   loading="lazy"
//                 />
//               </div>
//             </div>
//             <div className="ml-4">
//               <h3 className="font-medium text-gray-800 mb-1 line-clamp-1">
//                 <Link
//                   href={`/product/${productId}`}
//                   className="hover:text-primary transition-colors duration-200"
//                   aria-label={`View details of ${productName}`}
//                 >
//                   {productName}
//                 </Link>
//               </h3>
//               <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
//                 <span
//                   className="text-gray-600"
//                   aria-label={`${stock} items in stock`}
//                 >
//                   Stock: <span className={getStockColorClass()}>{stock}</span>
//                 </span>
//                 <span className="text-gray-600 md:hidden">
//                   Price:{' '}
//                   <span className="font-medium">${formatPrice(price)}</span>
//                 </span>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Contrôles de quantité */}
//         <div className="w-32 sm:w-36">
//           <div className="flex h-10 rounded-md relative bg-white border border-gray-200 shadow-sm overflow-hidden">
//             <button
//               type="button"
//               aria-label={
//                 canDecreaseQuantity
//                   ? 'Decrease quantity'
//                   : 'Minimum quantity reached'
//               }
//               title={
//                 canDecreaseQuantity
//                   ? 'Decrease quantity'
//                   : 'Minimum quantity reached'
//               }
//               className={`flex-1 flex items-center justify-center text-gray-700 ${
//                 canDecreaseQuantity
//                   ? 'bg-blue-400'
//                   : 'opacity-50 cursor-not-allowed bg-gray-50'
//               }`}
//               onClick={() => canDecreaseQuantity && decreaseQty(cartItem)}
//               disabled={!canDecreaseQuantity}
//               data-testid="decrement"
//             >
//               <span className="text-xl">−</span>
//             </button>
//             <input
//               type="text"
//               className="outline-none focus:outline-none text-center w-full bg-transparent font-medium text-gray-800"
//               name="quantity"
//               value={quantity}
//               readOnly
//               aria-label={`Quantity: ${quantity}`}
//             />
//             <button
//               type="button"
//               aria-label={
//                 canIncreaseQuantity
//                   ? 'Increase quantity'
//                   : 'Maximum stock reached'
//               }
//               title={
//                 canIncreaseQuantity
//                   ? 'Increase quantity'
//                   : 'Maximum stock reached'
//               }
//               className={`flex-1 flex items-center justify-center text-gray-700 ${
//                 canIncreaseQuantity
//                   ? 'bg-blue-400'
//                   : 'opacity-50 cursor-not-allowed bg-gray-50'
//               }`}
//               onClick={() => canIncreaseQuantity && increaseQty(cartItem)}
//               disabled={!canIncreaseQuantity}
//               data-testid="increment"
//             >
//               <span className="text-xl">+</span>
//             </button>
//           </div>
//         </div>

//         {/* Prix - visible uniquement sur desktop */}
//         <div className="w-28 hidden md:block">
//           <div>
//             <p
//               className="font-semibold text-gray-800"
//               aria-label={`Total: $${formatPrice(subtotal)}`}
//             >
//               ${formatPrice(subtotal)}
//             </p>
//             <p className="text-sm text-gray-500">
//               ${formatPrice(price)} / each
//             </p>
//           </div>
//         </div>

//         {/* Prix - visible uniquement sur mobile */}
//         <div className="w-full sm:w-auto md:hidden">
//           <p
//             className="font-semibold text-gray-800"
//             aria-label={`Total: $${formatPrice(subtotal)}`}
//           >
//             Total: ${formatPrice(subtotal)}
//           </p>
//         </div>

//         {/* Actions */}
//         <div className="flex-auto flex justify-end">
//           <button
//             type="button"
//             className="px-3 py-1.5 text-sm bg-red-300 border border-danger-light rounded-md hover:bg-danger-light hover:text-danger-dark transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 shadow-sm"
//             onClick={() => deleteItemFromCart(id)}
//             aria-label={`Remove ${productName} from cart`}
//             title="Remove from cart"
//             data-testid="remove-item"
//           >
//             Remove
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// });

// // Définir displayName pour aider au débuggage
// ItemCart.displayName = 'ItemCart';

// export default ItemCart;

import { memo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/helpers/helpers';

const ItemCart = memo(
  ({
    cartItem,
    deleteItemFromCart,
    decreaseQty,
    increaseQty,
    deleteInProgress,
  }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isImageError, setIsImageError] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Gestion optimisée de la suppression
    const handleDelete = async () => {
      if (deleteInProgress) return;

      setIsDeleting(true);
      await deleteItemFromCart(cartItem._id);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    };

    // Source de l'image avec fallback
    const imageSource =
      isImageError || !cartItem?.imageUrl
        ? '/images/default_product.png'
        : cartItem?.imageUrl;

    console.log('CartITEM', cartItem);

    // Calculs pour l'affichage
    const totalPrice = cartItem?.subTotal;
    const isStockLow = cartItem?.stock <= 5 && cartItem?.stock > 0;
    const isOutOfStock = cartItem?.stock === 0;

    return (
      <div className="group relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-4 transition-all duration-200 hover:bg-gray-50 rounded-lg p-2">
          <div className="w-full sm:w-2/5 flex">
            <div className="flex-shrink-0">
              <Link
                href={`/product/${cartItem?.productId}`}
                className="block relative h-24 w-24 rounded border overflow-hidden transition-shadow hover:shadow-md"
              >
                <Image
                  src={imageSource}
                  alt={cartItem?.productName || 'Produit'}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 96px, 96px"
                  onError={() => setIsImageError(true)}
                  priority={false}
                />
              </Link>
            </div>

            <div className="ml-4 flex flex-col">
              <Link
                href={`/product/${cartItem?.productId}`}
                className="text-gray-800 font-semibold text-sm sm:text-base hover:text-blue-600 line-clamp-2 transition-colors"
              >
                {cartItem?.productName}
              </Link>

              <div className="flex items-center mt-1">
                {isOutOfStock ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                    Rupture de stock
                  </span>
                ) : isStockLow ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                    Stock limité: {cartItem?.stock}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                    En stock
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <div className="inline-flex items-center h-10 rounded-lg border border-gray-200 bg-gray-50">
              <button
                type="button"
                className="w-10 h-full flex items-center justify-center rounded-l-lg text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => decreaseQty(cartItem)}
                disabled={cartItem.quantity <= 1 || isOutOfStock}
                aria-label="Diminuer la quantité"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M20 12H4"
                  />
                </svg>
              </button>

              <input
                type="text"
                className="h-full w-12 border-transparent text-center text-sm font-medium text-gray-900 focus:ring-0 focus:outline-none bg-transparent"
                value={cartItem?.quantity}
                readOnly
                aria-label="Quantité"
              />

              <button
                type="button"
                className="w-10 h-full flex items-center justify-center rounded-r-lg text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => increaseQty(cartItem)}
                disabled={cartItem.quantity >= cartItem?.stock || isOutOfStock}
                aria-label="Augmenter la quantité"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end ml-auto">
            <div className="text-blue-600 font-medium text-base sm:text-lg">
              {formatPrice(totalPrice)}
            </div>
            <div className="text-gray-500 text-sm">
              {formatPrice(cartItem?.price)} l&apos;unité
            </div>

            <div className="mt-3 relative">
              {showDeleteConfirm ? (
                <div className="flex items-center space-x-2 transition-all duration-200 ease-in-out">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white py-1 px-2 rounded transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? 'Suppression...' : 'Confirmer'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-2 rounded transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="text-xs text-red-600 hover:text-red-800 transition-colors flex items-center disabled:opacity-50 group-hover:underline"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 my-2"></div>
      </div>
    );
  },
);

ItemCart.displayName = 'ItemCart';
export default ItemCart;
