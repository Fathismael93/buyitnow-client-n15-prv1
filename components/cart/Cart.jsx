'use client';

// import { useContext, useEffect, useMemo, useState, useCallback } from 'react';
// import Link from 'next/link';
// import { useRouter } from 'next/navigation';

// import ItemCart from './components/ItemCart';
// import CartContext from '@/context/CartContext';
// import { DECREASE, INCREASE } from '@/helpers/constants';
// import Loading from '@/app/loading';

// const Cart = () => {
//   const {
//     loading,
//     updateCart,
//     deleteItemFromCart,
//     cart,
//     cartCount,
//     cartTotal,
//     setLoading,
//     saveOnCheckout,
//     setCartToState,
//   } = useContext(CartContext);

//   const [error, setError] = useState(null);
//   const [isInitialized, setIsInitialized] = useState(false);
//   const [feedback, setFeedback] = useState(null);

//   const router = useRouter();

//   // Mémoriser le chargement du panier pour éviter des re-renders inutiles
//   const loadCartData = useCallback(async () => {
//     try {
//       setIsInitialized(true);
//       await setCartToState();
//       return true;
//     } catch (err) {
//       console.error('Failed to load cart data:', err);
//       setError('Unable to load your cart. Please try again later.');
//       return false;
//     } finally {
//       setIsInitialized(false);
//     }
//   }, []);

//   // Effectuer le chargement initial des données
//   useEffect(() => {
//     // loadCartData();
//     // Précharger les pages suivantes
//     router.prefetch('/shipping');
//     router.prefetch('/shipping-choice');
//   }, []);

//   // Fonction pour afficher temporairement un feedback
//   const showFeedback = useCallback((message, type = 'success') => {
//     setFeedback({ message, type });
//     setTimeout(() => setFeedback(null), 3000);
//   }, []);

//   // Gestionnaires d'événements optimisés avec feedback
//   const increaseQty = useCallback(
//     async (cartItem) => {
//       if (cartItem.quantity >= cartItem.stock) {
//         showFeedback('Maximum stock quantity reached', 'warning');
//         return;
//       }

//       setLoading(true);
//       try {
//         await updateCart(cartItem, INCREASE);
//         showFeedback('Quantity increased');
//       } catch (err) {
//         console.error('Failed to increase quantity:', err);
//         setError('Unable to update quantity. Please try again.');
//       } finally {
//         setLoading(false);
//       }
//     },
//     [cart],
//   );

//   const decreaseQty = useCallback(
//     async (cartItem) => {
//       console.log('DECREASING QUANTITY', cartItem);
//       if (cartItem.quantity <= 1) {
//         showFeedback('Minimum quantity reached', 'warning');
//         return;
//       }

//       setLoading(true);
//       try {
//         await updateCart(cartItem, DECREASE);
//         showFeedback('Quantity decreased');
//       } catch (err) {
//         console.error('Failed to decrease quantity:', err);
//         setError('Unable to update quantity. Please try again.');
//       } finally {
//         setLoading(false);
//       }
//     },
//     [cart],
//   );

//   const handleDeleteItem = useCallback(async (itemId) => {
//     if (
//       !window.confirm(
//         'Are you sure you want to remove this item from your cart?',
//       )
//     ) {
//       return;
//     }

//     setLoading(true);
//     console.log('Item to delete from cart Id', itemId);
//     try {
//       await deleteItemFromCart(itemId);
//       showFeedback('Item removed from cart');
//     } catch (err) {
//       console.error('Failed to remove item:', err);
//       setError('Unable to remove item. Please try again.');
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   // Calculer les totaux avec useMemo pour éviter des recalculs inutiles
//   const cartSummary = useMemo(() => {
//     if (!cart || cartCount === 0) return { totalUnits: 0, totalAmount: 0 };

//     const totalUnits = cart.reduce((acc, item) => {
//       return (
//         acc + (item && typeof item.quantity === 'number' ? item.quantity : 0)
//       );
//     }, 0);

//     // Utiliser cartTotal depuis le context si disponible, sinon calculer
//     const totalAmount =
//       cartTotal ||
//       parseFloat(
//         cart
//           .reduce((acc, item) => {
//             const itemSubtotal =
//               item?.subtotal || item?.quantity * item?.price || 0;
//             return acc + itemSubtotal;
//           }, 0)
//           .toFixed(2),
//       );

//     return { totalUnits, totalAmount };
//   }, [cart, cartCount, cartTotal]);

