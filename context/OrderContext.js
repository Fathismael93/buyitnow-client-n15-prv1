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
      // Validation des données côté client avant envoi
      if (!orderInfo || typeof orderInfo !== 'object') {
        setError('Données de commande invalides');
        return;
      }

      // Vérification des champs obligatoires
      const requiredFields = ['orderItems', 'paymentInfo', 'totalAmount'];
      const missingFields = requiredFields.filter((field) => !orderInfo[field]);

      if (missingFields.length > 0) {
        setError(`Informations manquantes: ${missingFields.join(', ')}`);
        return;
      }

      // Valider que des articles sont présents dans la commande
      if (
        !Array.isArray(orderInfo.orderItems) ||
        orderInfo.orderItems.length === 0
      ) {
        setError('Votre panier est vide');
        return;
      }

      // Valider le montant total
      if (
        isNaN(parseFloat(orderInfo.totalAmount)) ||
        parseFloat(orderInfo.totalAmount) <= 0
      ) {
        setError('Montant total invalide');
        return;
      }

      // Information de débogage en développement uniquement
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Order ${transactionId}] Envoi de la commande...`);
      }

      // Indicateur d'état de chargement (pourrait être ajouté au contexte)
      setUpdated(true);

      // Créer un contrôleur d'abandon pour gérer les timeouts
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      // Effectuer la requête avec gestion des erreurs
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/webhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Transaction-ID': transactionId,
          },
          body: JSON.stringify({
            ...orderInfo,
            _transactionId: transactionId, // Inclure l'ID de transaction dans le corps
          }),
          signal: controller.signal,
          credentials: 'include', // Inclure les cookies pour l'authentification
        },
      );

      // Nettoyer le timeout
      clearTimeout(timeout);

      // Vérification du statut HTTP
      if (!res.ok) {
        // Extraction des détails d'erreur de la réponse
        const errorData = await res.json().catch(() => ({}));
        const errorMessage =
          errorData.message || `Erreur ${res.status}: ${res.statusText}`;

        // Log de l'erreur
        console.error(`[Order ${transactionId}] Erreur HTTP:`, {
          status: res.status,
          message: errorMessage,
        });

        // Gestion spécifique selon le code d'erreur
        if (res.status === 401 || res.status === 403) {
          setError('Session expirée. Veuillez vous reconnecter.');
          router.push('/login');
          return;
        }

        if (res.status === 400) {
          setError(
            errorMessage ||
              'Données invalides. Veuillez vérifier votre commande.',
          );
          return;
        }

        if (res.status === 422 || res.status === 409) {
          // Produits avec stock insuffisant
          if (errorData?.data?.inavailableStockProducts) {
            setLowStockProducts(errorData.data.inavailableStockProducts);
            router.push('/error');
            return;
          }
        }

        if (res.status === 429) {
          setError(
            'Trop de requêtes. Veuillez réessayer dans quelques instants.',
          );
          return;
        }

        if (res.status >= 500) {
          setError('Erreur serveur. Veuillez réessayer ultérieurement.');
          return;
        }

        // Erreur générique
        setError(errorMessage || 'Erreur lors du traitement de la commande');
        return;
      }

      // Traitement de la réponse en cas de succès
      const data = await res.json();

      // Vérifier si la réponse contient un format attendu
      if (!data || typeof data !== 'object') {
        setError('Réponse invalide du serveur');
        return;
      }

      // Gestion des erreurs métier (quand status HTTP est 200 mais opération échouée)
      if (!data.success) {
        // Si des produits sont indisponibles
        if (data.data && data.data.inavailableStockProducts) {
          setLowStockProducts(data.data.inavailableStockProducts);
          router.push('/error');
          return;
        }

        // Autres erreurs métier
        setError(data.message || 'Erreur lors du traitement de la commande');
        return;
      }

      // Traitement en cas de succès
      if (data.success && data.id) {
        // Stocker l'ID de commande de façon sécurisée
        setSecret(data.id);

        // Effacer les erreurs précédentes
        setError(null);

        // Rediriger vers la page de confirmation
        router.push('/confirmation');
      } else {
        // Cas où la commande est réussie mais sans ID (ne devrait pas arriver)
        console.error(
          `[Order ${transactionId}] Réponse succès sans ID de commande:`,
          data,
        );
        setError(
          'Erreur de traitement: impossible de récupérer les détails de la commande',
        );
      }
    } catch (error) {
      // Gestion des erreurs imprévues
      console.error(`[Order ${transactionId}] Exception non gérée:`, error);

      // Gérer les erreurs de timeout et réseau spécifiquement
      if (error.name === 'AbortError') {
        setError(
          'La requête a pris trop de temps. Veuillez vérifier votre connexion et réessayer.',
        );
      } else if (!navigator.onLine) {
        setError(
          'Vous êtes hors ligne. Veuillez vérifier votre connexion Internet.',
        );
      } else {
        // Analyser le message d'erreur pour des réponses plus pertinentes
        const errorMessage = error?.message || 'Une erreur est survenue';

        if (
          errorMessage.includes('fetch') ||
          errorMessage.includes('network')
        ) {
          setError(
            'Problème de connexion. Veuillez vérifier votre réseau et réessayer.',
          );
        } else if (errorMessage.includes('JSON')) {
          setError('Erreur de traitement de la réponse. Veuillez réessayer.');
        } else {
          setError(
            'Une erreur inattendue est survenue. Veuillez réessayer ultérieurement.',
          );
        }
      }

      // Pour des fins de débogage en développement uniquement
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[Order ${transactionId}] Détails:`, {
          message: error.message,
          stack: error.stack,
          orderInfo: {
            // Uniquement les informations non sensibles pour le débogage
            itemCount: orderInfo?.orderItems?.length || 0,
            hasPaymentInfo: !!orderInfo?.paymentInfo,
            hasShippingInfo: !!orderInfo?.shippingInfo,
          },
        });
      }
    } finally {
      // Réinitialiser l'état de mise à jour
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
