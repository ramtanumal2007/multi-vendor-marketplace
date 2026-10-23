"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Cake,
  ArrowRight,
  Plus,
  Loader2,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface CustomCakeSummary {
  id: string;
  request_number: string;
  cake_type: string;
  flavor: string;
  weight: string;
  budget_max: number;
  preferred_delivery_date: string;
  status: string;
  seller_quote?: {
    final_amount?: number;
    cake_price?: number;
    quoted_at?: string;
  } | null;
  converted_order_id?: string | null;
  created_at: string;
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: "Submitted", color: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900" },
  ADMIN_REVIEW: { label: "In Review", color: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900" },
  FORWARDED_TO_SELLER: { label: "At Bakery", color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900" },
  SELLER_REVIEW: { label: "Bakery Preparing Quote", color: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-900" },
  QUOTED: { label: "Quote Ready! 🎉", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-extrabold" },
  CUSTOMER_ACCEPTED: { label: "Quote Accepted", color: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-900" },
  CONVERTED_TO_ORDER: { label: "Order Active", color: "bg-emerald-600 text-white border-transparent font-bold" },
  DECLINED: { label: "Declined", color: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900" },
  REJECTED: { label: "Rejected", color: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900" },
  CANCELLED: { label: "Cancelled", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700" },
  CLARIFICATION_REQUESTED: { label: "Action Needed", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-bold" },
};

export default function CustomerCustomCakesListPage() {
  const [requests, setRequests] = useState<CustomCakeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadRequests() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/customer/custom-cakes");
        const data = await res.json();
        if (data.success && Array.isArray(data.requests)) {
          setRequests(data.requests);
        }
      } catch (err) {
        console.error("Failed to load custom cake requests:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadRequests();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Cake className="w-6 h-6 text-rose-600" />
            <span>My Custom Cake Requests</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track your bespoke cake designs, review bakery quotations, and confirm orders.
          </p>
        </div>

        <Link
          href="/customize-cake"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-md transition-transform active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Cake Request</span>
        </Link>
      </div>

      {/* Requests List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16">
          <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
          <p className="text-xs font-semibold text-slate-500">Loading your cake requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <Cake className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            No Custom Cake Requests Yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-5">
            Planning a celebration? Tell us your theme, flavor, and budget, and our certified bakeries will craft it for you.
          </p>
          <Link
            href="/customize-cake"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Customize a Cake</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const statusConfig = STATUS_BADGES[req.status] || {
              label: req.status,
              color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200",
            };

            const isQuoteReady = req.status === "QUOTED";

            return (
              <Link
                key={req.id}
                href={`/account/custom-cakes/${req.id}`}
                className={`group block p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 hover:shadow-lg ${
                  isQuoteReady
                    ? "border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20"
                    : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      #{req.request_number || req.id.slice(0, 8)}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusConfig.color}`}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  <span className="text-xs text-slate-400">
                    Requested on {formatExactDateTime(req.created_at)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Type & Flavor</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {req.cake_type} • {req.flavor}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Weight / Size</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {req.weight}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Delivery Date</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {req.preferred_delivery_date}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      {req.seller_quote?.final_amount ? "Quoted Amount" : "Budget Up To"}
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                      {req.seller_quote?.final_amount
                        ? formatCurrency(req.seller_quote.final_amount)
                        : formatCurrency(req.budget_max)}
                    </span>
                  </div>
                </div>

                {/* Footer Link / Prompt */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold">
                  {isQuoteReady ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Quote ready — Tap to review and confirm order
                    </span>
                  ) : req.converted_order_id ? (
                    <span className="text-teal-600 dark:text-teal-400">
                      Converted to active marketplace order
                    </span>
                  ) : (
                    <span className="text-slate-500">View design specifications & timeline</span>
                  )}

                  <span className="text-accent flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
