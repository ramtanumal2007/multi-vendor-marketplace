"use client";

import React, { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  RotateCcw,
  RefreshCw,
  Search,
  Package,
  CreditCard,
  ChevronRight,
  Loader2,
  X,
  Lock,
  Unlock,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface AdminReturnItem {
  id: string;
  return_number: string;
  request_type: "return" | "replacement";
  order_id: string;
  order_item_id: string;
  customer_id: string;
  seller_id: string;
  product_id: string;
  quantity: number;
  reason_code: string;
  reason_text?: string;
  refund_method?: string;
  refund_details?: {
    upiId?: string;
    accountHolder?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    branch?: string;
    method?: string;
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
      sellerId?: string;
      sellerName?: string;
      storeId?: string;
      storeName?: string;
    }>;
    walletCreditAmount?: number;
    walletCreditStatus?: string;
    walletCreditTransactionId?: string;
    walletCreditTransactionIds?: string[];
    originalEligibleValue?: number;
    returnedGrossSubtotal?: number;
    allocatedCouponDiscount?: number;
    tenderBreakdown?: {
      walletDebitTender?: number;
      codOrGatewayTender?: number;
      totalCustomerPaid?: number;
      allocatedWalletTender?: number;
      allocatedCodOrGatewayTender?: number;
    };
    replacementSubtotal?: number;
    totalCreditDue?: number;
    alreadyCreditedAmount?: number;
    remainingCreditDue?: number;
    calculatedPriceDifference?: number;
    replacementOrderNumber?: string;
    [key: string]: unknown;
  };
  refund_amount: number;
  refund_payment_reference?: string;
  refund_processed_at?: string;
  replacement_product_id?: string;
  replacement_quantity?: number;
  replacement_seller_id?: string;
  replacement_price_difference?: number;
  replacement_payment_method?: string;
  replacement_payment_status?: string;
  replacement_order_id?: string | null;
  status: string;
  seller_received_at?: string;
  pickup_status?: string;
  pickup_scheduled_date?: string;
  created_at: string;
  updated_at: string;
  products?: {
    id: string;
    title: string;
    sku?: string;
    slug?: string;
    price: number;
    product_images?: Array<{ image_url: string }>;
  };
  orders?: {
    id: string;
    order_number: string;
    created_at: string;
    delivered_at?: string;
    total: number;
  };
  customer?: {
    id: string;
    full_name?: string;
    email: string;
    phone?: string;
  };
  seller?: {
    id: string;
    business_name?: string;
    business_email?: string;
  };
  replacement_product?: {
    id: string;
    title: string;
    sku?: string;
    price: number;
  };
  replacement_seller?: {
    id: string;
    business_name?: string;
  };
}

