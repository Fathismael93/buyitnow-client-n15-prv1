import User from '@/backend/models/user';
import Cart from '@/backend/models/cart';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import { NextResponse } from 'next/server';

export async function DELETE(req, { params }) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    dbConnect();
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

    const { id } = params;
    const deleteCart = await Cart.findByIdAndDelete(id);

    if (deleteCart) {
      return NextResponse.json(
        {
          success: true,
          message: 'Item deleted from cart',
        },
        { status: 200 },
      );
    }
  } catch (error) {
    return NextResponse.error(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        error: error,
      },
      { status: 500 },
    );
  }
}
