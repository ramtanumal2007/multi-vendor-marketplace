"use client";

import React from "react";

export default function TermsOfServicePage() {
  return (
    <div className="max-w-[800px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Terms of Service</h1>
        <p className="text-foreground-secondary">Last updated: June 2024</p>
      </div>

      <div className="prose prose-slate max-w-none">
        <h2 className="text-2xl font-serif mt-10 mb-4">1. Overview</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          This website is operated by our company. Throughout the site, the terms “we”, “us” and “our” refer to our company. We offer this website, including all information, tools and services available from this site to you, the user, conditioned upon your acceptance of all terms, conditions, policies and notices stated here.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">2. General Conditions</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          We reserve the right to refuse service to anyone for any reason at any time. You understand that your content (not including credit card information), may be transferred unencrypted and involve transmissions over various networks. Credit card information is always encrypted during transfer over networks.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">3. Products or Services</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          Certain products or services may be available exclusively online through the website. These products or services may have limited quantities and are subject to return or exchange only according to our Return Policy. We have made every effort to display as accurately as possible the colors and images of our products that appear at the store.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">4. Accuracy of Billing and Account Information</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          We reserve the right to refuse any order you place with us. We may, in our sole discretion, limit or cancel quantities purchased per person, per household or per order. In the event that we make a change to or cancel an order, we may attempt to notify you by contacting the e-mail and/or billing address/phone number provided at the time the order was made.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">5. Changes to Terms of Service</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          You can review the most current version of the Terms of Service at any time at this page. We reserve the right, at our sole discretion, to update, change or replace any part of these Terms of Service by posting updates and changes to our website. It is your responsibility to check our website periodically for changes.
        </p>
      </div>
    </div>
  );
}