//   const checkoutHandler = useCallback(() => {
//     // Valider le panier avant de procéder au checkout
//     if (!cart || cart.length === 0) {
//       setError('Your cart is empty');
//       return;
//     }

//     try {
//       const amount = parseFloat(cartSummary.totalAmount);

//       if (isNaN(amount) || amount <= 0) {
//         throw new Error('Invalid cart total');
//       }

//       const tax = parseFloat((amount * 0.05).toFixed(2));
//       const totalAmount = parseFloat((amount + tax).toFixed(2));

//       const data = {
//         amount,
//         tax,
//         totalAmount,
//       };

//       saveOnCheckout(data);
//       // Le Link va gérer la navigation, mais on peut préparer les données ici
//     } catch (err) {
//       console.error('Checkout error:', err);
//       setError('Unable to proceed to checkout. Please try again.');
//     }
//   }, [cart]);

//   // Afficher un message d'erreur si une erreur s'est produite
//   if (error) {
//     return (
//       <div className="container mx-auto px-4 py-10 text-center">
//         <div
//           className="bg-danger-light p-4 rounded-md mb-4 max-w-md mx-auto shadow-md"
//           role="alert"
//           aria-live="assertive"
//         >
//           <p className="text-danger font-medium">{error}</p>
//         </div>
//         <button
//           onClick={() => {
//             setError(null);
//             loadCartData();
//           }}
//           className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
//         >
//           Try Again
//         </button>
//       </div>
//     );
//   }

//   // Afficher un indicateur de chargement si les données sont en cours de chargement
//   if (loading && !isInitialized) {
//     return <Loading />;
//   }

//   return (
//     <div className="min-h-screen bg-secondary-light">
//       {/* Notification de feedback */}
//       {feedback && (
//         <div
//           className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-md transition-all duration-300 ${
//             feedback.type === 'success'
//               ? 'bg-green-400 text-black'
//               : feedback.type === 'warning'
//                 ? 'bg-yellow-100 text-yellow-800'
//                 : 'bg-red-500 text-black'
//           }`}
//           role="status"
//           aria-live="polite"
//         >
//           {feedback.message}
//         </div>
//       )}

//       {/* En-tête du panier */}
//       <section className="py-5 sm:py-7 bg-blue-100 text-black shadow-md">
//         <div className="container max-w-6xl mx-auto px-4">
//           <h1
//             className="text-2xl md:text-3xl font-semibold mb-1"
//             aria-live="polite"
//           >
//             {cartCount || 0} Item{cartCount !== 1 ? 's' : ''} in Cart
//           </h1>
//           <p className="text-sm md:text-base opacity-90">
//             Review your items and proceed to checkout
//           </p>
//         </div>
//       </section>

//       {cartCount > 0 ? (
//         <section className="py-8 md:py-10">
//           <div className="container max-w-6xl mx-auto px-4">
//             <div className="flex flex-col lg:flex-row gap-6">
//               {/* Contenu principal du panier */}
//               <main className="w-full lg:w-3/4">
//                 <article className="border border-gray-200 bg-white shadow-md rounded-lg mb-5 overflow-hidden">
//                   {/* Bannière de mise à jour */}
//                   {loading && isInitialized && (
//                     <div className="bg-blue-50 bg-opacity-20 text-center p-3 border-b border-primary-light">
//                       <p className="text-blue-400 flex items-center justify-center">
//                         <svg
//                           xmlns="http://www.w3.org/2000/svg"
//                           className="h-5 w-5 inline-block animate-spin mr-2"
//                           viewBox="0 0 24 24"
//                           fill="none"
//                           stroke="currentColor"
//                           strokeWidth="2"
//                         >
//                           <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
//                           <path
//                             d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10"
//                             strokeOpacity="0.75"
//                           />
//                         </svg>
//                         Updating your cart...
//                       </p>
//                     </div>
//                   )}

//                   {/* En-têtes des colonnes sur les plus grands écrans */}
//                   <div className="hidden md:flex bg-secondary p-4 border-b border-gray-200">
//                     <div className="w-full md:w-2/5 xl:w-2/4 font-medium text-gray-700">
//                       Product
//                     </div>
//                     <div className="w-24 font-medium text-gray-700">
//                       Quantity
//                     </div>
//                     <div className="w-28 font-medium text-gray-700">Price</div>
//                     <div className="flex-auto text-right font-medium text-gray-700">
//                       Action
//                     </div>
//                   </div>

