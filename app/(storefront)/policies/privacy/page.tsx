"use client";

import React from "react";

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-[800px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Privacy Policy</h1>
        <p className="text-foreground-secondary">Last updated: June 2024</p>
      </div>

      <div className="prose prose-slate max-w-none">
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          This Privacy Policy describes how your personal information is collected, used, and shared when you visit or make a purchase from our website.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">Personal Information We Collect</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          When you visit the Site, we automatically collect certain information about your device, including information about your web browser, IP address, time zone, and some of the cookies that are installed on your device. Additionally, as you browse the Site, we collect information about the individual web pages or products that you view, what websites or search terms referred you to the Site, and information about how you interact with the Site.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">How Do We Use Your Personal Information?</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          We use the Order Information that we collect generally to fulfill any orders placed through the Site (including processing your payment information, arranging for shipping, and providing you with invoices and/or order confirmations). Additionally, we use this Order Information to:
        </p>
        <ul className="list-disc pl-6 text-foreground-secondary mb-6 space-y-2">
          <li>Communicate with you;</li>
          <li>Screen our orders for potential risk or fraud; and</li>
          <li>When in line with the preferences you have shared with us, provide you with information or advertising relating to our products or services.</li>
        </ul>

        <h2 className="text-2xl font-serif mt-10 mb-4">Sharing Your Personal Information</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          We share your Personal Information with third parties to help us use your Personal Information, as described above. We may also share your Personal Information to comply with applicable laws and regulations, to respond to a subpoena, search warrant or other lawful request for information we receive, or to otherwise protect our rights.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">Data Retention</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          When you place an order through the Site, we will maintain your Order Information for our records unless and until you ask us to delete this information.
        </p>
      </div>
    </div>
  );
}
