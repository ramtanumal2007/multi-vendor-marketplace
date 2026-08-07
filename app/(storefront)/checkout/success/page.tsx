"use client";

import React from "react";
import { motion } from "framer-motion";
import { Package, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order") || "ORD-00000";

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="mb-8 relative"
      >
        {/* SVG Path Draw Animation for Checkmark */}
        <svg className="w-24 h-24 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <motion.circle 
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            cx="12" cy="12" r="10" 
          />
          <motion.path 
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.8, ease: "easeOut" }}
            d="M9 12l2 2 4-4" 
          />
        </svg>
      </motion.div>

      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="text-4xl font-serif mb-4"
      >
        Order Confirmed!
      </motion.h1>

      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4 }}
        className="text-lg text-foreground-secondary mb-2"
      >
        Thank you for your purchase. We've received your order.
      </motion.p>
      
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 }}
        className="font-medium text-lg mb-10"
      >
        Order #{orderNumber}
      </motion.p>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6 }}
        className="flex flex-col sm:flex-row gap-4 w-full max-w-md"
      >
        <Link href="/products" className="flex-1">
          <Button variant="outline" className="w-full h-12 flex items-center justify-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Continue Shopping
          </Button>
        </Link>
        <Link href="/account" className="flex-1">
          <Button variant="primary" className="w-full h-12 flex items-center justify-center gap-2">
            <Package className="w-4 h-4" /> Track Order
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