//                   {/* Liste des articles */}
//                   <div className="divide-y divide-gray-200">
//                     {cart?.map((cartItem) => (
//                       <ItemCart
//                         key={cartItem.id}
//                         cartItem={cartItem}
//                         deleteItemFromCart={handleDeleteItem}
//                         decreaseQty={decreaseQty}
//                         increaseQty={increaseQty}
//                       />
//                     ))}
//                   </div>
//                 </article>
//               </main>

//               {/* Résumé du panier */}
//               <aside className="w-full lg:w-1/4">
//                 <article className="border border-gray-200 bg-blue-100 shadow-md rounded-lg p-5 sticky top-6">
//                   <h2 className="text-lg font-semibold text-gray-800 mb-4">
//                     Order Summary
//                   </h2>

//                   <ul className="mb-6 divide-y divide-gray-200">
//                     <li
//                       className="flex justify-between py-3 text-gray-600"
//                       aria-label={`Total units: ${cartSummary.totalUnits}`}
//                     >
//                       <span>Total Units:</span>
//                       <span className="text-success font-medium">
//                         {cartSummary.totalUnits}{' '}
//                         {cartSummary.totalUnits !== 1 ? 'items' : 'item'}
//                       </span>
//                     </li>
//                     <li className="flex justify-between py-3 text-gray-600">
//                       <span>Subtotal:</span>
//                       <span className="font-medium">
//                         $
//                         {typeof cartSummary.totalAmount === 'number'
//                           ? cartSummary.totalAmount.toFixed(2)
//                           : cartSummary.totalAmount}
//                       </span>
//                     </li>
//                     <li className="flex justify-between py-3 text-gray-600">
//                       <span>Tax (5%):</span>
//                       <span className="font-medium">
//                         $
//                         {typeof cartSummary.totalAmount === 'number'
//                           ? (cartSummary.totalAmount * 0.05).toFixed(2)
//                           : '0.00'}
//                       </span>
//                     </li>
//                     <li
//                       className="flex justify-between py-3 text-xl font-bold text-gray-800"
//                       aria-label={`Total price: $${typeof cartSummary.totalAmount === 'number' ? (cartSummary.totalAmount * 1.05).toFixed(2) : cartSummary.totalAmount}`}
//                     >
//                       <span>Total:</span>
//                       <span>
//                         $
//                         {typeof cartSummary.totalAmount === 'number'
//                           ? (cartSummary.totalAmount * 1.05).toFixed(2)
//                           : cartSummary.totalAmount}
//                       </span>
//                     </li>
//                   </ul>

//                   <div className="space-y-3">
//                     <Link
//                       className="block w-full px-4 py-3 text-center bg-blue-400 text-white bg-success hover:bg-success-dark rounded-md transition-colors duration-300 font-medium focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-2 shadow-sm"
//                       onClick={checkoutHandler}
//                       aria-label="Proceed to checkout"
//                       href="/shipping-choice"
//                     >
//                       Proceed to Checkout
//                     </Link>

//                     <Link
//                       aria-label="Continue shopping"
//                       href="/"
//                       className="block w-full px-4 py-3 text-center text-blue-500 border border-blue-500 hover:bg-primary-light hover:text-primary-dark rounded-md transition-colors duration-300 font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
//                     >
//                       Continue Shopping
//                     </Link>
//                   </div>
//                 </article>
//               </aside>
//             </div>
//           </div>
//         </section>
//       ) : (
//         <div className="container mx-auto px-4 py-16">
//           <div className="bg-white p-8 shadow-md rounded-lg max-w-md mx-auto text-center">
//             <div className="mb-6 text-gray-400">
//               <svg
//                 xmlns="http://www.w3.org/2000/svg"
//                 className="h-20 w-20 mx-auto"
//                 fill="none"
//                 viewBox="0 0 24 24"
//                 stroke="currentColor"
//               >
//                 <path
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   strokeWidth={1.5}
//                   d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
//                 />
//               </svg>
//             </div>
//             <h2 className="font-bold text-2xl mb-4 text-gray-800">
//               Your Cart is Empty
//             </h2>
//             <p className="text-gray-600 mb-8">
//               Looks like you haven&apos;t added any items to your cart yet.
//             </p>
//             <Link
//               href="/"
//               className="inline-block px-6 py-3 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors duration-300 font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 shadow-sm"
//             >
//               Start Shopping
//             </Link>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default Cart;

