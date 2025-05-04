'use client';

import { useState, useContext, useEffect } from 'react';
import { countries } from 'countries-list';
import { toast } from 'react-toastify';

import AuthContext from '@/context/AuthContext';

import { addressSchema } from '@/helpers/schemas';

const NewAddress = () => {
  const { error, addNewAddress, clearErrors } = useContext(AuthContext);

  const countriesList = Object.values(countries);

  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [country, setCountry] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearErrors();
    }
  }, [error]);

  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      const newAddress = {
        street,
        additionalInfo,
        city,
        state,
        zipCode,
        country,
        isDefault,
      };

      const result = await addressSchema.validate({
        street,
        additionalInfo,
        city,
        state,
        zipCode,
        country,
        isDefault,
      });

      if (result) {
        addNewAddress(newAddress);
      }
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <section className="py-10">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="flex flex-col md:flex-row -mx-4">
            <main className="md:w-2/3 lg:w-3/4 px-4">
              <div
                style={{ maxWidth: '480px' }}
                className="mt-1 mb-20 p-4 md:p-7 mx-auto rounded-sm bg-white shadow-lg"
              >
                <form onSubmit={submitHandler}>
                  <h2 className="mb-5 text-2xl font-semibold">
                    Add new Address
                  </h2>

                  <div className="mb-4 md:col-span-2">
                    <div className="mb-4">
                      <label className="block mb-1"> Street* </label>
                      <input
                        required
                        className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                        type="text"
                        placeholder="Type your address"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block mb-1"> Additional Info </label>
                      <input
                        className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                        type="text"
                        placeholder="Add additional address"
                        value={additionalInfo}
                        onChange={(e) => setAdditionalInfo(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-x-3">
                    <div className="mb-4 md:col-span-1">
                      <label className="block mb-1"> City* </label>
                      <input
                        required
                        className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                        type="text"
                        placeholder="Type your city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>

                    <div className="mb-4 md:col-span-1">
                      <label className="block mb-1"> State* </label>
                      <input
                        required
                        className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                        type="text"
                        placeholder="Type state here"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-x-2">
                    <div className="mb-4 md:col-span-1">
                      <label className="block mb-1"> ZIP code* </label>
                      <input
                        required
                        className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                        type="number"
                        placeholder="Type zip code here"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                      />
                    </div>

                    <div className="mb-4 md:col-span-1">
                      <label className="block mb-1"> Default Address ?* </label>
                      <input
                        className="border border-gray-200 bg-gray-100 rounded-md hover:border-gray-400 focus:outline-hidden focus:border-gray-400"
                        type="checkbox"
                        placeholder="Type phone no here"
                        checked={isDefault}
                        onChange={() => setIsDefault(!isDefault)}
                      />
                    </div>
                  </div>

                  <div className="mb-4 md:col-span-2">
                    <label className="block mb-1"> Country* </label>
                    <select
                      required
                      className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      {countriesList.map((country) => (
                        <option key={country.name} value={country.name}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="my-2 px-4 py-2 text-center w-full inline-block text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                  >
                    Add
                  </button>
                </form>
              </div>
            </main>
          </div>
        </div>
      </section>
    </>
  );
};

export default NewAddress;
