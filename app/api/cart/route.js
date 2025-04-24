import { NextResponse } from 'next/server';

import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import Cart from '@/backend/models/cart';
import Product from '@/backend/models/product';
import { DECREASE, INCREASE } from '@/helpers/constants';
import { appCache } from '@/utils/cache';

export async function GET(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 500 },
      );
    }

    const user = await User.findOne({ email: req.user.email }).select('_id');

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    // 3. Requête MongoDB optimisée - Spécifier uniquement les champs nécessaires
    let cartItems = await Cart.find({ user: user._id })
      .populate('product', 'name price stock imageUrl') // Uniquement les champs nécessaires
      .lean(); // Retourne des objets JavaScript simples pour une meilleure performance

    // 1 & 5. Remplacement de la boucle inefficace par une opération en bloc
    const bulkOps = [];
    const itemsToUpdate = cartItems.filter(
      (item) => item.quantity > item.product.stock,
    );

    // Préparer les opérations de mise à jour en masse
    itemsToUpdate.forEach((item) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { quantity: item.product.stock } },
        },
      });
    });

    // Exécuter les mises à jour en bloc si nécessaire
    if (bulkOps.length > 0) {
      await Cart.bulkWrite(bulkOps);

      // Récupérer les données mises à jour en une seule requête
      cartItems = await Cart.find({ user: user._id })
        .populate('product', 'name price stock imageUrl')
        .lean();
    }

    // 2. Éviter la double assignation confuse de la variable cart
    // La variable cartItems est maintenant utilisée de manière cohérente

    const cartCount = cartItems.length;

    // 6. Contrôle des données retournées - Transformer les données pour n'inclure que l'essentiel
    const formattedCart = cartItems.map((item) => ({
      id: item._id,
      productId: item.product._id,
      productName: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
      stock: item.product.stock,
      subtotal: item.quantity * item.product.price,
      imageUrl: item.product.imageUrl,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          cartCount,
          cart: formattedCart,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    // 4. Gestion d'erreur améliorée - Logger l'erreur complète mais ne pas l'exposer
    console.error('Cart GET error:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        errorId: Date.now().toString(), // ID unique pour retrouver l'erreur dans les logs
      },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 500 },
      );
    }

    const user = await User.findOne({ email: req.user.email }).select('_id');

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    const body = await req.json();

    const product = await Product.findById(body.productId);

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product not found',
        },
        { status: 404 },
      );
    }

    let quantity = 1;

    // IF QUANTITY ASKED BY THE USER IS MORE THEN THE PRODUCT'STOCK...

    if (quantity > product.stock) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product inavailable',
        },
        { status: 404 },
      );
    }

    const cart = {
      product: product._id,
      user: user._id,
      quantity,
    };

    const cartAdded = await Cart.create(cart);

    // Après la création réussie, invalider le cache des produits
    appCache.products.invalidatePattern(/^products:/);

    return NextResponse.json(
      {
        success: true,
        data: {
          cartAdded,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        error: error,
      },
      { status: 500 },
    );
  }
}

export async function PUT(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 500 },
      );
    }

    const user = await User.findOne({ email: req.user.email });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    const body = await req.json();

    const productId = body.product.product._id;
    const product = await Product.findById(productId);

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product not found',
        },
        { status: 404 },
      );
    }

    // IF THE USER WANT TO INCREASE THE QUANTITY OF A PRODUCT IN THE CART THEN THE VALUE WILL BE INCREASE

    if (body.value === INCREASE) {
      const neededQuantity = body.product.quantity + 1;
      if (neededQuantity > product.stock) {
        return NextResponse.json(
          {
            success: false,
            message: 'Inavailable quantity',
          },
          { status: 404 },
        );
      }

      const updatedCart = await Cart.findByIdAndUpdate(body.product._id, {
        quantity: neededQuantity,
      });

      if (updatedCart) {
        // Après la création réussie, invalider le cache des produits
        appCache.products.invalidatePattern(/^products:/);

        return NextResponse.json(
          {
            success: true,
            message: 'Cart updated',
          },
          { status: 200 },
        );
      }
    }

    // IF THE USER WANT TO DECREASE THE QUANTITY OF A PRODUCT IN THE CART THEN THE VALUE WILL BE DECREASE

    if (body.value === DECREASE) {
      const neededQuantity = body.product.quantity - 1;
      const updatedCart = await Cart.findByIdAndUpdate(body.product._id, {
        quantity: neededQuantity,
      });

      if (updatedCart) {
        // Après la création réussie, invalider le cache des produits
        appCache.products.invalidatePattern(/^products:/);

        return NextResponse.json(
          {
            success: true,
            message: 'Cart updated',
          },
          { status: 200 },
        );
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        error: error,
      },
      { status: 500 },
    );
  }
}
