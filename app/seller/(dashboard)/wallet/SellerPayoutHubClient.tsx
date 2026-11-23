"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Landmark,
  QrCode,
  Calendar,
  Search,
  DollarSign,
  Receipt,
  Info,
  X,
  FileText,
  AlertTriangle,
  Printer,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface FinancialSummary {
  seller_id: string;
  gross_product_sales: number;
  pending_settlement: number;
  on_hold_earnings: number;
  available_to_withdraw: number;
  reserved_for_payout: number;
  payout_processing: number;
  total_paid_to_seller: number;
  refunds_and_adjustments: number;
  cod_expected_remittance: number;
  cod_received_and_reconciled: number;
  minimum_payout_amount: number;
  currency: string;
  timezone: string;
}

interface Destination {
  id: string;
  type: "BANK_ACCOUNT" | "UPI";
  label: string;
  subLabel: string;
  isPrimary: boolean;
  bankAccountId?: string;
  upiId?: string;
}

interface PayoutRequestItem {
  id: string;
  payout_number: string;
  amount: number;
  amount_paise: number;
  destination_type: "BANK_ACCOUNT" | "UPI";
  destination_snapshot: Record<string, unknown>;
  status: "pending" | "approved" | "processing" | "paid" | "rejected" | "failed" | "cancelled";
  requested_at: string;
  approved_at: string | null;
  processing_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  transfer?: {
    utr_reference: string;
    transfer_method: string;
    transferred_amount: number;
    actual_transfer_date: string;
    actual_transfer_time: string;
    actual_transfer_timestamp: string;
    destination_masked: string;
  } | null;
}

interface SettlementItem {
  id: string;
  order_id: string;
  order_number: string;
  order_item_code: string | null;
  product_id: string | null;
  product_title: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  platform_coupon: number;
  commission_rate: number;
  commission_amount: number;
  gst_on_commission: number;
  tcs_amount: number;
  tds_amount: number;
  net_seller_payable: number;
  payment_method: string;
  payment_status: string;
  fulfillment_status: string;
  delivered_at: string | null;
  hold_until: string | null;
  cod_reconciled: boolean;
  settlement_status: "pending_delivery" | "on_hold" | "eligible_released" | "refunded_adjusted" | "cancelled";
  created_at: string;
}

interface LedgerEntry {
  id: string;
  order_id: string | null;
  settlement_id: string | null;
  payout_request_id: string | null;
  entry_type: string;
  direction: "credit" | "debit" | "neutral";
  amount: number;
  amount_paise: number;
  balance_type: string;
  available_balance_after: number;
  idempotency_key: string | null;
  description: string;
  actor_type: string;
  created_at: string;
}

interface SellerPayoutHubClientProps {
  initialBusinessName: string;
  sellerId: string;
}

