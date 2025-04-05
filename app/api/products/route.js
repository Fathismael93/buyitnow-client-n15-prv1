/* eslint-disable no-unused-vars */
import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Product from '@/backend/models/product';
import Category from '@/backend/models/category';
import APIFilters from '@/backend/utils/APIFilters';
import { categorySchema, searchSchema } from '@/helpers/schemas';

export async function GET(req) {
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

    // Search by product name validation with yup
    if (req?.nextUrl?.searchParams?.get('keyword')) {
      const keyword = req?.nextUrl?.searchParams?.get('keyword');

      try {
        const result = await searchSchema.validate(
          { keyword },
          { abortEarly: false },
        );

        if (!result?.keyword) {
          return NextResponse.json(
            {
              success: false,
              message: "Keyword doesn't match yup validation requirements",
            },
            { status: 500 },
          );
        }
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: 'Error encountered during yup validation process',
            error: error,
          },
          { status: 500 },
        );
      }
    }

    // Filter by product category validation with yup
    if (req?.nextUrl?.searchParams?.get('category')) {
      const value = req?.nextUrl?.searchParams?.get('category');

      try {
        const result = await categorySchema.validate(
          { value },
          { abortEarly: false },
        );

        if (!result?.value) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Category value doesn't match yup validation requirements",
            },
            { status: 500 },
          );
        }
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: 'Error encountered during yup validation process',
            error: error,
          },
          { status: 500 },
        );
      }
    }

    const DEFAULT_PER_PAGE = process.env.DEFAULT_PRODUCTS_PER_PAGE || 2;
    const MAX_PER_PAGE = process.env.MAX_PRODUCTS_PER_PAGE || 5;

    const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

    const apiFilters = new APIFilters(
      Product.find()
        .select('name description stock price images')
        .slice('images', 1),
      req.nextUrl.searchParams,
    )
      .search()
      .filter();

    let products = await apiFilters.query.populate('category', 'categoryName');
    const filteredProductsCount = products.length;

    apiFilters.pagination(resPerPage);
    products = await apiFilters.query
      .populate('category', 'categoryName')
      .clone();

    const result = filteredProductsCount / resPerPage;
    const totalPages = Number.isInteger(result) ? result : Math.ceil(result);

    return NextResponse.json(
      {
        success: true,
        data: {
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
