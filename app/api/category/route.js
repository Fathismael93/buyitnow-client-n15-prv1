import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { rateLimit } from '@/utils/rateLimit';

export async function GET(req) {
  try {
    // Rate limiting
    const limiter = rateLimit({
      interval: 60 * 1000, // 1 minute
      uniqueTokenPerInterval: 500,
    });

    // Appliquer le rate limiting basé sur l'IP
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    await limiter.check(req, 20, ip); // 20 requêtes max par minute par IP

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

    const categories = await Category.find()
      .select('categoryName')
      .sort({ categoryName: 1 });

    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
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
