"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Package, ShoppingBag, CheckCircle2, Clock, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { InvoiceModal } from "@/components/checkout/InvoiceModal";

export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order") || "ORD-00000";
  const [orderRecord, setOrderRecord] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [customerProfile, setCustomerProfile] = useState<any>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const [orderInfo, setOrderInfo] = useState<{
    status: string;
    paymentStatus: string;
    paymentMethod: string;
  } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchOrderSummary() {
      if (!orderNumber || orderNumber === "ORD-00000") return;

      const { data: ord } = await supabase
        .from("orders")
        .select("*")
        .eq("order_number", orderNumber)
        .single();

      if (ord) {
        setOrderRecord(ord);
        setOrderInfo({
          status: ord.internal_status || "ORDERED",
          paymentStatus: ord.payment_status || "pending",
          paymentMethod: ord.payment_method || "COD",
        });

        const { data: items } = await supabase
          .from("order_items")
          .select("*, stores(name)")
          .eq("order_id", ord.id);
        setOrderItems(items || []);

        if (ord.user_id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", ord.user_id)
            .single();
          setCustomerProfile(prof || null);
        }
      }
    }

    fetchOrderSummary();
  }, [orderNumber]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center py-12">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="mb-6 relative"
      >
        <svg
          className="w-20 h-20 text-emerald-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.circle
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            cx="12"
            cy="12"
            r="10"
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
        transition={{ delay: 0.3 }}
        className="text-3xl md:text-4xl font-bold mb-3 text-slate-900"
      >
        ORDER PLACED SUCCESSFULLY
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-base text-slate-600 mb-6 max-w-md"
      >
        Thank you for your purchase! We have received your order and notified the seller.
      </motion.p>

      {/* Order Status Summary Badge Box */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 mb-8 w-full max-w-md text-left space-y-3"
      >
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Order Reference
          </span>
          <span className="font-extrabold text-slate-900 text-sm">#{orderNumber}</span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-semibold">Current Order Status</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            {orderInfo?.status || "ORDERED"}
          </span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-semibold">Payment Status</span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              orderInfo?.paymentStatus === "paid"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                : "bg-amber-100 text-amber-800 border border-amber-200"
            }`}
          >
            {orderInfo?.paymentStatus === "paid"
              ? "Paid"
              : orderInfo?.paymentMethod === "COD"
              ? "COD Pending"
              : "Pending Verification"}
          </span>
        </div>

        {orderRecord && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsInvoiceOpen(true)}
              className="flex-1 text-xs h-9 font-bold border-slate-300"
            >
              <FileText className="w-3.5 h-3.5 mr-1 text-blue-600" /> Preview Invoice
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsInvoiceOpen(true)}
              className="flex-1 text-xs h-9 font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Download Invoice
            </Button>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col sm:flex-row gap-4 w-full max-w-md"
      >
        <Link href="/products" className="flex-1">
          <Button variant="outline" className="w-full h-12 flex items-center justify-center gap-2 font-bold">
            <ShoppingBag className="w-4 h-4" /> Continue Shopping
          </Button>
        </Link>
        <Link href="/account/orders" className="flex-1">
          <Button variant="primary" className="w-full h-12 flex items-center justify-center gap-2 font-bold">
            <Package className="w-4 h-4" /> Track Order
          </Button>
        </Link>
      </motion.div>

      {/* Invoice Modal */}
      {orderRecord && (
        <InvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
          order={orderRecord}
          items={orderItems}
          customerProfile={customerProfile}
        />
      )}
    </div>
  );
}
