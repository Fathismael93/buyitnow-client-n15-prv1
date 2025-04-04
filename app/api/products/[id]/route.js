import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
// eslint-disable-next-line no-unused-vars
import Category from '@/backend/models/category';
import Product from '@/backend/models/product';

export async function GET(req, { params }) {
  try {
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

    const { id } = params;

    const product = await Product.findById(id).populate(
      'category',
      'categoryName',
    );

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product Not found',
        },
        { status: 404 },
      );
    }

    const sameCategoryProducts = await Product.findSimilarProductsLite(
      product?.category,
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          product,
          sameCategoryProducts,
        },
      },
      { status: 200 },
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
