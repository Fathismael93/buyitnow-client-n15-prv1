import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import Order from '@/backend/models/order';
import User from '@/backend/models/user';
import Product from '@/backend/models/product';
import Cart from '@/backend/models/cart';
// eslint-disable-next-line no-unused-vars
import Category from '@/backend/models/category';
import { appCache } from '@/utils/cache';
import logger from '@/utils/logger';

export async function POST(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    // Connecter à la base de données avec timeout
    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      logger.error('Database connection failed for cart request', {
        user: req.user?.email,
      });

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

    // GETTING ORDER DATA FROM THE REQUEST BODY
    const orderData = await req.json();

    orderData.user = user?._id;

    console.log('orderData', orderData);

    let productsIdsQuantities = [];

    // GETTING THE IDs AND THE QUANTITES OF THE PRODUCTS ORDERED BY USER FROM ORDERITEMS IN ORDERDATA
    if (Array.isArray(orderData?.orderItems) && orderData?.orderItems[0]) {
      console.log('Getting products ids and quantities');
      const orderItems = orderData?.orderItems;

      for (let index = 0; index < orderItems?.length; index++) {
        const element = orderItems[index];
        productsIdsQuantities.push({
          id: element.product,
          quantity: element.quantity,
          cartId: element.cartId,
        });

        delete orderItems[index].cartId;
        delete orderItems[index].category;
      }
    }

    let updatedProductsReturned = [];
    let inavailableStockProducts = [];

    // CHECKING IF THE PRODUCTS ORDERED BY USER ARE STILL IN STOCK
    for (let index = 0; index < productsIdsQuantities?.length; index++) {
      // GETTING THE PRODUCT ORDERED BY USER
      console.log('Getting product');
      const element = productsIdsQuantities[index];
      const itemInOrder = orderData?.orderItems[index];
      const product = await Product.findById(element.id).populate(
        'category',
        'categoryName',
      );

      itemInOrder.category = product?.category.categoryName;

      // CHECKING IF THE QUANTITY ASKED BY USER IS LESS THAN PRODUCT STOCK
      const isProductLeft = product.stock >= element.quantity;

      // IF PRODUCT STOCK IS MORE THAN QUANTITY IN CART...
      if (isProductLeft) {
        // ...THEN UPDATE THE PRODUCT STOCK
        console.log('Updating product stock');
        const newStock = product.stock - element.quantity;

        const productUpdated = await Product.findByIdAndUpdate(product._id, {
          stock: newStock,
        });

        // ADDING THE PRODUCT TO THE UPDATED PRODUCTS ARRAY
        updatedProductsReturned.push(productUpdated);
      } else {
        // ...ELSE ADD THE PRODUCT TO THE INAVAILABLE STOCK PRODUCTS ARRAY
        const rejectedProduct = {
          id: product._id,
          name: product.name,
          image: product.images[0].url,
          stock: product.stock,
          quantity: element.quantity,
        };

        inavailableStockProducts.push(rejectedProduct);
      }
    }

    // CHECKING IF THE OPERATION IS SUCCESSFUL WITH EVERY PRODUCT ORDERED BY USER BY COMPARING
    // THE LENGTH OF THE PRODUCTS ORDERED BY USER AND THE LENGTH OF THE UPDATED PRODUCTS
    const difference =
      productsIdsQuantities.length - updatedProductsReturned.length;

    // IF THE DIFFERENCE IS 0, THEN THE OPERATION IS SUCCESSFUL
    // AND WE CAN CREATE THE ORDER
    if (difference === 0) {
      console.log('Deleting cart items');
      for (let index = 0; index < productsIdsQuantities.length; index++) {
        const element = productsIdsQuantities[index];
        await Cart.findByIdAndDelete(element.cartId);
      }

      console.log('Creating order');
      await Order.create(orderData)
        .then((result) => {
          console.log('Order created', result);
        })
        .catch((err) => {
          console.log('Error creating order', err);
        });

      // Après la création réussie, invalider le cache des produits
      // appCache.products.invalidatePattern(/^products:/);

      // return NextResponse.json(
      //   { success: true, id: order?._id },
      //   { status: 201 },
      // );
    } else {
      return NextResponse.json({
        success: false,
        message:
          'Some product where inavailable when we started the payment operation so we stopped everything!',
        data: { inavailableStockProducts },
      });
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
