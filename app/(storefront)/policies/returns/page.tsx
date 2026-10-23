"use client";

import React from "react";

export default function ReturnsPolicyPage() {
  return (
    <div className="max-w-[800px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Returns & Exchanges</h1>
        <p className="text-foreground-secondary">Last updated: June 2024</p>
      </div>

      <div className="prose prose-slate max-w-none">
        <h2 className="text-2xl font-serif mt-10 mb-4">Our Return Policy</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          We want you to be completely satisfied with your purchase. We accept returns of unworn, unwashed, and undamaged items within 30 days of delivery for a full refund or exchange.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">Conditions for Returns</h2>
        <ul className="list-disc pl-6 text-foreground-secondary mb-6 space-y-2">
          <li>Items must be returned within 30 days of the delivery date.</li>
          <li>Items must be unworn, unwashed, and have original tags attached.</li>
          <li>Final sale items cannot be returned or exchanged.</li>
          <li>Intimates, swimwear, and pierced jewelry are non-returnable for hygiene reasons.</li>
        </ul>

        <h2 className="text-2xl font-serif mt-10 mb-4">How to Return</h2>
        <p className="text-foreground-secondary mb-4 leading-relaxed">
          To initiate a return, please follow these steps:
        </p>
        <ol className="list-decimal pl-6 text-foreground-secondary mb-6 space-y-2">
          <li>Contact our support team at support@example.com with your order number.</li>
          <li>We will provide you with a prepaid return shipping label via email.</li>
          <li>Pack the item securely in its original packaging (if possible).</li>
          <li>Attach the return label to the outside of the package and drop it off at the designated carrier location.</li>
        </ol>

        <h2 className="text-2xl font-serif mt-10 mb-4">Refunds</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          Once your return is received and inspected, we will send you an email to notify you that we have received your returned item. We will also notify you of the approval or rejection of your refund. If you are approved, then your refund will be processed, and a credit will automatically be applied to your credit card or original method of payment, within a certain amount of days.
        </p>

        <h2 className="text-2xl font-serif mt-10 mb-4">Exchanges</h2>
        <p className="text-foreground-secondary mb-6 leading-relaxed">
          If you need to exchange an item for a different size or color, please follow the return process for the original item and place a new order for the desired item. This ensures you get the item you want as quickly as possible.
        </p>
      </div>
    </div>
  );
}
