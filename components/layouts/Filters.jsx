/* eslint-disable react/prop-types */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { arrayHasData, getPriceQueryParams } from '@/helpers/helpers';
import { toast } from 'react-toastify';

const Filters = ({ categories, setLoading }) => {
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [open, setOpen] = useState(false);

  const router = useRouter();

  let queryParams;

  function handleClick(checkbox) {
    setLoading(true);

    if (typeof window !== 'undefined') {
      queryParams = new URLSearchParams(window.location.search);
    }

    const checkboxes = document.getElementsByName(checkbox.name);

    checkboxes.forEach((item) => {
      if (item !== checkbox) item.checked = false;
    });

    if (checkbox.checked === false) {
      // Delete the filter from query
      queryParams.delete(checkbox.name);
    } else {
      // Set filter in the query
      if (queryParams.has(checkbox.name)) {
        queryParams.set(checkbox.name, checkbox.value);
      } else {
        queryParams.append(checkbox.name, checkbox.value);
      }
    }
    const path = window.location.pathname + '?' + queryParams.toString();

    setOpen(false);

    router.push(path);
  }

  async function handleButtonClick() {
    setLoading(true);

    try {
      if (typeof window !== 'undefined') {
        queryParams = new URLSearchParams(window.location.search);

        queryParams = getPriceQueryParams(queryParams, 'min', min);
        queryParams = getPriceQueryParams(queryParams, 'max', max);

        const path = window.location.pathname + '?' + queryParams.toString();

        setOpen(false);

        router.push(path);
      }
    } catch (error) {
      toast.error(error);
    }
  }

  function checkHandler(checkBoxType, checkBoxValue) {
    if (typeof window !== 'undefined') {
      queryParams = new URLSearchParams(window.location.search);

      const value = queryParams.get(checkBoxType);
      if (checkBoxValue === value) return true;
      return false;
    }
  }

  return (
    <aside className="md:w-1/3 lg:w-1/4 px-4">
      <button
        className="md:hidden mb-5 cursor-pointer w-full text-center px-4 py-2 inline-block text-lg text-gray-700 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-gray-100 hover:text-blue-600"
        onClick={() => setOpen((prev) => !prev)}
      >
        Filter by
      </button>
      <div
        className={`${
          open ? 'block' : 'hidden'
        } md:block px-6 py-4 border border-gray-200 bg-white rounded shadow-sm`}
      >
        <h3 className="font-semibold mb-2">Price ($)</h3>
        <div className="grid md:grid-cols-3 gap-x-2">
          <div className="mb-4">
            <input
              name="min"
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
              type="number"
              min="0"
              placeholder="Min"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <input
              name="max"
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
              type="number"
              min="0"
              placeholder="Max"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <button
              className="px-1 py-2 text-center w-full inline-block text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              onClick={handleButtonClick}
            >
              Go
            </button>
          </div>
        </div>
      </div>
      <div
        className={`${
          open ? 'block' : 'hidden'
        } md:block px-6 py-4 border border-gray-200 bg-white rounded shadow-sm`}
      >
        <h3 className="font-semibold mb-2">Category</h3>

        {arrayHasData(categories) ? (
          <div className="w-full">
            <p className="font-bold text-xl text-center">
              No categories found!
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {categories?.map((category) => {
              return (
                <li key={category?._id}>
                  <label className="flex items-center">
                    <input
                      name="category"
                      type="checkbox"
                      value={category?._id}
                      className="h-4 w-4"
                      defaultChecked={checkHandler('category', category?._id)}
                      onClick={(e) => handleClick(e.target)}
                    />
                    <span className="ml-2 text-gray-500">
                      {' '}
                      {category?.categoryName}{' '}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default Filters;
