import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';

export async function PUT(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    dbConnect();

    const user = await User.findOne({ email: req.user.email }).select(
      '+password',
    );

    const body = await req.json();

    const currentPassword = body.currentPassword;

    const isPasswordMatched = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordMatched) {
      return NextResponse.json(
        {
          success: false,
          message: 'Old password is incorrect',
        },
        { status: 400 },
      );
    }

    const newPassword = body.newPassword;

    user.password = newPassword;
    await user.save();

    return NextResponse.json(
      {
        success: true,
        message: 'Password updated',
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
