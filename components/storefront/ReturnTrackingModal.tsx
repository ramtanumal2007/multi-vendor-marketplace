"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  RotateCcw,
  RefreshCw,
  Package,
  ShieldCheck,
  X,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface ReturnTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnId: string | null;
}

const RETURN_STAGES = [
  { key: "RETURN_REQUESTED", label: "Return Requested", desc: "Request received & under review" },
  { key: "RETURN_APPROVED", label: "Approved", desc: "Return authorization granted" },
  { key: "RETURN_PICKUP_SCHEDULED", label: "Pickup Scheduled", desc: "Doorstep courier assigned" },
  { key: "RETURN_PICKED_UP", label: "Picked Up", desc: "Item collected from customer" },
  { key: "RETURN_RECEIVED_BY_SELLER", label: "Seller Received", desc: "Product arrived at merchant" },
  { key: "RETURN_INSPECTION", label: "Inspection", desc: "Quality verification in progress" },
  { key: "REFUND_PROCESSING", label: "Refund Processing", desc: "Disbursement in bank queue" },
  { key: "REFUND_COMPLETED", label: "Refund Completed", desc: "Funds credited successfully" },
];

const REPLACEMENT_STAGES = [
  { key: "REPLACEMENT_REQUESTED", label: "Exchange Requested", desc: "Request submitted & under review" },
  { key: "REPLACEMENT_APPROVED", label: "Exchange Approved", desc: "Replacement authorized by admin" },
  { key: "OLD_PRODUCT_PICKUP_PENDING", label: "Exchange Scheduled", desc: "Doorstep courier exchange scheduled" },
  { key: "OLD_PRODUCT_PICKED_UP", label: "Old Item Collected", desc: "Original item collected from doorstep" },
  { key: "REPLACEMENT_DISPATCHED", label: "Dispatched", desc: "Replacement items in transit" },
  { key: "REPLACEMENT_OUT_FOR_DELIVERY", label: "Out for Delivery", desc: "Courier arriving for doorstep exchange" },
  { key: "REPLACEMENT_DELIVERED", label: "Exchange Completed", desc: "Replacement received & handed over" },
];

