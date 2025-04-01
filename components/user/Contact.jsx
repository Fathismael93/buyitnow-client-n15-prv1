'use client';

import React, { useContext, useState } from 'react';
import AuthContext from '@/context/AuthContext';
import { emailSchema } from '@/helpers/schemas';
import { toast } from 'react-toastify';

const Contact = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const { sendEmail } = useContext(AuthContext);

  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      const newEmail = {
        subject,
        message,
      };

      const result = await emailSchema.validate({
        subject,
        message,
      });

      if (result) {
        sendEmail(newEmail);
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
          <h2 className="mb-5 text-2xl font-semibold">Write your message</h2>

          <div className="mb-4">
            <label className="block mb-1"> Subject </label>
            <input
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
              type="text"
              placeholder="What do you need ?"
              minLength={6}
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1"> Message </label>
            <textarea
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
              type="text"
              placeholder="Type your message..."
              rows="9"
              cols="20"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            ></textarea>
          </div>

          <button
            type="submit"
            className="my-2 px-4 py-2 text-center w-full inline-block text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
};

export default Contact;
