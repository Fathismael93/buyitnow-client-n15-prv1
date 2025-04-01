import { NextResponse } from 'next/server';
import User from '@/backend/models/user';

export async function POST(req) {
  try {
    const { name, phone, email, password } = await req.json();
    const user = await User.create({
      name,
      phone,
      email,
      password,
    });

    return NextResponse.json(
      {
        success: true,
        data: { user },
      },
      { status: 201 },
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
