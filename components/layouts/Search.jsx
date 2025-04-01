/* eslint-disable react/prop-types */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { searchSchema } from '@/helpers/schemas';

const Search = ({ setLoading }) => {
  const [keyword, setKeyword] = useState('');

  /* ***********  REAL CODE   *********** */

  const router = useRouter();

  const submitHandler = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await searchSchema.validate(
        { keyword },
        { abortEarly: false },
      );

      if (result.keyword) {
        router.push(`/?keyword=${keyword}`);
      } else {
        router.push('/');
      }
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <form
      className="flex flex-nowrap items-center w-full order-last md:order-none mt-5 md:mt-0 md:w-1/3 lg:w-2/4"
      onSubmit={submitHandler}
    >
      <input
        className="grow appearance-none border border-gray-200 bg-gray-100 rounded-md mr-2 py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400"
        type="text"
        placeholder="Enter your keyword"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        required
      />
      <button
        type="button"
        className="px-4 py-2 inline-block border border-transparent bg-blue-600 text-white rounded-md hover:bg-blue-700"
        onClick={submitHandler}
      >
        Search
      </button>
    </form>
  );
};

export default Search;
