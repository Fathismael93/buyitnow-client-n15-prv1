import { NextResponse } from 'next/server';

export default (err, _req, res) => {
  let error = { ...err };

  error.statusCode = err.statusCode || 500;
  error.message = err.message || 'Internal Server Error';

  if (err.name == 'ValidationError') {
    const message = Object.values(err.errors).map((value) => value.message);
    error = NextResponse.error(message, 400);
  }

  if (err.code == 11000) {
    const message = `Duplicate ${Object.keys(err.keyValue)} entered`;
    error = NextResponse.error(message, 400);
  }

  return res.status(error.statusCode).json({
    success: false,
    error,
    message: error.message,
    stack: error.stack,
  });
};
