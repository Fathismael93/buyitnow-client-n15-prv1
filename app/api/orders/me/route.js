import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import { NextResponse } from 'next/server';
import Order from '@/backend/models/order';
import APIFilters from '@/backend/utils/APIFilters';
import User from '@/backend/models/user';
import DeliveryPrice from '@/backend/models/deliveryPrice';

export async function GET(req) {
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

    const resPerPage = 2;
    const ordersCount = await Order.countDocuments({ user: user._id });

    const apiFilters = new APIFilters(
      Order.find(),
      req?.nextUrl?.searchParams,
    ).pagination(resPerPage);

    const orders = await apiFilters.query
      .find({ user: user._id })
      .populate('shippingInfo user')
      .sort({ createdAt: -1 });

    const result = ordersCount / resPerPage;
    const totalPages = Number.isInteger(result) ? result : Math.ceil(result);

    const deliveryPrice = await DeliveryPrice.find();

    return NextResponse.json(
      {
        success: true,
        data: {
          deliveryPrice,
          totalPages,
          orders,
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