export default function SellerPayoutHubClient({
  initialBusinessName,
  sellerId,
}: SellerPayoutHubClientProps) {
  // Main Data States
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequestItem[]>([]);
  const [earnings, setEarnings] = useState<SettlementItem[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<{
    totalGross: number;
    totalCommission: number;
    totalNetPayable: number;
    totalItemsSold: number;
  }>({ totalGross: 0, totalCommission: 0, totalNetPayable: 0, totalItemsSold: 0 });
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<"PAYOUTS" | "EARNINGS" | "LEDGER">("PAYOUTS");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request Payout Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestAmount, setRequestAmount] = useState<string>("");
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  // Prevent concurrent payout submissions and preserve retry identity.
  const payoutSubmitLockRef = useRef(false);
  const payoutIdempotencyRef = useRef<Map<string, string>>(new Map());

  // View Receipt Modal State
  const [selectedPayoutForReceipt, setSelectedPayoutForReceipt] = useState<PayoutRequestItem | null>(null);

  // Earnings Filter States
  const [dateFilterPreset, setDateFilterPreset] = useState<string>("last30days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [earningsSearch, setEarningsSearch] = useState<string>("");
  const [earningsStatus, setEarningsStatus] = useState<string>("ALL");
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  // Load Overview Data
  const fetchOverview = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch("/api/seller/payouts/overview");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load financial overview.");
      }
      setSummary(data.summary);
      setDestinations(data.destinations || []);

      // Auto-select primary destination
      const primary = (data.destinations || []).find((d: Destination) => d.isPrimary) || (data.destinations || [])[0];
      if (primary) {
        setSelectedDestination(primary.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading financial records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load Payouts History
  const fetchPayouts = useCallback(async () => {
    try {
      const res = await fetch("/api/seller/payouts/history");
      const data = await res.json();
      if (res.ok && data.success) {
        setPayouts(data.payouts || []);
      }
    } catch (err) {
      console.warn("Error fetching payouts:", err);
    }
  }, []);

  // Load Earnings Report
  const fetchEarnings = useCallback(async () => {
    try {
      setLoadingEarnings(true);
      let startStr = "";
      let endStr = "";
      const now = new Date();

      if (dateFilterPreset === "today") {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        startStr = todayStart.toISOString();
      } else if (dateFilterPreset === "yesterday") {
        const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        startStr = yStart.toISOString();
        endStr = yEnd.toISOString();
      } else if (dateFilterPreset === "last7days") {
        const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startStr = d7.toISOString();
      } else if (dateFilterPreset === "last30days") {
        const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startStr = d30.toISOString();
      } else if (dateFilterPreset === "thisMonth") {
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        startStr = mStart.toISOString();
      } else if (dateFilterPreset === "prevMonth") {
        const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        startStr = pmStart.toISOString();
        endStr = pmEnd.toISOString();
      } else if (dateFilterPreset === "custom") {
        if (customStartDate) startStr = new Date(customStartDate).toISOString();
        if (customEndDate) endStr = new Date(customEndDate + "T23:59:59").toISOString();
      }

      const params = new URLSearchParams();
      if (startStr) params.set("startDate", startStr);
      if (endStr) params.set("endDate", endStr);
      if (earningsStatus !== "ALL") params.set("status", earningsStatus);
      if (earningsSearch.trim()) params.set("search", earningsSearch.trim());

      const res = await fetch(`/api/seller/payouts/earnings-report?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setEarnings(data.items || []);
        if (data.summary) {
          setEarningsSummary(data.summary);
        }
      }
    } catch (err) {
      console.warn("Error loading earnings:", err);
    } finally {
      setLoadingEarnings(false);
    }
  }, [dateFilterPreset, customStartDate, customEndDate, earningsStatus, earningsSearch]);

  // Load Ledger Entries
  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch("/api/seller/payouts/ledger");
      const data = await res.json();
      if (res.ok && data.success) {
        setLedger(data.entries || []);
      }
    } catch (err) {
      console.warn("Error loading ledger:", err);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchPayouts();
    fetchEarnings();
    fetchLedger();
  }, [fetchOverview, fetchPayouts, fetchEarnings, fetchLedger]);

  // Submit Payout   // Submit Payout Request Handler
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Synchronous lock prevents concurrent submissions.
    if (payoutSubmitLockRef.current) return;
    payoutSubmitLockRef.current = true;

    setRequestError(null);
    setRequestSuccess(null);

    let fingerprint: string | null = null;

    try {
      const amountNum = Number(requestAmount);

      if (!Number.isFinite(amountNum) || amountNum < 10) {
        setRequestError("Minimum payout request amount is ₹10.00.");
        return;
      }


      const selectedDestObj = destinations.find(
        (d) => d.id === selectedDestination
      );

      if (!selectedDestObj) {
        setRequestError("Please select a verified payout destination.");
        return;
      }

      // Reuse the same key for retries of identical payout details.
      fingerprint = JSON.stringify({
        sellerId,
        amount: Number(amountNum.toFixed(2)),
        destinationId: selectedDestObj.id,
        destinationType: selectedDestObj.type,
        bankAccountId: selectedDestObj.bankAccountId || null,
        upiId: selectedDestObj.upiId || null,
      });

      const storageKey = `vsm_payout_idempotency_${sellerId}`;
      const persistedKeys: Record<string, string> = {};

      try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === "string") {
                persistedKeys[key] = value;
              }
            }
          }
        }
      } catch {
        // Continue with in-memory protection if session storage is unavailable.
      }

      let idempotencyKey =
        payoutIdempotencyRef.current.get(fingerprint) ||
        persistedKeys[fingerprint];

      // Existing keys are retries; new requests must pass balance validation.
      const isRetry = Boolean(idempotencyKey);

      if (
        !isRetry &&
        (!summary || amountNum > summary.available_to_withdraw)
      ) {
        setRequestError(
          `Amount cannot exceed your current available balance of ${formatCurrency(
            summary?.available_to_withdraw || 0
          )}.`
        );
        return;
      }

      if (!idempotencyKey) {
        idempotencyKey = `REQ_${sellerId}_${globalThis.crypto.randomUUID()}`;
      }

      payoutIdempotencyRef.current.set(fingerprint, idempotencyKey);
      persistedKeys[fingerprint] = idempotencyKey;

      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(persistedKeys));
      } catch {
        // In-memory retry protection remains available.
      }

      setIsSubmittingPayout(true);

      const res = await fetch("/api/seller/payouts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          destinationType: selectedDestObj.type,
          bankAccountId: selectedDestObj.bankAccountId || null,
          idempotencyKey,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to submit payout request.");
      }

      setRequestSuccess(
        `Payout request #${data.payout_number} for ${formatCurrency(
          amountNum
        )} submitted successfully! Your funds are reserved and awaiting Admin review.`
      );

      // Keep the key briefly so an immediate repeated submit is idempotent.
      setTimeout(() => {
        if (fingerprint) {
          payoutIdempotencyRef.current.delete(fingerprint);

          try {
            const storageKey = `vsm_payout_idempotency_${sellerId}`;
            const raw = window.sessionStorage.getItem(storageKey);

            if (raw) {
              const parsed: unknown = JSON.parse(raw);

              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const storedKeys = parsed as Record<string, unknown>;
                delete storedKeys[fingerprint];

                if (Object.keys(storedKeys).length === 0) {
                  window.sessionStorage.removeItem(storageKey);
                } else {
                  window.sessionStorage.setItem(storageKey, JSON.stringify(storedKeys));
                }
              }
            }
          } catch {
            // Do not interrupt successful payout handling if storage cleanup fails.
          }
        }

        setIsRequestModalOpen(false);
        setRequestAmount("");
        fetchOverview();
        fetchPayouts();
        fetchLedger();
      }, 1800);
    } catch (err) {
      // Keep the key after failure so retry uses the same request identity.
      setRequestError(
        err instanceof Error
          ? err.message
          : "Error processing payout request."
      );
    } finally {
      setIsSubmittingPayout(false);
      payoutSubmitLockRef.current = false;
    }
  };

   const statusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Paid & Transferred
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            Approved (Awaiting Transfer)
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            Processing Transfer
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pending Review
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            Transfer Failed
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const settlementStatusBadge = (status: string) => {
    switch (status) {
      case "eligible_released":
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Released to Balance
          </span>
        );
      case "on_hold":
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            7-Day Delivery Hold
          </span>
        );
      case "pending_delivery":
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Pending Delivery / COD
          </span>
        );
      case "refunded_adjusted":
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            Refunded / Adjusted
          </span>
        );
      case "cancelled":
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600">
            Cancelled
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 shadow-xs">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Seller Settlements & Payouts</h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative financial ledger, escrow release tracking, and manual payout disbursals for {initialBusinessName}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOverview}
            disabled={refreshing}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Sync Ledger</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsRequestModalOpen(true)}
            disabled={!summary || summary.available_to_withdraw < 10}
            className="text-xs gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Request Payout</span>
          </Button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchOverview} className="text-xs h-8">
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-200">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Reconciling financial ledger balances...</p>
        </div>
      ) : (
        <>
          {/* REQUIRED SELLER DASHBOARD CARDS (7 CARDS MAPPED TO BACKEND DATA) */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Payout & Balance Overview
              </h2>
              <p className="text-xs text-slate-500">
                Authoritative money ledger balances and delivery escrow status.
              </p>
            </div>

            {/* Top Row: Available for Payout (Featured Hero) & On Hold */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* CARD 1: Available for Payout â€” "Money ready to request." */}
              <div className="lg:col-span-2 p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-lg relative overflow-hidden border border-slate-700 flex flex-col justify-between">
                <div className="space-y-2.5 relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Available for Payout
                      </span>
                      <p className="text-xs text-slate-300 font-medium mt-0.5">
                        Money ready to request.
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Min Payout: â‚¹10
                    </span>
                  </div>

                  <div className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white font-mono truncate pt-1">
                    {formatCurrency(summary?.available_to_withdraw || 0)}
                  </div>

                  <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed max-w-lg">
                    Eligible earnings released after the mandatory 7-day delivery hold. Ready for immediate withdrawal request to your verified bank or UPI.
                  </p>
                </div>

                <div className="pt-4 mt-3 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
                  <span className="text-[11px] text-slate-400">
                    Transfers are reviewed by Admin and disbursed with full UTR receipt.
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setIsRequestModalOpen(true)}
                    disabled={!summary || summary.available_to_withdraw < 10}
                    className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs h-9 px-4 shrink-0 shadow-sm cursor-pointer"
                  >
                    Request Payout
                  </Button>
                </div>
              </div>

              {/* CARD 2: On Hold â€” "Money that is not eligible yet." */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-500" />
                      On Hold
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      7-Day Hold
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Money that is not eligible yet.
                  </p>
                </div>

                <div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-600 font-mono truncate">
                    {formatCurrency(summary?.on_hold_earnings || 0)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Delivered orders currently within the mandatory 7-day buyer return & dispute hold period.
                  </p>
                </div>

                <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex items-center justify-between">
                  <span>Auto-released to Available</span>
                  <span>Asia/Kolkata</span>
                </div>
              </div>
            </div>

            {/* Grid of Remaining 5 Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
              {/* CARD 3: Reserved for Payout â€” "Money already reserved for a pending request." */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <span>Reserved for Payout</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Money already reserved for a pending request.
                  </p>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-purple-700 font-mono truncate">
                    {formatCurrency(summary?.reserved_for_payout || 0)}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Held until bank transfer or rejection
                  </span>
                </div>
              </div>

              {/* CARD 4: Payout Requests â€” "Check the status of your requests." */}
              <div
                onClick={() => setActiveTab("PAYOUTS")}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-2 hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 group-hover:text-blue-800">
                      <Receipt className="w-4 h-4 text-blue-600" />
                      <span>Payout Requests</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Check the status of your requests.
                  </p>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono">
                    {payouts.filter((p) => p.status === "pending" || p.status === "approved" || p.status === "processing").length} active
                  </div>
                  <span className="text-[10px] text-blue-600 font-semibold block mt-0.5">
                    {payouts.length} total request records
                  </span>
                </div>
              </div>

              {/* CARD 5: Payout History & Receipts â€” "View completed transfers and receipts." */}
              <div
                onClick={() => setActiveTab("PAYOUTS")}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-2 hover:border-emerald-300 hover:shadow-sm cursor-pointer transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 group-hover:text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Payout History & Receipts</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    View completed transfers and receipts.
                  </p>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-700 font-mono truncate">
                    {formatCurrency(summary?.total_paid_to_seller || 0)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                    {payouts.filter((p) => p.status === "paid").length} completed transfers
                  </span>
                </div>
              </div>

              {/* CARD 6: Earnings & Sales â€” "Sales and earnings breakdown." */}
              <div
                onClick={() => setActiveTab("EARNINGS")}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-2 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 group-hover:text-indigo-800">
                      <DollarSign className="w-4 h-4 text-indigo-600" />
                      <span>Earnings & Sales</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Sales and earnings breakdown.
                  </p>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono truncate">
                    {formatCurrency(summary?.gross_product_sales || 0)}
                  </div>
                  <span className="text-[10px] text-indigo-600 font-semibold block mt-0.5">
                    Click to view date-wise reports
                  </span>
                </div>
              </div>

              {/* CARD 7: COD Awaiting Remittance â€” "Courier payment not yet confirmed." */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                    <Boxes className="w-4 h-4 text-amber-600" />
                    <span>COD Awaiting Remittance</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Courier payment not yet confirmed.
                  </p>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-amber-700 font-mono truncate">
                    {formatCurrency(summary?.cod_expected_remittance || 0)}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Reconciled when courier deposits cash
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* REDESIGNED PAYOUT NAVIGATION (MOBILE-FIRST, NO HORIZONTAL SCROLL) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="border-b border-slate-200 p-3 sm:p-5 bg-slate-50/70">
              {/* Responsive Tab Grid: Vertically stacked or 3 columns on tablet/desktop, NO HORIZONTAL CLIPPING */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => setActiveTab("PAYOUTS")}
                  className={`px-3.5 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between sm:justify-center gap-2 ${
                    activeTab === "PAYOUTS"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white sm:bg-transparent text-slate-700 hover:bg-slate-200/60 border sm:border-transparent border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 shrink-0" />
                    <span>Payout Requests & Receipts</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      activeTab === "PAYOUTS"
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {payouts.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("EARNINGS")}
                  className={`px-3.5 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between sm:justify-center gap-2 ${
                    activeTab === "EARNINGS"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white sm:bg-transparent text-slate-700 hover:bg-slate-200/60 border sm:border-transparent border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 shrink-0" />
                    <span>Date-wise Earnings & Sales</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      activeTab === "EARNINGS"
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    Report
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("LEDGER")}
                  className={`px-3.5 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between sm:justify-center gap-2 ${
                    activeTab === "LEDGER"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white sm:bg-transparent text-slate-700 hover:bg-slate-200/60 border sm:border-transparent border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Financial Ledger Log</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      activeTab === "LEDGER"
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ledger.length}
                  </span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-200/70 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Authoritative records verified directly from your store database ledger.</span>
              </div>
            </div>

            {/* TAB 1: PAYOUT REQUESTS & RECEIPTS */}
            {activeTab === "PAYOUTS" && (
              <div className="p-6 space-y-4">
                {payouts.length === 0 ? (
                  <div className="p-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
                    <Receipt className="w-10 h-10 text-slate-300" />
                    <p className="font-semibold text-slate-700 text-sm">No payout requests submitted yet.</p>
                    <p className="text-slate-400 max-w-sm">
                      When your delivered orders pass the 7-day hold, use the <strong>Request Payout</strong> button to withdraw your available balance.
                    </p>
                    {summary && summary.available_to_withdraw >= 10 && (
                      <Button
                        size="sm"
                        onClick={() => setIsRequestModalOpen(true)}
                        className="mt-2 text-xs"
                      >
                        Request First Payout
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* MOBILE CARD VIEW (<sm) */}
                    <div className="block sm:hidden divide-y divide-slate-100">
                      {payouts.map((p) => {
                        const isPaid = p.status === "paid";
                        const isRejected = p.status === "rejected";
                        const isFailed = p.status === "failed";

                        let destLabel = "Bank Account";
                        if (p.destination_type === "UPI") {
                          destLabel = `UPI: ${p.destination_snapshot.upi_id || "UPI"}`;
                        } else {
                          destLabel = `${p.destination_snapshot.bank_name || "Bank"} (****${p.destination_snapshot.account_number_last4 || ""})`;
                        }

                        return (
                          <div key={p.id} className="p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900">
                                #{p.payout_number}
                              </span>
                              {statusBadge(p.status)}
                            </div>

                            <div className="flex items-baseline justify-between gap-2">
                              <div>
                                <span className="text-[11px] font-medium text-slate-700 block">{destLabel}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {formatExactDateTime(p.requested_at)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-black text-base text-slate-900">
                                  {formatCurrency(p.amount)}
                                </span>
                              </div>
                            </div>

                            {isRejected && p.rejection_reason && (
                              <div className="text-[10px] text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                                Reason: {p.rejection_reason}
                              </div>
                            )}

                            {isFailed && p.failure_reason && (
                              <div className="text-[10px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                                Failure: {p.failure_reason}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              {p.transfer?.utr_reference ? (
                                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  UTR: {p.transfer.utr_reference}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Pending Transfer</span>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedPayoutForReceipt(p)}
                                className={`text-xs h-7.5 px-3 ${
                                  isPaid ? "border-emerald-300 text-emerald-800 bg-emerald-50/50" : "text-slate-600"
                                }`}
                              >
                                {isPaid ? "Receipt" : "Details"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* TABLE VIEW (sm+) */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[820px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                          <th className="py-3 px-4">Payout #</th>
                          <th className="py-3 px-4">Requested At</th>
                          <th className="py-3 px-4">Amount</th>
                          <th className="py-3 px-4">Destination</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">UTR / Reference</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payouts.map((p) => {
                          const isPaid = p.status === "paid";
                          const isRejected = p.status === "rejected";
                          const isFailed = p.status === "failed";

                          let destLabel = "Bank Account";
                          if (p.destination_type === "UPI") {
                            destLabel = `UPI: ${p.destination_snapshot.upi_id || "UPI"}`;
                          } else {
                            destLabel = `${p.destination_snapshot.bank_name || "Bank"} (****${p.destination_snapshot.account_number_last4 || ""})`;
                          }

                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                                {p.payout_number}
                              </td>
                              <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                                {formatExactDateTime(p.requested_at)}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-sm text-slate-900 font-mono">
                                {formatCurrency(p.amount)}
                              </td>
                              <td className="py-3.5 px-4 text-slate-600">
                                <span className="font-medium text-slate-800">{destLabel}</span>
                              </td>
                              <td className="py-3.5 px-4">
                                {statusBadge(p.status)}
                                {isRejected && p.rejection_reason && (
                                  <div className="text-[10px] text-rose-600 mt-1 max-w-xs">
                                    Reason: {p.rejection_reason}
                                  </div>
                                )}
                                {isFailed && p.failure_reason && (
                                  <div className="text-[10px] text-red-600 mt-1 max-w-xs">
                                    Failure: {p.failure_reason}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs">
                                {p.transfer?.utr_reference ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    {p.transfer.utr_reference}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Pending Transfer</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                {isPaid ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedPayoutForReceipt(p)}
                                    className="text-xs h-8 gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    <span>Receipt</span>
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedPayoutForReceipt(p)}
                                    className="text-xs h-8 text-slate-600"
                                  >
                                    Details
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>
            )}

            {/* TAB 2: DATE-WISE EARNINGS & PRODUCT BREAKDOWN */}
            {activeTab === "EARNINGS" && (
              <div className="p-6 space-y-6">
                {/* Filter Controls Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  {/* Preset Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { key: "today", label: "Today" },
                      { key: "yesterday", label: "Yesterday" },
                      { key: "last7days", label: "Last 7 Days" },
                      { key: "last30days", label: "Last 30 Days" },
                      { key: "thisMonth", label: "This Month" },
                      { key: "prevMonth", label: "Previous Month" },
                      { key: "custom", label: "Custom Range" },
                    ].map((btn) => (
                      <button
                        key={btn.key}
                        onClick={() => setDateFilterPreset(btn.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          dateFilterPreset === btn.key
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Status & Search */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={earningsStatus}
                      onChange={(e) => setEarningsStatus(e.target.value)}
                      className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ALL">All Settlement Statuses</option>
                      <option value="eligible_released">Released to Balance</option>
                      <option value="on_hold">7-Day Escrow Hold</option>
                      <option value="pending_delivery">Pending Delivery / COD</option>
                      <option value="refunded_adjusted">Refunded / Adjusted</option>
                    </select>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search product / order..."
                        value={earningsSearch}
                        onChange={(e) => setEarningsSearch(e.target.value)}
                        className="text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Date Pickers */}
                {dateFilterPreset === "custom" && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-xs text-blue-900">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-2 py-1 rounded border border-blue-300 bg-white text-xs"
                    />
                    <span>To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-2 py-1 rounded border border-blue-300 bg-white text-xs"
                    />
                    <Button size="sm" onClick={fetchEarnings} className="text-xs h-7">
                      Apply Filter
                    </Button>
                  </div>
                )}

                {/* Filter Summary Metrics Header */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Gross Product Amount</span>
                    <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                      {formatCurrency(earningsSummary.totalGross)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Units Sold</span>
                    <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                      {earningsSummary.totalItemsSold} items
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Platform Commission</span>
                    <div className="text-base font-bold text-blue-700 font-mono mt-0.5">
                      -{formatCurrency(earningsSummary.totalCommission)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Net Seller Payable</span>
                    <div className="text-base font-bold text-emerald-800 font-mono mt-0.5">
                      {formatCurrency(earningsSummary.totalNetPayable)}
                    </div>
                  </div>
                </div>

                {/* Earnings Table */}
                {loadingEarnings ? (
                  <div className="p-12 text-center text-xs text-slate-500">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading date-filtered sales...
                  </div>
                ) : earnings.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    No sales matching the selected date range and filter criteria.
                  </div>
                ) : (
                  <div>
                    <div className="sm:hidden px-3.5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                      <span>â†” Scroll sideways to view all sales economics</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[850px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                          <th className="py-3 px-3">Order / Date</th>
                          <th className="py-3 px-3">Product Title & SKU</th>
                          <th className="py-3 px-3 text-center">Qty</th>
                          <th className="py-3 px-3">Gross Sales</th>
                          <th className="py-3 px-3">Platform Coupon</th>
                          <th className="py-3 px-3">Commission</th>
                          <th className="py-3 px-3 font-bold text-slate-900">Net Payable</th>
                          <th className="py-3 px-3">Settlement Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {earnings.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3">
                              <div className="font-mono font-bold text-slate-900">{item.order_number}</div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {formatExactDateTime(item.created_at)}
                              </div>
                            </td>
                            <td className="py-3 px-3 max-w-xs">
                              <div className="font-medium text-slate-900 truncate" title={item.product_title}>
                                {item.product_title}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                SKU: {item.sku || "N/A"}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-slate-700">
                              {item.quantity}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-900">
                              {formatCurrency(item.gross_amount)}
                            </td>
                            <td className="py-3 px-3 font-mono text-emerald-700">
                              {item.platform_coupon > 0 ? (
                                <span>+{formatCurrency(item.platform_coupon)} (Absorbed)</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono text-blue-700">
                              -{formatCurrency(item.commission_amount)}
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({(item.commission_rate * 100).toFixed(0)}%)
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-emerald-700 text-sm">
                              {formatCurrency(item.net_seller_payable)}
                            </td>
                            <td className="py-3 px-3">
                              {settlementStatusBadge(item.settlement_status)}
                              {item.hold_until && item.settlement_status === "on_hold" && (
                                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                  Release: {formatExactDateTime(item.hold_until)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>
            )}

            {/* TAB 3: AUDITABLE LEDGER LOG */}
            {activeTab === "LEDGER" && (
              <div className="p-6 space-y-4">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Immutable double-entry ledger. Every credit, hold release, payout reservation, and bank disbursement is permanently recorded with full audit trail.
                  </span>
                </div>

                {ledger.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    No ledger entries logged yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {ledger.map((entry) => {
                      const isCredit = entry.direction === "credit";
                      return (
                        <div
                          key={entry.id}
                          className="py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-xs"
                        >
                          <div className="flex items-start sm:items-center gap-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                entry.entry_type === "HOLD_RELEASE"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : entry.entry_type === "PAYOUT_PAID"
                                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                                  : entry.entry_type === "PAYOUT_RESERVED"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : entry.entry_type === "PAYOUT_RESERVATION_RELEASED"
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {entry.entry_type.replace(/_/g, " ")}
                            </span>

                            <div>
                              <p className="font-semibold text-slate-900">{entry.description}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                                <span>{formatExactDateTime(entry.created_at)}</span>
                                {entry.idempotency_key && (
                                  <>
                                    <span>â€¢</span>
                                    <span>Key: {entry.idempotency_key}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`font-mono font-bold text-sm ${
                                isCredit
                                  ? "text-emerald-700"
                                  : entry.direction === "debit"
                                  ? "text-rose-600"
                                  : "text-slate-700"
                              }`}
                            >
                              {isCredit ? "+" : entry.direction === "debit" ? "-" : ""}
                              {formatCurrency(entry.amount)}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              Avail: <strong>{formatCurrency(entry.available_balance_after)}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: REQUEST PAYOUT MODAL */}
      {/* ===================================================================== */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-base truncate">Request Seller Payout</h3>
                  <p className="text-xs text-slate-500 truncate">Withdraw eligible earnings to your verified account</p>
                </div>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handlePayoutSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {requestError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{requestError}</span>
                </div>
              )}

              {requestSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{requestSuccess}</span>
                </div>
              )}

              {/* Balance Bar & Shortcut */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Available to Withdraw</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700 mt-0.5">
                    {formatCurrency(summary?.available_to_withdraw || 0)}
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRequestAmount(String(summary?.available_to_withdraw || 0))}
                  className="text-xs h-8 border-slate-300 hover:bg-slate-100 font-semibold cursor-pointer shrink-0"
                >
                  Withdraw Full Balance
                </Button>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Withdrawal Amount (â‚¹)</span>
                  <span className="text-[11px] font-normal text-slate-500">Min â‚¹10.00</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 font-bold text-slate-400">â‚¹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="10"
                    max={summary?.available_to_withdraw || 0}
                    placeholder="Enter amount (e.g. 500.00)"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    disabled={isSubmittingPayout}
                    required
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Destination Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Select Verified Receiving Destination</span>
                  <Link href="/seller/bank-account" className="text-[11px] text-blue-600 hover:underline">
                    Manage Accounts
                  </Link>
                </label>

                {destinations.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
                    <p className="font-semibold">No verified bank account or UPI details registered.</p>
                    <p className="text-[11px]">
                      Payouts require an Admin-verified Bank Account or registered UPI ID.
                    </p>
                    <Link href="/seller/bank-account">
                      <Button size="sm" type="button" className="text-xs mt-1">
                        Register Bank Account
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {destinations.map((dest) => {
                      const isSelected = selectedDestination === dest.id;
                      return (
                        <div
                          key={dest.id}
                          onClick={() => setSelectedDestination(dest.id)}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? "bg-blue-50/60 border-blue-500 ring-1 ring-blue-500 shadow-xs"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-xl shrink-0 ${
                                dest.type === "BANK_ACCOUNT"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {dest.type === "BANK_ACCOUNT" ? (
                                <Landmark className="w-4 h-4" />
                              ) : (
                                <QrCode className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-xs">{dest.label}</span>
                                {dest.isPrimary && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 block mt-0.5">{dest.subLabel}</span>
                            </div>
                          </div>

                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notice */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">Notice on Payout Processing:</div>
                <p>
                  Requested funds will be locked immediately and processed via manual bank/UPI transfer following Admin verification. You will receive an official receipt with bank UTR once transfer is confirmed.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingPayout || destinations.length === 0}
                  className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmittingPayout ? "Reserving Balance..." : "Confirm & Submit Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: SELLER PAYMENT RECEIPT MODAL */}
      {/* ===================================================================== */}
      {selectedPayoutForReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90dvh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Receipt Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base truncate">Payment Receipt</h3>
                  <p className="text-xs text-slate-400 font-mono truncate">Vendosmith Marketplace Disbursal</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPayoutForReceipt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Content */}
            <div className="p-4 sm:p-6 space-y-4 text-xs flex-1 overflow-y-auto">
              <div className="text-center py-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80">
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-widest">
                  {selectedPayoutForReceipt.status === "paid" ? "Transfer Completed" : "Payout Status"}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-900 font-mono mt-1">
                  {formatCurrency(selectedPayoutForReceipt.amount)}
                </div>
                <div className="text-[11px] text-emerald-700 font-mono mt-1">
                  Req #{selectedPayoutForReceipt.payout_number}
                </div>
              </div>

              <div className="space-y-2.5 divide-y divide-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-1 pt-2">
                  <span className="text-slate-500">Merchant Entity:</span>
                  <span className="font-bold text-slate-900">{initialBusinessName}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 pt-2">
                  <span className="text-slate-500">Transfer Method:</span>
                  <span className="font-bold text-slate-900">
                    {selectedPayoutForReceipt.transfer?.transfer_method || selectedPayoutForReceipt.destination_type}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 pt-2">
                  <span className="text-slate-500">Destination:</span>
                  <span className="font-medium text-slate-800 font-mono text-[11px] break-all">
                    {selectedPayoutForReceipt.transfer?.destination_masked ||
                      (selectedPayoutForReceipt.destination_type === "UPI"
                        ? `UPI: ${selectedPayoutForReceipt.destination_snapshot?.upi_id}`
                        : `${selectedPayoutForReceipt.destination_snapshot?.bank_name} (****${selectedPayoutForReceipt.destination_snapshot?.account_number_last4})`)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 pt-2">
                  <span className="text-slate-500">Bank UTR / Ref:</span>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 break-all">
                    {selectedPayoutForReceipt.transfer?.utr_reference || "Awaiting Transfer"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 pt-2">
                  <span className="text-slate-500">Transfer Date & Time:</span>
                  <span className="font-mono text-slate-800 text-[11px]">
                    {selectedPayoutForReceipt.transfer?.actual_transfer_timestamp
                      ? formatExactDateTime(selectedPayoutForReceipt.transfer.actual_transfer_timestamp)
                      : "Pending"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 pt-2">
                  <span className="text-slate-500">Requested On:</span>
                  <span className="font-mono text-slate-500 text-[11px]">
                    {formatExactDateTime(selectedPayoutForReceipt.requested_at)}
                  </span>
                </div>

                {selectedPayoutForReceipt.admin_notes && (
                  <div className="pt-2">
                    <span className="text-slate-500 block mb-0.5">Admin Note:</span>
                    <span className="text-slate-700 italic block bg-slate-50 p-2 rounded-lg border border-slate-200 break-words">
                      {selectedPayoutForReceipt.admin_notes}
                    </span>
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div className="p-3 rounded-xl bg-slate-50 text-[10px] text-slate-400 text-center leading-normal">
                This is an official marketplace transaction confirmation issued by Vendosmith Payments. Timezone: Asia/Kolkata.
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0 bg-slate-50/50">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="text-xs h-9 gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Receipt
              </Button>
              <Button
                size="sm"
                onClick={() => setSelectedPayoutForReceipt(null)}
                className="text-xs h-9 cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