export default function AdminReturnsPage() {
  const { addToast } = useToast();

  const [returns, setReturns] = useState<AdminReturnItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter] = useState<string>("ALL");

  const [stats, setStats] = useState({
    total: 0,
    requested: 0,
    pickupPending: 0,
    sellerReceived: 0,
    refundPending: 0,
    completed: 0,
  });

  // Selected item for drawer/modal
  const [selectedReturn, setSelectedReturn] = useState<AdminReturnItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isRevealing, setIsRevealing] = useState<boolean>(false);

  // Status Change State
  const [isChangingStatus, setIsChangingStatus] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string>("");

  // Refund Process Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState<boolean>(false);
  const [refundRefInput, setRefundRefInput] = useState<string>("");
  const [refundAmountInput, setRefundAmountInput] = useState<number>(0);
  const [paymentDateInput, setPaymentDateInput] = useState<string>("");
  const [refundNotesInput, setRefundNotesInput] = useState<string>("");
  const [refundError, setRefundError] = useState<string | null>(null);
  const [isProcessingRefund, setIsProcessingRefund] = useState<boolean>(false);

  // Schedule Return Pickup Modal State
  const [isSchedulePickupModalOpen, setIsSchedulePickupModalOpen] = useState<boolean>(false);
  const [pickupDateInput, setPickupDateInput] = useState<string>("");
  const [pickupTimeInput, setPickupTimeInput] = useState<string>("11:00");
  const [pickupNoteInput, setPickupNoteInput] = useState<string>("");
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [isSchedulingPickup, setIsSchedulingPickup] = useState<boolean>(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);

  const loadAdminReturns = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/admin/returns?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.returns)) {
        setReturns(data.returns);
        if (data.stats) setStats(data.stats);
      } else {
        addToast({ title: "Failed to load returns", description: data.message, type: "error" });
      }
    } catch {
      addToast({ title: "Network error", description: "Could not fetch admin returns.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter, searchQuery, addToast]);

  useEffect(() => {
    loadAdminReturns();
  }, [loadAdminReturns]);

  // Open Full Details Drawer
  const handleOpenDetails = async (ret: AdminReturnItem) => {
    setSelectedReturn(ret);
    setIsRevealed(false);
    try {
      const res = await fetch(`/api/returns/${ret.id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedReturn(data.returnRequest);
        setAuditLogs(data.auditLogs || []);
      }
    } catch {
      // ignore
    }
  };

  // Secure reveal of bank / UPI details for authorized admin
  const handleToggleReveal = async () => {
    if (!selectedReturn) return;
    if (isRevealed) {
      setIsRevealed(false);
      return;
    }

    setIsRevealing(true);
    try {
      const res = await fetch(`/api/returns/${selectedReturn.id}?reveal=true`);
      const data = await res.json();
      if (data.success && data.returnRequest) {
        setSelectedReturn(data.returnRequest);
        setIsRevealed(true);
        addToast({
          title: "Sensitive Details Unmasked",
          description: "Customer banking credentials temporarily revealed for refund execution.",
          type: "info",
        });
      }
    } catch {
      addToast({ title: "Failed to reveal credentials", type: "error" });
    } finally {
      setIsRevealing(false);
    }
  };

  // Status Change Execution
  const handleUpdateStatus = async (
    newStatus: string,
    extraParams?: { pickupScheduledDate?: string; notes?: string; pickupStatus?: string }
  ) => {
    if (!selectedReturn || isChangingStatus) return;

    if (newStatus === "REFUND_COMPLETED") {
      setRefundAmountInput(selectedReturn.refund_amount || 0);
      setRefundRefInput("");
      setRefundNotesInput("");
      setPaymentDateInput(new Date().toISOString().slice(0, 16));
      setRefundError(null);
      setIsRefundModalOpen(true);
      return;
    }

    if (newStatus === "RETURN_PICKUP_SCHEDULED" || newStatus === "OLD_PRODUCT_PICKUP_PENDING") {
      handleOpenSchedulePickupModal();
      return;
    }

    setIsChangingStatus(true);
    try {
      const res = await fetch(`/api/admin/returns/${selectedReturn.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus,
          notes: extraParams?.notes || statusNote || undefined,
          pickupScheduledDate: extraParams?.pickupScheduledDate,
          pickupStatus: extraParams?.pickupStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update status.");
      }

      addToast({
        title: "Status Updated",
        description: `Return status transitioned to ${newStatus}.`,
        type: "success",
      });

      if (data.replacementOrderCreated && data.createdOrderNumber) {
        addToast({
          title: "Replacement Order Created ✓",
          description: `Persistent Order #${data.createdOrderNumber} generated for exchange fulfillment.`,
          type: "success",
        });
      }

      setStatusNote("");
      await handleOpenDetails({ ...selectedReturn, status: newStatus });
      await loadAdminReturns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Status update failed.";
      addToast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleCreateReplacementOrder = async () => {
    if (!selectedReturn || isCreatingOrder) return;
    setIsCreatingOrder(true);
    try {
      const res = await fetch(`/api/admin/returns/${selectedReturn.id}/create-order`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        addToast({
          title: "Replacement Order Created ✓",
          description: `Order #${data.order_number} has been created and assigned to merchant pipeline.`,
          type: "success",
        });
        await loadAdminReturns();
        if (selectedReturn) {
          await handleOpenDetails({
            ...selectedReturn,
            replacement_order_id: data.order?.id || selectedReturn.replacement_order_id,
            status: "REPLACEMENT_ORDER_CREATED",
          });
        }
      } else {
        addToast({
          title: "Order Creation Failed",
          description: data.message || "Could not create replacement order.",
          type: "error",
        });
      }
    } catch {
      addToast({
        title: "Network Error",
        description: "Failed to communicate with replacement order service.",
        type: "error",
      });
    } finally {
      setIsCreatingOrder(false);
    }
  };


  // Open Schedule Pickup Modal with sensible defaults
  const handleOpenSchedulePickupModal = () => {
    if (!selectedReturn) return;
    setPickupError(null);
    setPickupNoteInput("");
    // Default to tomorrow's date in local/IST
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    setPickupDateInput(`${yyyy}-${mm}-${dd}`);
    setPickupTimeInput("11:00");
    setIsSchedulePickupModalOpen(true);
  };

  // Schedule Return Pickup
  const handleSchedulePickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn || isSchedulingPickup) return;

    if (!pickupDateInput || !pickupTimeInput) {
      setPickupError("Please select both a pickup date and time.");
      return;
    }

    const scheduledDate = new Date(`${pickupDateInput}T${pickupTimeInput}:00`);
    const now = new Date();
    if (scheduledDate.getTime() < now.getTime() - 15 * 60 * 1000) {
      setPickupError("Pickup date and time cannot be in the past.");
      return;
    }

    setIsSchedulingPickup(true);
    setPickupError(null);
    try {
      const combinedIso = new Date(`${pickupDateInput}T${pickupTimeInput}:00+05:30`).toISOString();
      const isRepl = selectedReturn.request_type === "replacement";
      const targetStatus = isRepl ? "OLD_PRODUCT_PICKUP_PENDING" : "RETURN_PICKUP_SCHEDULED";

      const res = await fetch(`/api/admin/returns/${selectedReturn.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus: targetStatus,
          pickupScheduledDate: combinedIso,
          pickupStatus: "SCHEDULED",
          notes:
            pickupNoteInput.trim() ||
            (isRepl
              ? "Same-day doorstep exchange scheduled by administrator."
              : "Doorstep courier pickup scheduled by administrator."),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to schedule pickup.");
      }

      addToast({
        title: isRepl ? "Exchange Scheduled" : "Pickup Scheduled",
        description: `Doorstep ${isRepl ? "exchange" : "collection"} scheduled for ${formatExactDateTime(combinedIso)}.`,
        type: "success",
      });

      setIsSchedulePickupModalOpen(false);
      await handleOpenDetails({
        ...selectedReturn,
        status: targetStatus,
        pickup_status: "SCHEDULED",
        pickup_scheduled_date: combinedIso,
      });
      await loadAdminReturns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to schedule pickup.";
      setPickupError(msg);
      addToast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSchedulingPickup(false);
    }
  };

  // Process & Complete Refund
  const handleCompleteRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn || isProcessingRefund) return;

    if (!refundRefInput.trim() || refundRefInput.trim().length < 4) {
      setRefundError("Please enter a valid banking payment reference number (UPI Ref / UTR / NEFT ID, min 4 characters).");
      return;
    }

    setIsProcessingRefund(true);
    setRefundError(null);
    try {
      const processedIso = paymentDateInput
        ? new Date(paymentDateInput).toISOString()
        : new Date().toISOString();

      const res = await fetch(`/api/admin/returns/${selectedReturn.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentReference: refundRefInput.trim(),
          refundAmount: refundAmountInput,
          processedAt: processedIso,
          notes: refundNotesInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to record refund completion.");
      }

      addToast({
        title: "Refund Completed",
        description: `Disbursement of ₹${data.refundAmount} confirmed with reference ${data.paymentReference}.`,
        type: "success",
      });

      setIsRefundModalOpen(false);
      await handleOpenDetails({
        ...selectedReturn,
        status: "REFUND_COMPLETED",
        refund_payment_reference: data.paymentReference,
        refund_processed_at: processedIso,
      });
      await loadAdminReturns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete refund.";
      setRefundError(msg);
      addToast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsProcessingRefund(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-blue-600" />
            <span>Returns & Replacements Control Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative lifecycle control for returns, replacements, doorstep pickups, and refund disbursements.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadAdminReturns}
          disabled={isLoading}
          className="text-xs font-semibold gap-1.5 self-start sm:self-auto"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Refresh</span>
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Requests", value: stats.total, color: "text-slate-900", bg: "bg-slate-50" },
          { label: "Pending Approval", value: stats.requested, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Pickup In Progress", value: stats.pickupPending, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Seller Received", value: stats.sellerReceived, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Refunds Pending", value: stats.refundPending, color: "text-rose-600", bg: "bg-rose-50" },
          { label: "Completed", value: stats.completed, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((card, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border border-slate-200 ${card.bg}`}>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{card.label}</div>
            <div className={`text-2xl font-black mt-1 ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Search & Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Return #, Order #, Customer, Product, or Seller..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "ALL", label: "All" },
            { id: "RETURN_REQUESTED", label: "Requested" },
            { id: "RETURN_APPROVED", label: "Approved" },
            { id: "RETURN_PICKUP_SCHEDULED", label: "Pickup Pending" },
            { id: "RETURN_RECEIVED_BY_SELLER", label: "Seller Received" },
            { id: "REFUND_PROCESSING", label: "Refund Pending" },
            { id: "REFUND_COMPLETED", label: "Completed" },
            { id: "RETURN_REJECTED", label: "Rejected" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-200">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading requests...</p>
        </div>
      ) : returns.length === 0 ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-dashed border-slate-200">
          <Package className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-base text-slate-800">No requests found</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Try adjusting your search query or filter options.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Return #</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Product & Qty</th>
                  <th className="px-6 py-4">Merchant</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Refund / Adjustment</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {returns.map((r) => {
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold font-mono text-slate-900">{r.return_number}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Order #{r.orders?.order_number}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">
                          {r.customer?.full_name || "Customer"}
                        </div>
                        <div className="text-[11px] text-slate-400">{r.customer?.email}</div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 relative overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                            {r.products?.product_images?.[0]?.image_url ? (
                              <Image
                                src={r.products.product_images[0].image_url}
                                alt={r.products?.title || ""}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <Package className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <p className="font-bold text-slate-900 truncate">{r.products?.title}</p>
                            <p className="text-[11px] text-slate-500">
                              Qty: <strong>{r.quantity}</strong> • SKU: {r.products?.sku || "N/A"}
                            </p>
                            {r.request_type === "replacement" && r.replacement_quantity ? (
                              <p className="text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded mt-0.5 w-fit border border-purple-200">
                                Exchanging for {r.replacement_quantity} replacement units
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800">
                          {r.seller?.business_name || "Merchant"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            r.request_type === "replacement"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {r.request_type}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            r.status === "REFUND_COMPLETED" || r.status === "REPLACEMENT_DELIVERED"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : r.status === "RETURN_REJECTED"
                              ? "bg-rose-50 text-rose-800 border border-rose-200"
                              : r.status.includes("PICKUP")
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {r.request_type === "return" ? (
                          <div className="font-bold text-slate-900">
                            {formatCurrency(r.refund_amount)}
                            <span className="text-[11px] text-slate-400 block font-normal">
                              via {r.refund_method}
                            </span>
                          </div>
                        ) : (
                          <div className="font-semibold text-slate-800">
                            {r.replacement_price_difference && r.replacement_price_difference < 0
                              ? `Wallet Credit ${formatCurrency(Math.abs(r.replacement_price_difference))}`
                              : r.replacement_price_difference && r.replacement_price_difference > 0
                              ? `Payable ${formatCurrency(r.replacement_price_difference)}`
                              : "₹0 Adjustment"}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetails(r)}
                          className="h-8 text-xs font-semibold gap-1 hover:bg-slate-100"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin Full Details & Action Drawer Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-slate-900">
                    Return Control #{selectedReturn.return_number}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                    {selectedReturn.request_type.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Order #{selectedReturn.orders?.order_number} • Placed: {formatExactDateTime(selectedReturn.orders?.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Product & Merchant Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Product Details</p>
                  <p className="font-bold text-slate-900">{selectedReturn.products?.title}</p>
                  <p className="text-slate-500 mt-0.5">
                    Quantity: <strong>{selectedReturn.quantity}</strong> • Price: {formatCurrency(selectedReturn.products?.price || 0)}
                  </p>
                  <p className="text-slate-400 font-mono text-[10px]">SKU: {selectedReturn.products?.sku || "N/A"}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Selling Merchant</p>
                  <p className="font-bold text-slate-900">{selectedReturn.seller?.business_name || "Merchant"}</p>
                  <p className="text-slate-500 mt-0.5">{selectedReturn.seller?.business_email}</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Seller Arrival:{" "}
                    <strong>
                      {selectedReturn.seller_received_at
                        ? `Received on ${formatExactDateTime(selectedReturn.seller_received_at)}`
                        : "Pending arrival at merchant facility"}
                    </strong>
                  </p>
                </div>
              </div>

              {/* Customer Reason Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-[11px] uppercase font-bold text-slate-400">Return Reason</p>
                <p className="font-bold text-slate-900">{(selectedReturn.reason_code || "").replace(/_/g, " ")}</p>
                {selectedReturn.reason_text && (
                  <p className="text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 mt-1">
                    &quot;{selectedReturn.reason_text}&quot;
                  </p>
                )}
              </div>

              {/* Selected Replacement Products Card (Admin View) */}
              {selectedReturn.request_type === "replacement" && (
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-purple-200">
                    <div className="flex items-center gap-1.5 font-bold text-purple-900">
                      <RefreshCw className="w-4 h-4 text-purple-600" />
                      <span>
                        Selected Replacement Products (
                        {selectedReturn.refund_details?.replacementItems?.length ||
                          selectedReturn.replacement_quantity ||
                          1}{" "}
                        items)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 uppercase">
                      Multi-Product Exchange
                    </span>
                  </div>

                  {/* Replacement Products List */}
                  <div className="space-y-2.5">
                    {(selectedReturn.refund_details?.replacementItems || []).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-purple-100 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 relative overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                            {item.imageUrl || item.image ? (
                              <Image
                                src={(item.imageUrl || item.image) as string}
                                alt={(item.title || item.productTitle || "") as string}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">
                              {item.title || item.productTitle}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              SKU: <span className="font-mono">{item.sku || "N/A"}</span> • Qty:{" "}
                              <strong>{item.quantity}</strong>
                            </p>
                            <p className="text-[11px] text-purple-700 font-medium">
                              Fulfilling Merchant:{" "}
                              <strong>{item.sellerName || item.storeName || "Merchant Store"}</strong>
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-slate-900">
                            {formatCurrency(
                              item.lineTotal || (item.unitPrice || 0) * (item.quantity || 1)
                            )}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatCurrency(item.unitPrice || 0)} each
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Durable Link to New Replacement Order */}
                  {(selectedReturn.replacement_order_id ||
                    selectedReturn.refund_details?.replacementOrderNumber) && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            Persistent Replacement Order Created
                          </span>
                          <p className="font-mono font-black text-sm text-emerald-950">
                            {selectedReturn.refund_details?.replacementOrderNumber ||
                              `ORD-${(selectedReturn.replacement_order_id || "").slice(0, 8).toUpperCase()}`}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/admin/orders?q=${selectedReturn.refund_details?.replacementOrderNumber || selectedReturn.replacement_order_id}`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1"
                      >
                        <span>View Order</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}

                  {/* Replacement Financials & Price Difference */}
                  <div className="p-3.5 rounded-xl bg-white border border-purple-100 space-y-2 text-xs shadow-2xs">
                    <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider pb-1 border-b border-purple-50">
                      Exchange Financial Settlement
                    </div>
                    {/* Item Gross and Coupon */}
                    <div className="flex justify-between text-slate-600">
                      <span>Original Purchased Value:</span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(
                          selectedReturn.refund_details?.returnedGrossSubtotal ??
                            (selectedReturn.products?.price || 0) * (selectedReturn.quantity || 1)
                        )}
                      </span>
                    </div>
                    {Boolean(selectedReturn.refund_details?.allocatedCouponDiscount && Number(selectedReturn.refund_details.allocatedCouponDiscount) > 0) && (
                      <div className="flex justify-between text-slate-600">
                        <span>Coupon Discount Applied:</span>
                        <span className="font-semibold text-amber-700">
                          -{formatCurrency(Number(selectedReturn.refund_details?.allocatedCouponDiscount))}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-700 font-semibold bg-slate-50 px-2 py-1 rounded">
                      <span>Eligible Original Payment:</span>
                      <span className="text-slate-900 font-bold">
                        {formatCurrency(
                          selectedReturn.refund_details?.originalEligibleValue ??
                            (selectedReturn.products?.price || 0) * (selectedReturn.quantity || 1)
                        )}
                      </span>
                    </div>

                    {/* Split Tender Breakdown */}
                    {Boolean(selectedReturn.refund_details?.tenderBreakdown) && (
                      <div className="text-[11px] text-slate-500 pl-2 space-y-0.5 border-l-2 border-purple-200">
                        <div className="flex justify-between">
                          <span>↳ Wallet Tender:</span>
                          <span className="font-medium text-slate-700">{formatCurrency(Number(selectedReturn.refund_details?.tenderBreakdown?.walletDebitTender || 0))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>↳ COD / Gateway Tender:</span>
                          <span className="font-medium text-slate-700">{formatCurrency(Number(selectedReturn.refund_details?.tenderBreakdown?.codOrGatewayTender || 0))}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-600 pt-1">
                      <span>Replacement Package Total:</span>
                      <span className="font-semibold text-purple-800">
                        {formatCurrency(
                          selectedReturn.refund_details?.replacementSubtotal ??
                            (((selectedReturn.refund_details?.replacementItems || []).reduce(
                              (sum, it) =>
                                sum +
                                (it.lineTotal || (it.unitPrice || 0) * (it.quantity || 1)),
                              0
                            )) ||
                              ((selectedReturn.products?.price || 0) * (selectedReturn.quantity || 1) +
                                (selectedReturn.replacement_price_difference || 0)))
                        )}
                      </span>
                    </div>

                    {/* Settlement Difference */}
                    {(() => {
                      const refDetails = selectedReturn.refund_details || {};
                      const rawDiff = selectedReturn.replacement_price_difference !== undefined && selectedReturn.replacement_price_difference !== null
                        ? Number(selectedReturn.replacement_price_difference)
                        : Number(refDetails.calculatedPriceDifference ?? 0);
                      const totalCredit = Number(refDetails.totalCreditDue ?? (rawDiff < 0 ? Math.abs(rawDiff) : 0));
                      const alreadyCredited = Number(refDetails.alreadyCreditedAmount ?? (refDetails.walletCreditStatus === "CREDITED" ? totalCredit : 0));
                      const remainingCredit = Number(refDetails.remainingCreditDue ?? Math.max(0, totalCredit - alreadyCredited));

                      if (totalCredit > 0 || rawDiff < 0) {
                        return (
                          <div className="pt-2 border-t border-purple-100 space-y-1">
                            <div className="flex justify-between font-bold text-emerald-800">
                              <span>Total Credit Due Customer:</span>
                              <span>+{formatCurrency(totalCredit)}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-600">
                              <span>Already Credited:</span>
                              <span className="font-semibold text-emerald-700">{formatCurrency(alreadyCredited)}</span>
                            </div>
                            {remainingCredit > 0 ? (
                              <div className="flex justify-between text-[11px] font-bold text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                                <span>Remaining Adjustment Pending:</span>
                                <span>+{formatCurrency(remainingCredit)}</span>
                              </div>
                            ) : (
                              <div className="flex justify-between text-[11px] font-bold text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                                <span>Credit Settlement Status:</span>
                                <span>Fully Credited to Wallet ✓</span>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (rawDiff > 0) {
                        return (
                          <div className="pt-2 border-t border-purple-100 flex justify-between font-bold text-amber-800">
                            <span>Payable by Customer:</span>
                            <span>{formatCurrency(rawDiff)} ({selectedReturn.replacement_payment_status || "Pending"})</span>
                          </div>
                        );
                      }

                      return (
                        <div className="pt-2 border-t border-purple-100 flex justify-between font-bold text-slate-700">
                          <span>Exchange Settlement:</span>
                          <span>₹0 Even Exchange</span>
                        </div>
                      );
                    })()}
                    {selectedReturn.pickup_scheduled_date && (
                      <div className="mt-1 pt-1 border-t border-purple-100 flex justify-between text-blue-800 text-[11px]">
                        <span>Coordinated Exchange Window:</span>
                        <span className="font-bold">
                          {formatExactDateTime(selectedReturn.pickup_scheduled_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Refund Account Information (Authorized Admin View for Return & Refund) */}
              {selectedReturn.request_type === "return" && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <span>Customer Refund Account Details</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleReveal}
                      disabled={isRevealing}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      {isRevealing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isRevealed ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <Unlock className="w-3 h-3" />
                      )}
                      <span>{isRevealed ? "Hide Details" : "Reveal Unmasked Details"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400">Method:</span>
                      <p className="font-bold text-slate-900">{selectedReturn.refund_method}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Refund Amount:</span>
                      <p className="font-bold text-emerald-600 text-sm">
                        {formatCurrency(selectedReturn.refund_amount)}
                      </p>
                    </div>

                    {selectedReturn.refund_method === "UPI" ? (
                      <div className="col-span-2">
                        <span className="text-slate-400">UPI Address / VPA:</span>
                        <p className="font-mono font-bold text-slate-900 bg-white p-2 rounded-lg border border-slate-200">
                          {selectedReturn.refund_details?.upiId || "N/A"}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-400">Account Holder:</span>
                          <p className="font-bold text-slate-900">
                            {selectedReturn.refund_details?.accountHolder || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400">Account Number:</span>
                          <p className="font-mono font-bold text-slate-900 bg-white p-1 rounded-md border border-slate-200">
                            {selectedReturn.refund_details?.accountNumber || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400">IFSC Code:</span>
                          <p className="font-mono font-bold text-slate-900">
                            {selectedReturn.refund_details?.ifscCode || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400">Bank & Branch:</span>
                          <p className="font-medium text-slate-800">
                            {selectedReturn.refund_details?.bankName || "N/A"}{" "}
                            {selectedReturn.refund_details?.branch ? `(${selectedReturn.refund_details.branch})` : ""}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {selectedReturn.refund_payment_reference ? (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex justify-between items-center">
                      <span>Bank Reference ID:</span>
                      <span className="font-mono">{selectedReturn.refund_payment_reference}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Status Machine Transitions Bar */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
                    {selectedReturn.request_type === "replacement"
                      ? "Replacement & Exchange Workflow Actions"
                      : "Return & Refund Workflow Actions"}
                  </p>
                  <span className="text-[11px] font-mono text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
                    Current Status: {selectedReturn.status.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Replacement Workflow Action Buttons */}
                {selectedReturn.request_type === "replacement" ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-2">
                      {/* 1. Approve Replacement */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus("REPLACEMENT_APPROVED")}
                        disabled={isChangingStatus || selectedReturn.status !== "REPLACEMENT_REQUESTED"}
                        className="text-xs font-bold border-purple-300 text-purple-800 hover:bg-purple-100 disabled:opacity-40"
                      >
                        Approve Replacement
                      </Button>

                      {/* 1b. Create Replacement Order (if not already created) */}
                      {!selectedReturn.replacement_order_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCreateReplacementOrder}
                          disabled={
                            isChangingStatus ||
                            isCreatingOrder ||
                            selectedReturn.status === "REPLACEMENT_REQUESTED" ||
                            selectedReturn.status === "REJECTED" ||
                            selectedReturn.status === "CANCELLED" ||
                            selectedReturn.status === "REPLACEMENT_CLOSED" ||
                            selectedReturn.status === "RETURN_CLOSED"
                          }
                          className="text-xs font-bold border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 gap-1.5"
                        >
                          <Package className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{isCreatingOrder ? "Creating Order..." : "Create Replacement Order"}</span>
                        </Button>
                      )}

                      {/* 2. Schedule Doorstep Exchange */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenSchedulePickupModal}
                        disabled={
                          isChangingStatus ||
                          (selectedReturn.status !== "REPLACEMENT_APPROVED" &&
                            selectedReturn.status !== "OLD_PRODUCT_PICKUP_PENDING")
                        }
                        className="text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40 gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {selectedReturn.status === "OLD_PRODUCT_PICKUP_PENDING"
                            ? "Reschedule Exchange"
                            : "Schedule Doorstep Exchange"}
                        </span>
                      </Button>

                      {/* 3. Complete Same-Day Exchange (Simultaneous Handover) */}
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          handleUpdateStatus("REPLACEMENT_DELIVERED", {
                            pickupStatus: "PICKED_UP",
                            notes:
                              "Same-day doorstep exchange completed: Old product collected and replacement product delivered to customer.",
                          })
                        }
                        disabled={
                          isChangingStatus ||
                          (selectedReturn.status !== "OLD_PRODUCT_PICKUP_PENDING" &&
                            selectedReturn.status !== "OLD_PRODUCT_PICKED_UP" &&
                            selectedReturn.status !== "REPLACEMENT_DISPATCHED" &&
                            selectedReturn.status !== "REPLACEMENT_OUT_FOR_DELIVERY")
                        }
                        className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none disabled:opacity-40 gap-1.5 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Complete Same-Day Exchange (Handed Over)</span>
                      </Button>

                      {/* 4. Mark Old Product Picked Up (Staged flow) */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUpdateStatus("OLD_PRODUCT_PICKED_UP", {
                            pickupStatus: "PICKED_UP",
                            notes: "Old returned product collected from customer by courier.",
                          })
                        }
                        disabled={isChangingStatus || selectedReturn.status !== "OLD_PRODUCT_PICKUP_PENDING"}
                        className="text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Mark Old Product Picked Up
                      </Button>

                      {/* 5. Dispatch Replacement */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUpdateStatus("REPLACEMENT_DISPATCHED", {
                            notes: "Replacement package dispatched for customer delivery.",
                          })
                        }
                        disabled={
                          isChangingStatus ||
                          (selectedReturn.status !== "OLD_PRODUCT_PICKED_UP" &&
                            selectedReturn.status !== "OLD_PRODUCT_RECEIVED" &&
                            selectedReturn.status !== "REPLACEMENT_ORDER_CREATED")
                        }
                        className="text-xs font-bold border-indigo-300 text-indigo-800 hover:bg-indigo-50 disabled:opacity-40"
                      >
                        Dispatch Replacement
                      </Button>

                      {/* 6. Out for Delivery */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUpdateStatus("REPLACEMENT_OUT_FOR_DELIVERY", {
                            notes: "Replacement package out for delivery with local courier.",
                          })
                        }
                        disabled={isChangingStatus || selectedReturn.status !== "REPLACEMENT_DISPATCHED"}
                        className="text-xs font-bold border-blue-300 text-blue-800 hover:bg-blue-50 disabled:opacity-40"
                      >
                        Out for Delivery
                      </Button>

                      {/* 7. Close Replacement */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUpdateStatus("REPLACEMENT_CLOSED", {
                            notes: "Exchange lifecycle completed and archived by administrator.",
                          })
                        }
                        disabled={isChangingStatus || selectedReturn.status !== "REPLACEMENT_DELIVERED"}
                        className="text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Close Replacement
                      </Button>

                      {/* 8. Reject Replacement */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUpdateStatus("RETURN_REJECTED", {
                            notes: "Replacement request rejected by administrator.",
                          })
                        }
                        disabled={
                          isChangingStatus ||
                          selectedReturn.status === "REPLACEMENT_DELIVERED" ||
                          selectedReturn.status === "REPLACEMENT_CLOSED" ||
                          selectedReturn.status === "RETURN_REJECTED"
                        }
                        className="text-xs font-bold border-rose-300 text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                      >
                        Reject Replacement
                      </Button>
                    </div>

                    {/* Prerequisite Helper Guide */}
                    <div className="p-3 rounded-xl bg-white border border-blue-200 text-[11px] text-slate-600 flex items-start gap-2 shadow-2xs">
                      <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-900">
                          Workflow Guide ({selectedReturn.status.replace(/_/g, " ")}):
                        </span>{" "}
                        {selectedReturn.status === "REPLACEMENT_REQUESTED" && (
                          <span>
                            Next Action: Click <strong>[Approve Replacement]</strong> to authorize the exchange and unlock courier scheduling.
                          </span>
                        )}
                        {selectedReturn.status === "REPLACEMENT_APPROVED" && (
                          <span>
                            Next Action: Click <strong>[Schedule Doorstep Exchange]</strong> to set the same-day exchange pickup & delivery date/time slot.
                          </span>
                        )}
                        {selectedReturn.status === "OLD_PRODUCT_PICKUP_PENDING" && (
                          <span>
                            Next Action: Courier is scheduled. Click{" "}
                            <strong>[Complete Same-Day Exchange]</strong> upon simultaneous collection of the old product and handover of the new replacement items.
                          </span>
                        )}
                        {selectedReturn.status === "OLD_PRODUCT_PICKED_UP" && (
                          <span>
                            Old product collected. Click <strong>[Dispatch Replacement]</strong> or complete handover.
                          </span>
                        )}
                        {selectedReturn.status === "REPLACEMENT_DISPATCHED" && (
                          <span>
                            Replacement package dispatched. Click <strong>[Out for Delivery]</strong> or <strong>[Complete Same-Day Exchange]</strong> upon delivery.
                          </span>
                        )}
                        {selectedReturn.status === "REPLACEMENT_OUT_FOR_DELIVERY" && (
                          <span>
                            Package is out for delivery. Click <strong>[Complete Same-Day Exchange]</strong> upon customer handover.
                          </span>
                        )}
                        {selectedReturn.status === "REPLACEMENT_DELIVERED" && (
                          <span>
                            Exchange verified and completed. Any price difference wallet credit has been credited. Click <strong>[Close Replacement]</strong> to archive.
                          </span>
                        )}
                        {selectedReturn.status === "REPLACEMENT_CLOSED" && (
                          <span>This exchange lifecycle has reached its final state and is closed.</span>
                        )}
                        {selectedReturn.status === "RETURN_REJECTED" && (
                          <span>This request has been rejected. No further actions permitted.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Return & Refund Workflow Action Buttons */
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus("RETURN_APPROVED")}
                        disabled={isChangingStatus || selectedReturn.status !== "RETURN_REQUESTED"}
                        className="text-xs font-bold border-blue-300 text-blue-800 hover:bg-blue-100 disabled:opacity-40"
                      >
                        Approve Return
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenSchedulePickupModal}
                        disabled={
                          isChangingStatus ||
                          (selectedReturn.status !== "RETURN_APPROVED" &&
                            selectedReturn.status !== "RETURN_PICKUP_SCHEDULED")
                        }
                        className="text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40 gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {selectedReturn.status === "RETURN_PICKUP_SCHEDULED"
                            ? "Reschedule Pickup"
                            : "Schedule Pickup"}
                        </span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus("RETURN_PICKED_UP")}
                        disabled={isChangingStatus || selectedReturn.status !== "RETURN_PICKUP_SCHEDULED"}
                        className="text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Mark Picked Up
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus("RETURN_INSPECTION")}
                        disabled={
                          isChangingStatus ||
                          (selectedReturn.status !== "RETURN_RECEIVED_BY_SELLER" &&
                            selectedReturn.status !== "RETURN_PICKED_UP")
                        }
                        className="text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Quality Inspection
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus("REFUND_PROCESSING")}
                        disabled={
                          isChangingStatus ||
                          (selectedReturn.status !== "RETURN_INSPECTION" &&
                            selectedReturn.status !== "RETURN_RECEIVED_BY_SELLER")
                        }
                        className="text-xs font-bold border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                      >
                        Approve Refund (Pending Bank)
                      </Button>

                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setRefundAmountInput(selectedReturn.refund_amount || 0);
                          setRefundRefInput("");
                          setRefundNotesInput("");
                          setPaymentDateInput(new Date().toISOString().slice(0, 16));
                          setRefundError(null);
                          setIsRefundModalOpen(true);
                        }}
                        disabled={isChangingStatus || selectedReturn.status !== "REFUND_PROCESSING"}
                        className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none disabled:opacity-40 gap-1.5 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Complete Refund (Disbursed)</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus("RETURN_REJECTED")}
                        disabled={
                          isChangingStatus ||
                          selectedReturn.status === "REFUND_COMPLETED" ||
                          selectedReturn.status === "RETURN_REJECTED" ||
                          selectedReturn.status === "RETURN_CLOSED"
                        }
                        className="text-xs font-bold border-rose-300 text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                      >
                        Reject Return
                      </Button>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-blue-200 text-[11px] text-slate-600 flex items-start gap-2 shadow-2xs">
                      <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-900">
                          Workflow Guide ({selectedReturn.status.replace(/_/g, " ")}):
                        </span>{" "}
                        {selectedReturn.status === "RETURN_REQUESTED" && (
                          <span>Next Action: Click <strong>[Approve Return]</strong> to authorize return and schedule pickup.</span>
                        )}
                        {selectedReturn.status === "RETURN_APPROVED" && (
                          <span>Next Action: Click <strong>[Schedule Pickup]</strong> to assign doorstep courier collection.</span>
                        )}
                        {selectedReturn.status === "RETURN_PICKUP_SCHEDULED" && (
                          <span>Next Action: Click <strong>[Mark Picked Up]</strong> when package is collected by courier.</span>
                        )}
                        {selectedReturn.status === "RETURN_PICKED_UP" && (
                          <span>Awaiting merchant facility arrival. Merchant can confirm arrival in Seller Hub.</span>
                        )}
                        {selectedReturn.status === "RETURN_RECEIVED_BY_SELLER" && (
                          <span>Next Action: Click <strong>[Quality Inspection]</strong> or approve refund.</span>
                        )}
                        {selectedReturn.status === "RETURN_INSPECTION" && (
                          <span>Next Action: Click <strong>[Approve Refund]</strong> to queue disbursement.</span>
                        )}
                        {selectedReturn.status === "REFUND_PROCESSING" && (
                          <span>Next Action: Disburse funds and click <strong>[Complete Refund]</strong> with bank reference.</span>
                        )}
                        {selectedReturn.status === "REFUND_COMPLETED" && (
                          <span>Refund has been disbursed and confirmed. Lifecycle is complete.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit Trail */}
              {auditLogs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Audit Trail & History
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar border border-slate-200 p-3 rounded-xl bg-slate-50">
                    {auditLogs.map((log: Record<string, unknown>, i: number) => (
                      <div key={i} className="text-[11px] flex items-start justify-between py-1 border-b border-slate-200/60 last:border-none">
                        <div>
                          <span className="font-bold text-slate-800">{String(log.action || "")}</span>
                          {log.notes ? (
                            <span className="text-slate-500 ml-1.5">• {String(log.notes)}</span>
                          ) : null}
                        </div>
                        <span className="text-slate-400 shrink-0 font-mono">
                          {formatExactDateTime(log.created_at as string)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/60">
              <Button variant="outline" size="sm" onClick={() => setSelectedReturn(null)} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Refund Confirmation Dialog */}
      {isRefundModalOpen && selectedReturn && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Confirm Refund Disbursement
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Return #{selectedReturn.return_number} • Order #{selectedReturn.orders?.order_number}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteRefund} className="p-6 space-y-4 text-xs">
              {/* Financial Destination Details Summary */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Refund Amount:</span>
                  <span className="font-black text-emerald-600 text-base">
                    {formatCurrency(selectedReturn.refund_amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="text-slate-500">Refund Method:</span>
                  <span className="font-bold text-slate-900">{selectedReturn.refund_method || "UPI / Bank"}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="text-slate-500">Destination Account:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedReturn.refund_method === "UPI"
                      ? selectedReturn.refund_details?.upiId || "UPI VPA"
                      : selectedReturn.refund_details?.accountNumber
                      ? `A/C: ${selectedReturn.refund_details.accountNumber} (${selectedReturn.refund_details.ifscCode || ""})`
                      : "Direct Bank Transfer"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="text-slate-500">Current Lifecycle Status:</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    {selectedReturn.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Crucial External Disbursement Notice */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900 leading-relaxed">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold mb-0.5">External Disbursement Required:</strong>
                  The administrator must first actually transfer the funds externally (via Corporate NetBanking, Bank Portal, or UPI Business Gateway) to the customer destination account before completing this record. This action marks the refund as officially disbursed and completed.
                </div>
              </div>

              {refundError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {refundError}
                </div>
              )}

              {/* UTR Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Bank / UPI Payment Reference ID (UTR / Transaction ID) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR/HDFC8291038102 or UPI/592019382190"
                  value={refundRefInput}
                  onChange={(e) => {
                    setRefundRefInput(e.target.value);
                    if (refundError) setRefundError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-600 font-bold"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Enter the authoritative payment UTR or transaction reference provided by your banking provider.
                </p>
              </div>

              {/* Payment Date & Time Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Disbursement Date & Time (IST)
                </label>
                <input
                  type="datetime-local"
                  value={paymentDateInput}
                  onChange={(e) => setPaymentDateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* Optional Admin Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Disbursement Notes / Reference Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Disbursed via HDFC Corporate Banking portal"
                  value={refundNotesInput}
                  onChange={(e) => setRefundNotesInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRefundModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isProcessingRefund || !refundRefInput.trim()}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none gap-1.5"
                >
                  {isProcessingRefund ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Confirm Refund Disbursed</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Return Pickup Dialog */}
      {isSchedulePickupModalOpen && selectedReturn && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {selectedReturn.request_type === "replacement" ? "Schedule Doorstep Exchange" : "Schedule Return Pickup"}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedReturn.request_type === "replacement" ? "Exchange" : "Return"} #{selectedReturn.return_number} • Order #{selectedReturn.orders?.order_number}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSchedulePickupModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSchedulePickup} className="p-6 space-y-4 text-xs">
              {/* Pickup Fulfillment Context Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Customer</span>
                    <strong className="text-slate-900">{selectedReturn.customer?.full_name || "Customer"}</strong>
                    <span className="block text-[11px] text-slate-500">{selectedReturn.customer?.phone || selectedReturn.customer?.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Selling Merchant</span>
                    <strong className="text-slate-900">{selectedReturn.seller?.business_name || "Merchant"}</strong>
                    <span className="block text-[11px] text-slate-500">{selectedReturn.seller?.business_email}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-slate-700">
                  <span>{selectedReturn.request_type === "replacement" ? "Original Item to Collect:" : "Product to Collect:"}</span>
                  <strong className="text-slate-900 truncate max-w-[220px]">
                    {selectedReturn.products?.title} (Qty: {selectedReturn.quantity})
                  </strong>
                </div>

                {selectedReturn.request_type === "replacement" && selectedReturn.refund_details?.replacementItems && (
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-purple-700">
                    <span>Replacement to Hand Over:</span>
                    <strong className="truncate max-w-[220px]">
                      {selectedReturn.refund_details.replacementItems.length} product(s) ({selectedReturn.replacement_quantity || 1} units)
                    </strong>
                  </div>
                )}
              </div>

              {pickupError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {pickupError}
                </div>
              )}

              {/* Date & Time Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Pickup Date (IST) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={pickupDateInput}
                    onChange={(e) => {
                      setPickupDateInput(e.target.value);
                      if (pickupError) setPickupError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Pickup Time Window (IST) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={pickupTimeInput}
                    onChange={(e) => {
                      setPickupTimeInput(e.target.value);
                      if (pickupError) setPickupError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-600"
                    required
                  />
                </div>
              </div>

              {/* Pickup Instructions / Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Pickup Instructions / Courier Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Collect product with original packaging and invoice copy."
                  value={pickupNoteInput}
                  onChange={(e) => setPickupNoteInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSchedulePickupModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSchedulingPickup || !pickupDateInput || !pickupTimeInput}
                  className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white border-none gap-1.5"
                >
                  {isSchedulingPickup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  <span>Confirm Schedule Pickup</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
