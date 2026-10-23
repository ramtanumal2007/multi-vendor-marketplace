"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { Wallet, ArrowDownLeft, ArrowUpRight, ShieldCheck, Clock, RefreshCw, Loader2 } from "lucide-react";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface WalletData {
  id: string;
  customer_id: string;
  balance: number;
  currency: string;
}

interface TransactionItem {
  id: string;
  type: string;
  amount: number;
  direction: "credit" | "debit";
  balance_after: number;
  reference_type: string;
  reference_id: string;
  description: string;
  created_at: string;
}

export default function CustomerWalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchWallet = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/wallet");
      const data = await res.json();
      if (data.success) {
        setWallet(data.wallet);
        setTransactions(data.transactions || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-1">
          Customer Wallet
        </h1>
        <p className="text-sm text-foreground-secondary">
          Store credits, replacement price difference adjustments, and promotional balances.
        </p>
      </div>

      {isLoading ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-card rounded-3xl border border-border">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-foreground-secondary">Loading wallet balance...</p>
        </div>
      ) : (
        <>
          {/* Balance Card */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl relative overflow-hidden border border-slate-700">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-widest">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>Available Store Credit Balance</span>
                </div>
                <div className="text-4xl md:text-5xl font-black tracking-tight text-white mt-1">
                  {formatCurrency(wallet?.balance || 0, wallet?.currency || "INR")}
                </div>
                <p className="text-xs text-slate-400 pt-1">
                  Automatically applied at checkout or used for product replacements.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchWallet}
                  className="text-xs font-bold bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Ledger History */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <span>Transaction Ledger</span>
            </h2>

            {transactions.length === 0 ? (
              <div className="p-12 text-center bg-card rounded-2xl border border-dashed border-border text-xs text-foreground-secondary">
                No wallet transactions yet. When a replacement product price is lower than the original order item, the difference is credited directly here.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60 shadow-xs">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-3.5 sm:p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 text-xs">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                          tx.direction === "credit"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-red-500/10 text-red-600"
                        }`}
                      >
                        {tx.direction === "credit" ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <p className="font-bold text-foreground text-xs leading-snug">{tx.description}</p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                              tx.type === "ADMIN_ADJUSTMENT"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                : tx.type === "REPLACEMENT_PRICE_DIFFERENCE_CREDIT"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                : tx.type === "REFUND_WALLET_CREDIT"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {tx.type === "ADMIN_ADJUSTMENT"
                              ? "Admin Credit"
                              : tx.type === "REPLACEMENT_PRICE_DIFFERENCE_CREDIT"
                              ? "Exchange Adjustment"
                              : tx.type === "REFUND_WALLET_CREDIT"
                              ? "Refund Credit"
                              : "Store Purchase"}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-foreground-secondary mt-0.5">
                          {formatExactDateTime(tx.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center pl-11 sm:pl-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40 shrink-0">
                      <div
                        className={`font-mono font-bold text-sm ${
                          tx.direction === "credit" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {tx.direction === "credit" ? "+" : "-"}
                        {formatCurrency(tx.amount)}
                      </div>
                      <div className="text-[10px] text-foreground-secondary font-mono sm:mt-0.5">
                        Balance: {formatCurrency(tx.balance_after)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