import { useContext, useEffect, useState, useRef, memo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import CartContext from '@/context/CartContext';
import Loading from '@/app/loading';
import dynamic from 'next/dynamic';
import { captureException } from '@/monitoring/sentry';

// Chargement dynamique du composant ItemCart
const ItemCart = dynamic(() => import('./components/ItemCart'), {
  loading: () => <CartItemSkeleton />,
  ssr: true,
});

// Composants et hooks extraits pour meilleure organisation
import CartItemSkeleton from './components/CartItemSkeleton';
import EmptyCart from './components/EmptyCart';
import CartSummary from './components/CartSummary';
import useCartOperations from '../../hooks/useCartOperations';

const Cart = () => {
  const { loading, cart, cartCount, setCartToState, cartTotal } =
    useContext(CartContext);

  console.log('Cart items in Cart.jsx', cart);
  console.log('Cart items count in Cart.jsx', cartCount);

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const router = useRouter();

  // Hooks personnalisé pour les opérations de panier
  const {
    deleteInProgress,
    itemBeingRemoved,
    increaseQty,
    decreaseQty,
    handleDeleteItem,
    checkoutHandler,
  } = useCartOperations();

  // Ajoutons un useRef pour suivre si une requête de chargement est en cours
  const isLoadingCart = useRef(false);

  // Précharger la page de livraison
  useEffect(() => {
    router.prefetch('/shipping-choice');

    // Chargement initial du panier - OPTIMISÉ
    const loadCart = async () => {
      // Vérifier si on est déjà en train de charger le panier
      if (isLoadingCart.current) return;

      try {
        // Marquer comme en cours de chargement
        isLoadingCart.current = true;

        await setCartToState();
      } catch (error) {
        console.error('Erreur lors du chargement du panier:', error);
        captureException(error, {
          tags: { component: 'Cart', action: 'initialLoad' },
        });
        toast.error('Impossible de charger votre panier. Veuillez réessayer.');
      } finally {
        // Important: marquer comme terminé même en cas d'erreur
        isLoadingCart.current = false;
        setInitialLoadComplete(true);
      }
    };

    // Ne charger qu'une seule fois au montage du composant
    if (!initialLoadComplete && !isLoadingCart.current) {
      loadCart();
    }
  }, [router, setCartToState, initialLoadComplete]);

  // Afficher un écran de chargement pendant le chargement initial
  if (!initialLoadComplete) {
    return <Loading />;
  }

  return (
    <>
      {/* En-tête du panier */}
      <CartHeader cartCount={cartCount} />

      {/* Contenu du panier */}
      <section className="py-8 md:py-10">
        <div className="container max-w-6xl mx-auto px-4">
          {!loading && cart?.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Liste des articles */}
              <CartItemsList
                cart={cart}
                loading={loading}
                handleDeleteItem={handleDeleteItem}
                decreaseQty={decreaseQty}
                increaseQty={increaseQty}
                deleteInProgress={deleteInProgress}
                itemBeingRemoved={itemBeingRemoved}
              />

              {/* Résumé du panier */}
              {cart?.length > 0 && (
                <CartSummary
                  cartItems={cart}
                  amount={cartTotal}
                  onCheckout={checkoutHandler}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

// Composants extraits pour une meilleure organisation

const CartHeader = memo(({ cartCount }) => (
  <section className="py-5 sm:py-7 bg-gradient-to-r from-blue-50 to-indigo-50">
    <div className="container max-w-6xl mx-auto px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">
          Mon Panier
        </h1>
        <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
          {cartCount || 0} article{cartCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  </section>
));

CartHeader.displayName = 'CartHeader';

const CartItemsList = memo(
  ({
    cart,
    loading,
    handleDeleteItem,
    decreaseQty,
    increaseQty,
    deleteInProgress,
    itemBeingRemoved,
  }) => (
    <main className="md:w-3/4">
      <div className="bg-white shadow rounded-lg mb-5 p-4 lg:p-6 transition-all duration-300 ease-in-out transform translate-y-0 opacity-100">
        {loading && (
          <>
            {[...Array(3)].map((_, index) => (
              <CartItemSkeleton key={index} />
            ))}
          </>
        )}
        {!loading &&
          cart?.map((cartItem) => (
            <div
              key={cartItem._id}
              className={`transition-all duration-300 ease-in-out transform ${
                itemBeingRemoved === cartItem._id
                  ? 'opacity-0 -translate-x-3 h-0 overflow-hidden'
                  : 'opacity-100 translate-x-0'
              }`}
            >
              <ItemCart
                cartItem={cartItem}
                deleteItemFromCart={handleDeleteItem}
                decreaseQty={decreaseQty}
                increaseQty={increaseQty}
                deleteInProgress={deleteInProgress}
              />
            </div>
          ))}
      </div>
    </main>
  ),
);

CartItemsList.displayName = 'CartItemsList';

export default Cart;
