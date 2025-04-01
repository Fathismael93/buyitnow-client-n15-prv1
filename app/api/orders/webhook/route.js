import { NextResponse } from 'next/server';
import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import Order from '@/backend/models/order';
import User from '@/backend/models/user';
import Product from '@/backend/models/product';
import Cart from '@/backend/models/cart';
// eslint-disable-next-line no-unused-vars
import Category from '@/backend/models/category';

export async function POST(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    dbConnect();

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

    // GETTING THE IDs AND THE QUANTITES OF THE PRODUCTS ORDERED BY USER
    let productsIdsQuantities = [];

    if (Array.isArray(orderData?.orderItems) && orderData?.orderItems[0]) {
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

    // STARTING THE OPERATION OF ORDER
    let updatedProductsReturned = [];
    let inavailableStockProducts = [];

    for (let index = 0; index < productsIdsQuantities?.length; index++) {
      // GETTING THE PRODUCT ORDERED BY USER
      const element = productsIdsQuantities[index];
      const itemInOrder = orderData?.orderItems[index];
      const product = await Product.findById(element.id).populate('category');

      itemInOrder.category = product?.category.categoryName;

      // CHECKING IF THE QUANTITY ASKED BY USER IS LESS THAN PRODUCT STOCK
      const isProductLeft = product.stock >= element.quantity;

      // IF STOCK IS MORE THAN QUANTITY THAN...
      if (isProductLeft) {
        const newStock = product.stock - element.quantity;

        const productUpdated = await Product.findByIdAndUpdate(product._id, {
          stock: newStock,
        });

        updatedProductsReturned.push(productUpdated);
      } else {
        // ...ELSE
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

    // CHECKING IF THE OPERATION IS SUCCESSFUL WITH EVERY PRODUCT ORDERED BY USER
    const difference =
      productsIdsQuantities.length - updatedProductsReturned.length;

    // IF THE OPERATION IS SUCCESSFUL THEN ADD THE ORDER TO THE DATABASE
    if (difference === 0) {
      for (let index = 0; index < productsIdsQuantities.length; index++) {
        const element = productsIdsQuantities[index];
        await Cart.findByIdAndDelete(element.cartId);
      }

      const order = await Order.create(orderData);

      return NextResponse.json(
        { success: true, id: order?._id },
        { status: 201 },
      );
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
