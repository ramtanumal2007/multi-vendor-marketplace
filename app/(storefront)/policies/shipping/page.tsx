"use client";

import React from "react";

export default function ShippingPolicyPage() {
  return (
    <div className="max-w-[800px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Shipping Policy</h1>
        <p className="text-foreground-secondary">Last updated: June 2024</p>
      </div>

      <div className="prose prose-slate max-w-none">
        <h2 className="text-2xl font-serif mt-10 mb-4">Order Processing Time</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          All orders are processed within 1 to 2 business days (excluding weekends and holidays) after receiving your order confirmation email. You will receive another notification when your order has shipped. 
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">Domestic Shipping Rates and Estimates</h2>
        <p className="text-foreground-secondary mb-4 leading-relaxed">
          Shipping charges for your order will be calculated and displayed at checkout.
        </p>
        <ul className="list-disc pl-6 text-foreground-secondary mb-6 space-y-2">
          <li><strong>Standard Shipping (3-5 business days):</strong> Free on orders over $150, or $8 flat rate.</li>
          <li><strong>Expedited Shipping (2 business days):</strong> $15 flat rate.</li>
          <li><strong>Overnight Shipping (1 business day):</strong> $25 flat rate.</li>
        </ul>

        <h2 className="text-2xl font-serif mt-10 mb-4">International Shipping</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          We offer international shipping to most countries. Shipping charges will be calculated and displayed at checkout. Your order may be subject to import duties and taxes (including VAT), which are incurred once a shipment reaches your destination country. We are not responsible for these charges if they are applied and are your responsibility as the customer.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">How do I check the status of my order?</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          When your order has shipped, you will receive an email notification from us which will include a tracking number you can use to check its status. Please allow 48 hours for the tracking information to become available. You can also track your order directly from your Account Dashboard.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">Refunds, returns, and exchanges</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          Please review our full Return Policy for detailed information on returns and exchanges. If you have any further questions, please don't hesitate to contact us at support@example.com.
        </p>
      </div>
    </div>
  );
}
