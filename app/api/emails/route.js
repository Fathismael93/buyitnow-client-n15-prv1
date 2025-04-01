import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import { NextResponse } from 'next/server';
import User from '@/backend/models/user';
import nodemailer from 'nodemailer';
import Contact from '@/backend/models/contact';

export async function POST(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    dbConnect();
    // CHECKING IF PASSWORD ENTERED IS THE SAME AS PASSWORD STORED

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

    const body = await req.json();

    const subject = body?.subject;
    const message = body?.message;

    const messageSent = {
      from: user?._id,
      subject,
      message,
    };

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for port 465, false for other ports
      auth: {
        user: process.env.NODEMAILER_EMAIL_ACCOUNT,
        pass: process.env.NODEMAILER_PASSWORD_ACCOUNT,
      },
    });

    await transporter
      .sendMail({
        from: user?.email,
        to: process.env.NODEMAILER_EMAIL_ACCOUNT,
        subject: subject,
        html: message,
      })
      .then(async () => await Contact.create(messageSent));

    return NextResponse.json(
      {
        success: true,
        message: 'Email sent',
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
