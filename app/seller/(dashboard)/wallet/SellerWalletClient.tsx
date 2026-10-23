"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Filter,
  DollarSign,
  TrendingUp,
  Receipt,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface WalletRecord {
  id: string;
  customer_id: string;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface WalletTransactionRecord {
  id: string;
  wallet_id: string;
  customer_id: string;
  type: string;
  amount: number;
  direction: "credit" | "debit";
  balance_after: number;
  reference_type: string;
  reference_id: string;
  description: string;
  idempotency_key?: string | null;
  created_at: string;
}

interface SellerWalletClientProps {
  initialBusinessName: string;
  sellerId: string;
}

export default function SellerWalletClient({
  initialBusinessName,
  sellerId,
}: SellerWalletClientProps) {
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");

  const fetchWalletData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seller/wallet");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load seller wallet information.");
      }
      setWallet(data.wallet);
      setTransactions(data.transactions || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading wallet.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Compute summary metrics
  const totalCredits = transactions
    .filter((t) => t.direction === "credit")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalDebits = transactions
    .filter((t) => t.direction === "debit")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const adminCreditsCount = transactions.filter(
    (t) => t.type === "ADMIN_ADJUSTMENT"
  ).length;

  // Filter transactions
  const filteredTxs = transactions.filter((t) => {
    if (filterType === "CREDIT") return t.direction === "credit";
    if (filterType === "DEBIT") return t.direction === "debit";
    if (filterType === "ADMIN") return t.type === "ADMIN_ADJUSTMENT";
    return true;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Merchant Partner Wallet</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Official store credit, promotional incentives, and administrative goodwill adjustments for {initialBusinessName}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchWalletData}
            disabled={loading}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Balance</span>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchWalletData} className="text-xs h-8">
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-200 shadow-xs">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading merchant wallet records...</p>
        </div>
      ) : (
        <>
          {/* Main Balance Banner Card */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl relative overflow-hidden border border-slate-700">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Verified Merchant Store Account</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/20">
                    ID: {sellerId.slice(0, 8)}...
                  </span>
                </div>

                <div className="text-4xl md:text-5xl font-black tracking-tight text-white mt-1 font-mono">
                  {formatCurrency(wallet?.balance || 0, wallet?.currency || "INR")}
                </div>

                <p className="text-xs text-slate-300 pt-1 max-w-lg">
                  Available merchant store balance. Can be used for inventory settlements, advertising credits, or administrative refunds.
                </p>
              </div>

              {/* Quick Stat Highlights */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0">
                <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Total Credits Received
                  </span>
                  <span className="font-mono font-bold text-base text-emerald-400">
                    +{formatCurrency(totalCredits)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {transactions.filter((t) => t.direction === "credit").length} credit entries
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Admin Goodwill Adjustments
                  </span>
                  <span className="font-mono font-bold text-base text-purple-300">
                    {adminCreditsCount} Logged
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Verified by Admin
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Ledger History Card */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Table Header with Filters */}
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60">
              <div>
                <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>Wallet Transaction Ledger</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed ledger entries, administrative adjustments, and store balance logs.
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setFilterType("ALL")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === "ALL"
                      ? "bg-white text-slate-900 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All ({transactions.length})
                </button>
                <button
                  onClick={() => setFilterType("CREDIT")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === "CREDIT"
                      ? "bg-white text-emerald-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Credits
                </button>
                <button
                  onClick={() => setFilterType("ADMIN")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === "ADMIN"
                      ? "bg-white text-purple-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Admin Credits ({adminCreditsCount})
                </button>
                <button
                  onClick={() => setFilterType("DEBIT")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === "DEBIT"
                      ? "bg-white text-red-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Debits
                </button>
              </div>
            </div>

            {/* Transactions List */}
            {filteredTxs.length === 0 ? (
              <div className="p-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <Receipt className="w-8 h-8 text-slate-300" />
                <p className="font-semibold text-slate-600">No transactions matching filter.</p>
                <p className="text-[11px] text-slate-400">
                  When administrators issue manual store credits or settlements, they will be listed here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTxs.map((tx) => {
                  const isCredit = tx.direction === "credit";
                  const isAdminCredit = tx.type === "ADMIN_ADJUSTMENT";
                  const isReplacementDiff = tx.type === "REPLACEMENT_PRICE_DIFFERENCE_CREDIT";
                  const isRefundCredit = tx.type === "REFUND_WALLET_CREDIT";

                  return (
                    <div
                      key={tx.id}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors text-xs"
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        {/* Direction Icon */}
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            isCredit
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                              : "bg-red-50 text-red-600 border border-red-200"
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>

                        {/* Description & Badges */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 text-sm">{tx.description}</p>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isAdminCredit
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : isReplacementDiff
                                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                                  : isRefundCredit
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {isAdminCredit
                                ? "Admin Goodwill Credit"
                                : isReplacementDiff
                                ? "Replacement Adjustment"
                                : isRefundCredit
                                ? "Refund Credit"
                                : "Wallet Debit"}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                            <span>{formatExactDateTime(tx.created_at)}</span>
                            <span>•</span>
                            <span title={tx.id}>Ref: {tx.id.slice(0, 8)}...</span>
                            {tx.reference_type && (
                              <>
                                <span>•</span>
                                <span className="uppercase text-[10px] text-slate-400">
                                  Src: {tx.reference_type}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Amount & Balance */}
                      <div className="text-right shrink-0">
                        <div
                          className={`font-black text-base font-mono ${
                            isCredit ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {isCredit ? "+" : "-"}
                          {formatCurrency(tx.amount)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          Balance: <strong>{formatCurrency(tx.balance_after)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
