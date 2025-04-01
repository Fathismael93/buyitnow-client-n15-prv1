/* eslint-disable react/prop-types */
'use client'; // Error boundaries must be Client Components

import React from 'react';

export default function Error({ error, reset }) {
  return (
    <div>
      <h2>
        Something went wrong while finding your cart ! Please try again later.
      </h2>
      <p>{error?.message}</p>
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Try again
      </button>
    </div>
  );
}
