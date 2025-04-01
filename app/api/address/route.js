import Address from '@/backend/models/address';
import User from '@/backend/models/user';
import PaymentType from '@/backend/models/paymentType';
import DeliveryPrice from '@/backend/models/deliveryPrice';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    dbConnect();

    const user = await User.findOne({ email: req?.user?.email }).select('_id');

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    const addresses = await Address.find({ user: user?._id });

    if (addresses) {
      const paymentTypes = await PaymentType.find();
      const deliveryPrice = await DeliveryPrice.find();

      return NextResponse.json(
        {
          success: true,
          data: {
            addresses,
            paymentTypes,
            deliveryPrice,
          },
        },
        { status: 200 },
      );
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

    const newAddress = await req.json();

    newAddress.user = user._id;

    const address = await Address.create(newAddress);

    return NextResponse.json(
      {
        success: true,
        data: {
          address,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error,
      },
      { status: 500 },
    );
  }
}
