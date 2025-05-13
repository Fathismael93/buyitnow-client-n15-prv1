'use client';

import { useRouter } from 'next/navigation';
import { createContext, useState } from 'react';

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(false);
  const [secret, setSecret] = useState(null);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [shippingInfo, setShippinInfo] = useState(null);
  const [shippingStatus, setShippingStatus] = useState(true);
  const [deliveryPrice, setDeliveryPrice] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState(null);

  const router = useRouter();

  const addOrder = async (orderInfo) => {
    // Identifiant unique pour tracer cette transaction
    const transactionId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // Réinitialiser les états avant de commencer
      setError(null);
      setUpdated(true);
      setLowStockProducts(null);

      // Validation des données côté client avant envoi
      if (!orderInfo || typeof orderInfo !== 'object') {
        setError('Données de commande invalides');
        setUpdated(false);
        return;
      }

      // Vérification des champs obligatoires
      const requiredFields = ['orderItems', 'paymentInfo', 'totalAmount'];
      const missingFields = requiredFields.filter((field) => !orderInfo[field]);

      if (missingFields.length > 0) {
        setError(`Informations manquantes: ${missingFields.join(', ')}`);
        setUpdated(false);
        return;
      }

      // Valider que des articles sont présents dans la commande
      if (
        !Array.isArray(orderInfo.orderItems) ||
        orderInfo.orderItems.length === 0
      ) {
        setError('Votre panier est vide');
        setUpdated(false);
        return;
      }

      // Valider le montant total
      if (
        isNaN(parseFloat(orderInfo.totalAmount)) ||
        parseFloat(orderInfo.totalAmount) <= 0
      ) {
        setError('Montant total invalide');
        setUpdated(false);
        return;
      }

      // Valider les informations de paiement
      if (!orderInfo.paymentInfo || typeof orderInfo.paymentInfo !== 'object') {
        setError('Informations de paiement invalides');
        setUpdated(false);
        return;
      }

      const requiredPaymentFields = [
        'amountPaid',
        'typePayment',
        'paymentAccountNumber',
        'paymentAccountName',
      ];
      const missingPaymentFields = requiredPaymentFields.filter(
        (field) => !orderInfo.paymentInfo[field],
      );

      if (missingPaymentFields.length > 0) {
        setError(
          `Informations de paiement incomplètes: ${missingPaymentFields.join(', ')}`,
        );
        setUpdated(false);
        return;
      }

      // Information de débogage en développement uniquement
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Order ${transactionId}] Envoi de la commande...`, {
          itemCount: orderInfo.orderItems.length,
          totalAmount: orderInfo.totalAmount,
        });
      }

      // Créer un contrôleur d'abandon pour gérer les timeouts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'X-Transaction-ID': transactionId,
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/orders/webhook`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...orderInfo,
              _transactionId: transactionId, // Inclure l'ID de transaction dans le corps
            }),
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour l'authentification
          },
        );

        // Nettoyer le timeout
        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError(
            `Erreur lors du traitement de la réponse du serveur: ${jsonError.message}`,
          );

          // Journaliser l'erreur
          if (process.env.NODE_ENV === 'development') {
            console.error(
              `[Order ${transactionId}] Erreur de parsing JSON:`,
              jsonError,
            );
          }

          setUpdated(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          setUpdated(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          // Traitement unifié des erreurs HTTP selon le code de statut
          switch (res.status) {
            case 400:
              // Erreur de validation ou requête incorrecte
              if (
                data.message &&
                data.message.includes('Missing required fields')
              ) {
                setError(`Données de commande incomplètes: ${data.message}`);
              } else if (
                data.message &&
                data.message.includes('Missing payment information')
              ) {
                setError(
                  `Informations de paiement incomplètes: ${data.message}`,
                );
              } else if (
                data.message &&
                data.message.includes('Invalid order total amount')
              ) {
                setError('Montant total invalide');
              } else if (
                data.message &&
                data.message.includes('Invalid order data')
              ) {
                setError('Format de commande invalide');
              } else if (
                data.message &&
                data.message.includes('No valid products')
              ) {
                setError('Aucun produit valide dans la commande');
              } else if (
                data.message &&
                data.message.includes('Invalid product quantities')
              ) {
                setError('Quantités de produits invalides');
              } else {
                setError(data.message || 'Données de commande invalides');
              }
              break;

            case 401:
              // Non authentifié
              setError('Session expirée. Veuillez vous reconnecter.');
              setTimeout(() => router.push('/login'), 2000);
              break;

            case 403:
              // Accès interdit
              setError(
                "Vous n'avez pas l'autorisation d'effectuer cette action",
              );
              break;

            case 404:
              // Utilisateur non trouvé
              setError('Utilisateur non trouvé');
              setTimeout(() => router.push('/login'), 2000);
              break;

            case 409:
              // Conflit (produits indisponibles)
              if (data.data && data.data.inavailableStockProducts) {
                setLowStockProducts(data.data.inavailableStockProducts);
                router.push('/error');
              } else {
                setError('Certains produits ne sont plus disponibles');
              }
              break;

            case 422:
              // Erreur de validation
              if (data.data && data.data.inavailableStockProducts) {
                setLowStockProducts(data.data.inavailableStockProducts);
                router.push('/error');
              } else {
                setError(data.message || 'Erreur de validation des données');
              }
              break;

            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );
              break;

            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors du traitement de la commande (${res.status})`,
              );
          }

          setUpdated(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Cas de succès
            if (data.id) {
              // Stocker l'ID de commande de façon sécurisée
              setSecret(data.id);

              // Effacer les erreurs
              setError(null);

              // Log en développement
              if (process.env.NODE_ENV === 'development') {
                console.log(
                  `[Order ${transactionId}] Commande créée avec succès:`,
                  {
                    orderId: data.id,
                    orderNumber: data.orderNumber,
                  },
                );
              }

              // Rediriger vers la page de confirmation
              router.push('/confirmation');
            } else {
              // Réponse de succès sans ID (cas anormal)
              setError(
                'Erreur: impossible de récupérer les détails de la commande',
              );
              console.error(
                `[Order ${transactionId}] Réponse succès sans ID:`,
                data,
              );
            }
          } else if (data.success === false) {
            // Cas où success est explicitement false

            // Gérer le cas des produits indisponibles
            if (data.data && data.data.inavailableStockProducts) {
              setLowStockProducts(data.data.inavailableStockProducts);
              router.push('/error');
              return;
            }

            // Autres cas d'erreur
            setError(data.message || 'Échec du traitement de la commande');

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              setError(
                `${data.message || 'Échec du traitement de la commande'}: ${data.errors.join(', ')}`,
              );
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError('Réponse inattendue du serveur');
            console.error(`[Order ${transactionId}] Réponse inattendue:`, data);
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            'La requête a pris trop de temps. Veuillez vérifier votre connexion et réessayer.',
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de l'envoi de la commande: ${fetchError.message}`,
          );
        }

        // Journalisation détaillée en développement
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Order ${transactionId}] Erreur fetch:`, {
            type: isTimeout ? 'timeout' : isNetworkError ? 'network' : 'other',
            message: fetchError.message,
            stack: fetchError.stack,
          });
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        'Une erreur inattendue est survenue lors du traitement de la commande',
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error(`[Order ${transactionId}] Erreur globale:`, {
          message: error.message,
          stack: error.stack,
        });
      }
    } finally {
      // Toujours réinitialiser l'état de mise à jour
      setUpdated(false);
    }
  };

  const clearErrors = () => {
    setError(null);
  };

  return (
    <OrderContext.Provider
      value={{
        error,
        updated,
        secret,
        paymentTypes,
        addresses,
        shippingInfo,
        shippingStatus,
        deliveryPrice,
        lowStockProducts,
        setPaymentTypes,
        setAddresses,
        setShippinInfo,
        setShippingStatus,
        setDeliveryPrice,
        addOrder,
        setUpdated,
        clearErrors,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export default OrderContext;
