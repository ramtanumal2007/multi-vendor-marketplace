"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, DollarSign, CreditCard, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface DeliveryConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: string) => Promise<void>;
  orderNumber: string;
  currentPaymentMethod?: string;
  currentPaymentStatus?: string;
  isSubmitting?: boolean;
}

export function DeliveryConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  orderNumber,
  currentPaymentMethod = "COD",
  currentPaymentStatus = "pending",
  isSubmitting = false,
}: DeliveryConfirmationModalProps) {
  const isAlreadyPaid = currentPaymentStatus?.toLowerCase() === "paid";
  const initialMethod = isAlreadyPaid || currentPaymentMethod?.toUpperCase() !== "COD" ? "ONLINE" : "COD";

  const [selectedMethod, setSelectedMethod] = useState<string>(initialMethod);

  useEffect(() => {
    if (isOpen) {
      const defaultVal = isAlreadyPaid || currentPaymentMethod?.toUpperCase() !== "COD" ? "ONLINE" : "COD";
      setSelectedMethod(defaultVal);
    }
  }, [isOpen, currentPaymentMethod, currentPaymentStatus, isAlreadyPaid]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(selectedMethod);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Mark Order as Delivered</h3>
              <p className="text-xs text-slate-400 mt-0.5">Confirm payment collection & final delivery stage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Order Reference:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">#{orderNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Placed Payment Method:</span>
              <span className="font-semibold text-slate-700">{currentPaymentMethod || "COD"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Current Payment Status:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                  isAlreadyPaid
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}
              >
                {currentPaymentStatus || "pending"}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Actual Delivery Payment Collection Method *
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Confirm how payment was actually received for this order upon delivery:
            </p>

            <div className="space-y-3">
              {/* Option 1: COD */}
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedMethod === "COD"
                    ? "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={selectedMethod === "COD"}
                  onChange={() => setSelectedMethod("COD")}
                  className="mt-1 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Cash on Delivery (COD)
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Physical cash collected by delivery agent at customer doorstep.
                  </p>
                </div>
              </label>

              {/* Option 2: Online / UPI */}
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedMethod === "ONLINE"
                    ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="ONLINE"
                  checked={selectedMethod === "ONLINE"}
                  onChange={() => setSelectedMethod("ONLINE")}
                  className="mt-1 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    UPI / Online Payment
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Paid via UPI / QR Code at delivery or pre-paid online via Razorpay/Card.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>
              Confirming will set <strong>payment_status = Paid</strong> and update seller dashboard in real-time.
            </span>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              Confirm Delivered & Paid
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
