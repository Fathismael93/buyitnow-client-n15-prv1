'use client';

import React, { useState, useEffect, useContext } from 'react';
import { CldImage, CldUploadWidget } from 'next-cloudinary';

import { toast } from 'react-toastify';

import AuthContext from '@/context/AuthContext';
import { profileSchema } from '@/helpers/schemas';

const UpdateProfile = () => {
  const { user, error, loading, updateProfile, clearErrors } =
    useContext(AuthContext);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState();

  useEffect(() => {
    if (user) {
      setName(user?.name);
      setPhone(user?.phone);
      if (user?.avatar?.url) {
        setAvatar(user?.avatar);
      }
    }

    if (error) {
      toast.error(error);
      clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, user]);

  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      const result = await profileSchema.validate({
        name,
        phone,
      });

      if (result) {
        updateProfile({ name, phone, avatar });
      }
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <div
        style={{ maxWidth: '480px' }}
        className="mt-1 mb-20 p-4 md:p-7 mx-auto rounded-sm bg-white"
      >
        <form onSubmit={submitHandler} encType="multipart/form-data">
          <h2 className="mb-5 text-2xl font-semibold">Update Profile</h2>

          <div className="mb-4">
            <label className="block mb-1"> Full Name </label>
            <input
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
              type="text"
              placeholder="Type your name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1"> Mobile Number </label>
            <input
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
              type="tel"
              placeholder="Type your mobile number"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1"> Avatar </label>
            <div className="mb-4 flex flex-col md:flex-row">
              <div className="flex items-center mb-4 space-x-3 mt-4 cursor-pointer md:w-1/5 lg:w-1/4">
                <CldImage
                  className="w-14 h-14 rounded-full"
                  src={
                    avatar?.public_id
                      ? avatar?.public_id
                      : '/images/default.png'
                  }
                  width="14"
                  height="14"
                  alt="user avatar"
                />
              </div>
              <div className="md:w-2/3 lg:w-80">
                <CldUploadWidget
                  signatureEndpoint={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update/sign-cloudinary-params`}
                  onSuccess={(result) => {
                    setAvatar({
                      public_id: result?.info?.public_id,
                      url: result?.info?.secure_url,
                    });
                  }}
                  options={{
                    folder: 'buyitnow/avatars', // Specify the folder here
                  }}
                >
                  {({ open }) => {
                    return (
                      <button
                        className="px-1 py-1 text-center w-full inline-block text-blue-600 border border-blue-600 rounded-md"
                        onClick={() => open()}
                        type="button"
                      >
                        Change profile image
                      </button>
                    );
                  }}
                </CldUploadWidget>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="my-2 px-4 py-2 text-center w-full inline-block text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            disabled={loading ? true : false}
          >
            {loading ? 'Updating...' : 'Update'}
          </button>
        </form>
      </div>
    </>
  );
};

export default UpdateProfile;
