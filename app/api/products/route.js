import dbConnect from '@/backend/config/dbConnect';
import Product from '@/backend/models/product';
import Category from '@/backend/models/category';
import APIFilters from '@/backend/utils/APIFilters';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    dbConnect();
    const resPerPage = 2;

    const apiFilters = new APIFilters(Product.find(), req.nextUrl.searchParams)
      .search()
      .filter();

    let products = await apiFilters.query.populate('category');
    const filteredProductsCount = products.length;

    apiFilters.pagination(resPerPage);
    products = await apiFilters.query.populate('category').clone();

    const result = filteredProductsCount / resPerPage;
    const totalPages = Number.isInteger(result) ? result : Math.ceil(result);

    const categories = await Category.find();

    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
          totalPages,
          products,
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
