"use client";

import React, { useState } from "react";
import { XCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  orderNumber?: string;
  onSuccess?: () => void;
}

export function CancelOrderModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  onSuccess,
}: CancelOrderModalProps) {
  const { addToast } = useToast();

  const [reasonCode, setReasonCode] = useState<string>("ORDERED_BY_MISTAKE");
  const [customReasonText, setCustomReasonText] = useState<string>("");
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !orderId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      addToast({
        title: "Confirmation Required",
        description: "Please check the box to confirm order cancellation.",
        type: "error",
      });
      return;
    }

    if (reasonCode === "OTHER" && (!customReasonText.trim() || customReasonText.trim().length < 3)) {
      addToast({
        title: "Reason Required",
        description: "Please write a brief explanation for cancelling this order.",
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasonCode,
          reasonText: reasonCode === "OTHER" ? customReasonText.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to cancel order.");
      }

      addToast({
        title: "Order Cancelled",
        description: `Order #${orderNumber || ""} has been cancelled successfully.`,
        type: "success",
      });

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel order.";
      addToast({
        title: "Cancellation Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-foreground leading-tight">
                Cancel Order
              </h3>
              <p className="text-xs text-foreground-secondary font-mono">
                Order #{orderNumber || ""}
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-2">
              Why are you cancelling this order?
            </p>
            <div className="space-y-2">
              {[
                { code: "ORDERED_BY_MISTAKE", label: "Ordered by mistake" },
                { code: "FOUND_BETTER_PRICE", label: "Found a better price" },
                { code: "DELIVERY_TAKING_TOO_LONG", label: "Delivery taking too long" },
                { code: "NO_LONGER_NEEDED", label: "No longer needed" },
                { code: "OTHER", label: "Other / Custom reason" },
              ].map((r) => (
                <label
                  key={r.code}
                  onClick={() => setReasonCode(r.code)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    reasonCode === r.code
                      ? "border-red-500 bg-red-500/5 text-foreground"
                      : "border-border text-foreground hover:bg-background-secondary/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="cancel_reason"
                    checked={reasonCode === r.code}
                    onChange={() => setReasonCode(r.code)}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {reasonCode === "OTHER" && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">
                Please tell us the reason:
              </label>
              <textarea
                rows={2}
                value={customReasonText}
                onChange={(e) => setCustomReasonText(e.target.value)}
                placeholder="Why do you wish to cancel..."
                className="w-full p-2.5 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-[11px] text-amber-800 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Order cancellation is irreversible. The reserved items will be released back to the store inventory immediately.
            </span>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded text-red-600 focus:ring-red-500"
            />
            <span>I confirm that I wish to permanently cancel this order.</span>
          </label>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Keep Order
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || !confirmed}
              className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white border-none gap-1.5"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Confirm Cancellation</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
