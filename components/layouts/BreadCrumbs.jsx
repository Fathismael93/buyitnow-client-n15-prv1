/* eslint-disable react/prop-types */
import React, { memo } from 'react';
import Link from 'next/link';
import { arrayHasData } from '@/helpers/helpers';

const BreadCrumbs = memo(({ breadCrumbs }) => {
  return (
    <section className="py-5 sm:py-7 bg-blue-100">
      <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
        <ol className="inline-flex flex-wrap text-gray-600 space-x-1 md:space-x-3 items-center">
          {arrayHasData(breadCrumbs)
            ? ''
            : breadCrumbs?.map((breadCrumb, index) => (
                <li className="inline-flex items-center" key={index}>
                  <Link
                    href={breadCrumb.url}
                    className="text-gray-600 hover:text-blue-600"
                  >
                    {breadCrumb.name}
                  </Link>
                  {breadCrumbs?.length - 1 !== index && (
                    <i
                      className="ml-3 text-gray-400 fa fa-chevron-right"
                      aria-hidden="true"
                    ></i>
                  )}
                </li>
              ))}
        </ol>
      </div>
    </section>
  );
});

BreadCrumbs.displayName = 'BreadCrumbs';

export default BreadCrumbs;
