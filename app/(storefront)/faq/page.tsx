"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    category: "Orders & Shipping",
    questions: [
      {
        q: "How long will it take to receive my order?",
        a: "Orders are typically processed within 1-2 business days. Standard shipping usually takes 3-5 business days within the contiguous US. Expedited shipping options are available at checkout."
      },
      {
        q: "Do you ship internationally?",
        a: "Yes, we ship to most countries worldwide. International shipping costs and delivery times vary by location. Duties and taxes are the responsibility of the recipient."
      },
      {
        q: "How can I track my order?",
        a: "Once your order ships, you will receive a confirmation email with a tracking number. You can also track your order directly from your Account Dashboard under the Orders section."
      }
    ]
  },
  {
    category: "Returns & Exchanges",
    questions: [
      {
        q: "What is your return policy?",
        a: "We accept returns within 30 days of delivery for a full refund. Items must be in their original, unworn condition with all tags attached. Final sale items cannot be returned."
      },
      {
        q: "How do I initiate a return?",
        a: "To start a return, please visit our Returns portal or contact our customer service team with your order number. We will provide you with a prepaid return shipping label."
      }
    ]
  },
  {
    category: "Products & Care",
    questions: [
      {
        q: "How should I care for my products?",
        a: "Care instructions vary by material. Please refer to the specific care label on your item or the 'Specifications' section on the product page for detailed instructions."
      },
      {
        q: "Will out-of-stock items be restocked?",
        a: "We frequently restock our core collection. For seasonal or limited-edition items, restocks are not guaranteed. You can sign up for restock notifications on the product page."
      }
    ]
  }
];

export default function FAQPage() {
  return (
    <div className="max-w-[800px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Frequently Asked Questions</h1>
        <p className="text-foreground-secondary text-lg">
          Find answers to common questions about our products, shipping, returns, and more.
        </p>
      </div>

      <div className="flex flex-col gap-12">
        {FAQS.map((section, idx) => (
          <div key={idx}>
            <h2 className="text-2xl font-serif mb-6">{section.category}</h2>
            <div className="flex flex-col border-t border-border">
              {section.questions.map((faq, faqIdx) => (
                <Accordion key={faqIdx} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Accordion({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button 
        className="w-full py-6 flex justify-between items-center text-left focus:outline-none group"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium text-foreground group-hover:text-accent transition-colors">
          {question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="flex-shrink-0 ml-4 text-foreground-secondary"
        >
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-foreground-secondary leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