export function ReturnTrackingModal({
  isOpen,
  onClose,
  returnId,
}: ReturnTrackingModalProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && returnId) {
      setLoading(true);
      setError(null);
      fetch(`/api/returns/${returnId}`)
        .then((res) => res.json())
        .then((resData) => {
          if (resData.success) {
            setData(resData.returnRequest);
            setAuditLogs(resData.auditLogs || []);
          } else {
            setError(resData.message || "Failed to load tracking data.");
          }
        })
        .catch(() => setError("Network error loading return details."))
        .finally(() => setLoading(false));
    }
  }, [isOpen, returnId]);

  if (!isOpen) return null;

  const req = data as {
    id?: string;
    return_number?: string;
    request_type?: string;
    status?: string;
    reason_code?: string;
    reason_text?: string;
    refund_method?: string;
    refund_amount?: number;
    refund_details?: {
      upiId?: string;
      accountNumber?: string;
      ifscCode?: string;
      walletCreditAmount?: number;
      walletCreditStatus?: string;
      replacementItems?: Array<{
        productId: string;
        title?: string;
        productTitle?: string;
        sku?: string;
        imageUrl?: string;
        image?: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        sellerName?: string;
        storeName?: string;
      }>;
    };
    refund_payment_reference?: string;
    refund_processed_at?: string;
    seller_received_at?: string;
    pickup_status?: string;
    pickup_scheduled_date?: string;
    created_at?: string;
    quantity?: number;
    replacement_quantity?: number;
    replacement_price_difference?: number;
    replacement_payment_status?: string;
    products?: { title?: string; price?: number; product_images?: Array<{ image_url: string }> };
    orders?: { order_number?: string; created_at?: string };
    replacement_product?: { title?: string; price?: number };
  } | null;

  const isReplacement = req?.request_type === "replacement";
  const stages = isReplacement ? REPLACEMENT_STAGES : RETURN_STAGES;

  // Determine current stage index
  const currentStatus = req?.status || (isReplacement ? "REPLACEMENT_REQUESTED" : "RETURN_REQUESTED");
  let activeIndex = stages.findIndex((s) => s.key === currentStatus);
  if (activeIndex === -1) {
    if (currentStatus === "REFUND_APPROVED") activeIndex = 5;
    else if (currentStatus === "RETURN_PICKUP_ASSIGNED") activeIndex = 2;
    else if (currentStatus === "OLD_PRODUCT_RECEIVED") activeIndex = 3;
    else if (currentStatus === "REPLACEMENT_ORDER_CREATED") activeIndex = 4;
    else if (currentStatus === "RETURN_CLOSED") activeIndex = stages.length - 1;
    else if (currentStatus === "REPLACEMENT_CLOSED") activeIndex = stages.length - 1;
    else activeIndex = 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-background-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              {isReplacement ? <RefreshCw className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-foreground leading-tight">
                {isReplacement ? "Replacement Status & Tracking" : "Return & Refund Tracking"}
              </h3>
              <p className="text-xs text-foreground-secondary font-mono">
                {req?.return_number || "Loading..."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-background-secondary flex items-center justify-center text-foreground-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <p className="text-xs text-foreground-secondary">Loading tracking timeline...</p>
            </div>
          ) : error || !req ? (
            <div className="p-8 text-center text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200">
              {error || "Could not load return tracking details."}
            </div>
          ) : (
            <>
              {/* Product and Request Overview Card */}
              <div className="p-4 rounded-2xl bg-background-secondary/40 border border-border flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-background relative overflow-hidden shrink-0 border border-border flex items-center justify-center">
                  {req.products?.product_images?.[0]?.image_url ? (
                    <Image
                      src={req.products.product_images[0].image_url}
                      alt={req.products?.title || ""}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-foreground-secondary/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {isReplacement ? "Original Item to Return" : "Returned Item"}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-foreground truncate mt-1">{req.products?.title}</p>
                  <p className="text-[11px] text-foreground-secondary mt-0.5">
                    Order #{req.orders?.order_number} • Qty: {req.quantity || 1}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-background-secondary text-foreground-secondary font-medium border border-border">
                      Reason: {(req.reason_code || "").replace(/_/g, " ")}
                    </span>
                    {!isReplacement && req.refund_amount ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold">
                        Refund: {formatCurrency(req.refund_amount)} ({req.refund_method})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Selected Replacement Products Card (Customer Exchange View) */}
              {isReplacement && (
                <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-purple-200 dark:border-purple-800/40">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900 dark:text-purple-300">
                      <RefreshCw className="w-4 h-4 text-purple-600" />
                      <span>
                        Your Selected Replacement Products (
                        {req.refund_details?.replacementItems?.length || req.replacement_quantity || 1} items)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      Coordinated Exchange
                    </span>
                  </div>

                  {/* List of Replacement Items */}
                  <div className="space-y-2">
                    {(req.refund_details?.replacementItems || []).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-card border border-border/80 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-background-secondary relative overflow-hidden shrink-0 border border-border flex items-center justify-center">
                            {item.imageUrl || item.image ? (
                              <Image
                                src={(item.imageUrl || item.image) as string}
                                alt={(item.title || item.productTitle || "") as string}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-foreground-secondary/40" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-foreground truncate">
                              {item.title || item.productTitle}
                            </p>
                            <p className="text-[11px] text-foreground-secondary">
                              Qty: <strong>{item.quantity}</strong> • SKU: {item.sku || "N/A"}
                            </p>
                            <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">
                              Fulfilled by: <strong>{item.sellerName || item.storeName || "Merchant Store"}</strong>
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-xs text-foreground">
                            {formatCurrency(item.lineTotal || item.unitPrice * item.quantity)}
                          </p>
                          <p className="text-[10px] text-foreground-secondary">
                            {formatCurrency(item.unitPrice)} each
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Financial Settlement Breakdown */}
                  <div className="p-3 rounded-xl bg-card border border-border/60 text-xs space-y-1.5">
                    <div className="flex justify-between text-foreground-secondary">
                      <span>Total Replacement Value:</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(
                          (req.refund_details?.replacementItems || []).reduce(
                            (sum, it) => sum + (it.lineTotal || it.unitPrice * it.quantity),
                            0
                          ) ||
                            ((req.products?.price || 0) * (req.quantity || 1) + (req.replacement_price_difference || 0))
                        )}
                      </span>
                    </div>

                    <div className="pt-1.5 border-t border-border/40 flex justify-between font-bold">
                      <span>Exchange Settlement:</span>
                      <span>
                        {req.replacement_price_difference && req.replacement_price_difference < 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            Wallet Credit: +{formatCurrency(Math.abs(req.replacement_price_difference))} (
                            {req.refund_details?.walletCreditStatus === "CREDITED"
                              ? "Credited to Wallet"
                              : "Pending verification on delivery"}
                            )
                          </span>
                        ) : req.replacement_price_difference && req.replacement_price_difference > 0 ? (
                          <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                            Payable: {formatCurrency(req.replacement_price_difference)} ({req.replacement_payment_status || "Pending"})
                          </span>
                        ) : (
                          <span className="text-foreground">₹0 Even Exchange</span>
                        )}
                      </span>
                    </div>

                    {req.pickup_scheduled_date && (
                      <div className="mt-1 pt-1 border-t border-border/40 flex justify-between text-blue-700 dark:text-blue-400 text-[11px]">
                        <span>Doorstep Courier Visit:</span>
                        <span className="font-bold">{formatExactDateTime(req.pickup_scheduled_date)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Stepper Timeline */}
              <div className="space-y-1">
                <p className="text-xs font-bold text-foreground-secondary uppercase tracking-wider mb-4">
                  Progress Timeline
                </p>

                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
                  {stages.map((st, index) => {
                    const isCompleted = index < activeIndex || currentStatus === "REFUND_COMPLETED" || currentStatus === "REPLACEMENT_DELIVERED";
                    const isCurrent = index === activeIndex && currentStatus !== "REFUND_COMPLETED" && currentStatus !== "REPLACEMENT_DELIVERED";

                    const matchingLog = auditLogs.find((l) => {
                      const newSt = (l.new_status as string) || "";
                      const act = (l.action as string) || "";
                      return newSt === st.key || act === st.key || act.endsWith(`_${st.key}`);
                    });

                    let eventTimestamp: string | null = null;
                    if (matchingLog?.created_at) {
                      eventTimestamp = matchingLog.created_at as string;
                    } else if (st.key === "RETURN_REQUESTED" || st.key === "REPLACEMENT_REQUESTED") {
                      eventTimestamp = req.created_at || null;
                    } else if (st.key === "RETURN_RECEIVED_BY_SELLER" || st.key === "OLD_PRODUCT_RECEIVED") {
                      eventTimestamp = req.seller_received_at || null;
                    } else if (st.key === "REFUND_COMPLETED") {
                      eventTimestamp = req.refund_processed_at || null;
                    }

                    const isPickupStage = st.key === "RETURN_PICKUP_SCHEDULED" || st.key === "OLD_PRODUCT_PICKUP_PENDING";
                    const scheduledForDate =
                      req.pickup_scheduled_date ||
                      ((matchingLog?.metadata as Record<string, unknown>)?.pickupScheduledDate as string | undefined);

                    return (
                      <div key={st.key} className="relative flex items-start gap-3 group">
                        {/* Status Icon */}
                        <div
                          className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                            isCompleted
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : isCurrent
                              ? "bg-accent border-accent text-white ring-4 ring-accent/20 animate-pulse"
                              : "bg-card border-border text-foreground-secondary"
                          }`}
                        >
                          {isCompleted ? "✓" : isCurrent ? "●" : "○"}
                        </div>

                        <div>
                          <p
                            className={`text-xs font-bold leading-tight ${
                              isCompleted
                                ? "text-foreground"
                                : isCurrent
                                ? "text-accent"
                                : "text-foreground-secondary"
                            }`}
                          >
                            {st.label}
                          </p>
                          <p className="text-[11px] text-foreground-secondary mt-0.5">
                            {st.desc}
                          </p>

                          {/* Timestamp rendering */}
                          {isPickupStage && (isCompleted || isCurrent) ? (
                            <div className="mt-1.5 flex flex-col gap-0.5 text-[11px]">
                              {scheduledForDate && (
                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                  Scheduled for: {formatExactDateTime(scheduledForDate)}
                                </span>
                              )}
                              {eventTimestamp && (
                                <span className="text-foreground-secondary/70 font-mono text-[10px]">
                                  Scheduled by admin: {formatExactDateTime(eventTimestamp)}
                                </span>
                              )}
                            </div>
                          ) : (isCompleted || isCurrent) && eventTimestamp ? (
                            <p className="text-[10px] font-mono text-foreground-secondary/80 mt-1">
                              {formatExactDateTime(eventTimestamp)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Refund Confirmation Details (If Return) */}
              {!isReplacement && (
                <div className="p-4 rounded-2xl bg-background border border-border space-y-2 text-xs">
                  <div className="font-bold text-foreground flex items-center gap-1.5 pb-2 border-b border-border/60">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <span>Refund Disbursement Information</span>
                  </div>

                  <div className="flex justify-between text-foreground-secondary">
                    <span>Refund Method:</span>
                    <span className="font-semibold text-foreground">{req.refund_method || "Direct Transfer"}</span>
                  </div>

                  {req.refund_details?.upiId ? (
                    <div className="flex justify-between text-foreground-secondary">
                      <span>UPI ID:</span>
                      <span className="font-mono text-foreground font-semibold">{req.refund_details.upiId}</span>
                    </div>
                  ) : req.refund_details?.accountNumber ? (
                    <div className="flex justify-between text-foreground-secondary">
                      <span>Bank Account:</span>
                      <span className="font-mono text-foreground font-semibold">{req.refund_details.accountNumber}</span>
                    </div>
                  ) : null}

                  <div className="flex justify-between text-foreground-secondary">
                    <span>Approved Amount:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(req.refund_amount || 0)}</span>
                  </div>

                  {req.refund_payment_reference ? (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <span>Bank Payment Reference:</span>
                      <span className="font-mono">{req.refund_payment_reference}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                      Refund is disbursed by our authorized admin operator immediately following warehouse inspection.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-background-secondary/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-background-secondary hover:bg-border text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
