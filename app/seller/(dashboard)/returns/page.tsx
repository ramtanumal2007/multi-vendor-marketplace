"use client";

import React, { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  RotateCcw,
  RefreshCw,
  Package,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Loader2,
  Search,
  Store,
  Eye,
  X,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatExactDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface SellerReturnItem {
  id: string;
  return_number: string;
  request_type: "return" | "replacement";
  order_id: string;
  order_item_id: string;
  seller_id?: string;
  replacement_seller_id?: string;
  quantity: number;
  reason_code: string;
  reason_text?: string;
  status: string;
  seller_received_at?: string;
  pickup_status?: string;
  pickup_scheduled_date?: string;
  created_at: string;
  updated_at: string;
  refund_details?: {
    replacementItems?: Array<{
      productId: string;
      title?: string;
      productTitle?: string;
      sku?: string;
      imageUrl?: string;
      image?: string;
      quantity: number;
      price?: number;
      unitPrice?: number;
      unit_price?: number;
      lineTotal?: number;
      sellerId?: string;
      storeId?: string;
      storeName?: string;
    }>;
  };
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
  };
  replacement_product?: {
    id: string;
    title: string;
    sku?: string;
    price: number;
    product_images?: Array<{ image_url: string }>;
  };
}

export default function SellerReturnsPage() {
  const { addToast } = useToast();

  const [returns, setReturns] = useState<SellerReturnItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Confirm Received Action State
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // View Details Drawer
  const [activeReturn, setActiveReturn] = useState<SellerReturnItem | null>(null);
  const [sellerAuditLogs, setSellerAuditLogs] = useState<Array<Record<string, unknown>>>([]);

  const handleViewDetails = async (r: SellerReturnItem) => {
    setActiveReturn(r);
    setSellerAuditLogs([]);
    try {
      const res = await fetch(`/api/returns/${r.id}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.auditLogs)) {
        setSellerAuditLogs(data.auditLogs);
      }
    } catch {
      // ignore
    }
  };

  const loadSellerReturns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/seller/returns");
      const data = await res.json();
      if (data.success && Array.isArray(data.returns)) {
        setReturns(data.returns);
      } else {
        addToast({ title: "Error loading returns", description: data.message, type: "error" });
      }
    } catch {
      addToast({ title: "Network error", description: "Failed to load returns list.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadSellerReturns();
  }, [loadSellerReturns]);

  const handleConfirmReceived = async (returnId: string) => {
    setConfirmingId(returnId);
    try {
      const res = await fetch(`/api/seller/returns/${returnId}/received`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to confirm receipt.");
      }

      addToast({
        title: "Product Received Confirmed",
        description: "Physical product receipt recorded. Admin quality inspection is notified.",
        type: "success",
      });

      // Update state locally
      setReturns((prev) =>
        prev.map((r) =>
          r.id === returnId
            ? {
                ...r,
                status: data.newStatus || "RETURN_RECEIVED_BY_SELLER",
                seller_received_at: new Date().toISOString(),
              }
            : r
        )
      );

      if (activeReturn && activeReturn.id === returnId) {
        setActiveReturn((prev) =>
          prev
            ? {
                ...prev,
                status: data.newStatus || "RETURN_RECEIVED_BY_SELLER",
                seller_received_at: new Date().toISOString(),
              }
            : null
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record receipt.";
      addToast({ title: "Action Failed", description: msg, type: "error" });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDispatchReplacement = async (returnId: string) => {
    setDispatchingId(returnId);
    try {
      const res = await fetch(`/api/seller/returns/${returnId}/dispatch`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to record dispatch.");
      }

      addToast({
        title: "Replacement Dispatched",
        description: "Replacement package dispatched. Admin and customer tracking updated.",
        type: "success",
      });

      setReturns((prev) =>
        prev.map((r) =>
          r.id === returnId
            ? {
                ...r,
                status: data.newStatus || "REPLACEMENT_DISPATCHED",
              }
            : r
        )
      );

      if (activeReturn && activeReturn.id === returnId) {
        setActiveReturn((prev) =>
          prev
            ? {
                ...prev,
                status: data.newStatus || "REPLACEMENT_DISPATCHED",
              }
            : null
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record dispatch.";
      addToast({ title: "Action Failed", description: msg, type: "error" });
    } finally {
      setDispatchingId(null);
    }
  };

  const filteredReturns = returns.filter((r) => {
    if (statusFilter !== "ALL") {
      if (statusFilter === "PENDING_RECEIPT") {
        if (
          r.status === "RETURN_RECEIVED_BY_SELLER" ||
          r.status === "OLD_PRODUCT_RECEIVED" ||
          r.status === "REFUND_COMPLETED" ||
          r.status === "RETURN_CLOSED"
        ) {
          return false;
        }
      } else if (statusFilter === "RECEIVED") {
        if (r.status !== "RETURN_RECEIVED_BY_SELLER" && r.status !== "OLD_PRODUCT_RECEIVED") {
          return false;
        }
      } else if (r.status !== statusFilter) {
        return false;
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const retNum = (r.return_number || "").toLowerCase();
      const ordNum = (r.orders?.order_number || "").toLowerCase();
      const prodTitle = (r.products?.title || "").toLowerCase();
      return retNum.includes(q) || ordNum.includes(q) || prodTitle.includes(q);
    }

    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-blue-600" />
            <span>Returns & Replacements</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitor incoming customer returns and acknowledge physical arrival at your store facility.
          </p>
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={loadSellerReturns}
          disabled={isLoading}
          className="text-xs font-semibold gap-1.5 self-start sm:self-auto"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Refresh List</span>
        </Button>
      </div>

      {/* Seller Role Notice */}
      <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
        <Store className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Merchant Workflow Rules:</p>
          <p className="text-blue-800 leading-relaxed">
            When returned packages physically reach your warehouse, click{" "}
            <strong>[Confirm Product Received]</strong>. In accordance with marketplace security and customer privacy policies, customer banking credentials, UPI VPAs, and final refund disbursements are centrally governed by VENDOSMITH Admin.
          </p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Return #, Order #, or Product..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "ALL", label: "All Returns" },
            { id: "PENDING_RECEIPT", label: "Awaiting Arrival" },
            { id: "RECEIVED", label: "Received by Seller" },
            { id: "REFUND_COMPLETED", label: "Completed" },
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

      {/* Returns Table / Cards */}
      {isLoading ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-200">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading merchant returns...</p>
        </div>
      ) : filteredReturns.length === 0 ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-dashed border-slate-200">
          <Package className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-base text-slate-800">No return requests found</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {searchQuery
              ? "No returns matched your search criteria."
              : "No customer returns or replacements have been initiated for your store catalog."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Return Number</th>
                  <th className="px-6 py-4">Order & Date</th>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Reason</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Physical Receipt</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredReturns.map((r) => {
                  const isReceived =
                    r.status === "RETURN_RECEIVED_BY_SELLER" ||
                    r.status === "OLD_PRODUCT_RECEIVED" ||
                    Boolean(r.seller_received_at);

                  const isProcessing = confirmingId === r.id;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Return Number & Type */}
                      <td className="px-6 py-4">
                        <div className="font-bold font-mono text-slate-900">{r.return_number}</div>
                        <div className="text-[10px] uppercase font-bold text-blue-600 mt-0.5">
                          {r.request_type === "replacement" ? "Replacement" : "Return & Refund"}
                        </div>
                      </td>

                      {/* Order & Date */}
                      <td className="px-6 py-4">
                        <div className="font-mono text-slate-900 font-semibold">
                          #{r.orders?.order_number}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatExactDateTime(r.created_at)}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="px-6 py-4">
                        {r.refund_details?.replacementItems && r.refund_details.replacementItems.length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-10 h-10 rounded-lg bg-purple-50 relative overflow-hidden shrink-0 border border-purple-200 flex items-center justify-center">
                                {r.refund_details.replacementItems[0]?.imageUrl ||
                                r.refund_details.replacementItems[0]?.image ? (
                                  <Image
                                    src={
                                      (r.refund_details.replacementItems[0].imageUrl ||
                                        r.refund_details.replacementItems[0].image) as string
                                    }
                                    alt={
                                      r.refund_details.replacementItems[0].title ||
                                      r.refund_details.replacementItems[0].productTitle ||
                                      ""
                                    }
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <Package className="w-5 h-5 text-purple-600" />
                                )}
                              </div>
                              <div className="min-w-0 max-w-xs">
                                <p className="font-bold text-slate-900 truncate">
                                  {r.refund_details.replacementItems[0]?.title ||
                                    r.refund_details.replacementItems[0]?.productTitle}
                                </p>
                                <p className="text-[11px] text-purple-700 font-semibold">
                                  Fulfill Replacement:{" "}
                                  <strong>
                                    {r.refund_details.replacementItems.reduce(
                                      (acc, it) => acc + (it.quantity || 1),
                                      0
                                    )}{" "}
                                    unit(s)
                                  </strong>
                                  {r.refund_details.replacementItems.length > 1
                                    ? ` (${r.refund_details.replacementItems.length} products)`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            {r.products?.title && (
                              <p className="text-[10px] text-slate-400 pl-1 truncate max-w-xs">
                                Return item: {r.products.title}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 relative overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                              {r.products?.product_images?.[0]?.image_url ? (
                                <Image
                                  src={r.products.product_images[0].image_url}
                                  alt={r.products?.title || ""}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <Package className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0 max-w-xs">
                              <p className="font-bold text-slate-900 truncate">{r.products?.title}</p>
                              <p className="text-[11px] text-slate-500">
                                Qty: <strong>{r.quantity}</strong> • SKU: {r.products?.sku || "N/A"}
                              </p>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800">
                          {(r.reason_code || "").replace(/_/g, " ")}
                        </span>
                        {r.reason_text && (
                          <p className="text-[11px] text-slate-500 italic max-w-xs truncate mt-0.5">
                            &quot;{r.reason_text}&quot;
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isReceived
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : r.status === "RETURN_PICKED_UP"
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Physical Receipt Status */}
                      <td className="px-6 py-4">
                        {isReceived ? (
                          <div className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Received</span>
                          </div>
                        ) : (
                          <div className="text-amber-700 font-medium flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>In Transit / Pending</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewDetails(r)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                            title="View Return Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {!isReceived && r.request_type !== "replacement" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmReceived(r.id)}
                              disabled={isProcessing}
                              className="h-8 text-xs font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-50 gap-1"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                              <span>Confirm Product Received</span>
                            </Button>
                          )}

                          {r.refund_details?.replacementItems &&
                            r.refund_details.replacementItems.length > 0 &&
                            (r.status === "REPLACEMENT_DISPATCHED" ? (
                              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200">
                                Dispatched
                              </span>
                            ) : r.status === "REPLACEMENT_DELIVERED" || r.status === "REPLACEMENT_CLOSED" ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                Delivered
                              </span>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDispatchReplacement(r.id)}
                                disabled={dispatchingId === r.id}
                                className="h-8 text-xs font-bold border-purple-300 text-purple-800 hover:bg-purple-50 gap-1"
                              >
                                {dispatchingId === r.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Package className="w-3.5 h-3.5 text-purple-600" />
                                )}
                                <span>Dispatch Replacement</span>
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Return Details Drawer Modal */}
      {activeReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Return Details #{activeReturn.return_number}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Order #{activeReturn.orders?.order_number}
                </p>
              </div>
              <button
                onClick={() => setActiveReturn(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Product */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-white relative overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                  {activeReturn.products?.product_images?.[0]?.image_url ? (
                    <Image
                      src={activeReturn.products.product_images[0].image_url}
                      alt={activeReturn.products.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{activeReturn.products?.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Quantity: {activeReturn.quantity} • SKU: {activeReturn.products?.sku || "N/A"}
                  </p>
                </div>
              </div>

              {/* Reason */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                  Customer Return Reason
                </p>
                <p className="font-bold text-slate-900">
                  {(activeReturn.reason_code || "").replace(/_/g, " ")}
                </p>
                {activeReturn.reason_text && (
                  <p className="text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200/60 mt-1">
                    &quot;{activeReturn.reason_text}&quot;
                  </p>
                )}
              </div>

              {/* Assigned Replacement Products to Fulfill */}
              {activeReturn.refund_details?.replacementItems && activeReturn.refund_details.replacementItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-blue-900 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin-reverse" />
                      Assigned Replacement Products to Fulfill ({activeReturn.refund_details.replacementItems.length})
                    </p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Seller Action Required
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activeReturn.refund_details.replacementItems.map((item, idx) => (
                      <div
                        key={item.productId || idx}
                        className="p-3 bg-white rounded-xl border border-blue-100 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 relative overflow-hidden shrink-0 flex items-center justify-center">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={item.title || item.productTitle || "Replacement Product"}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate max-w-[200px]">
                              {item.title || item.productTitle || "Replacement Product"}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              SKU: {item.sku || "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[10px] font-bold text-slate-500">Qty:</span>
                            <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              {item.quantity}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                            ₹{(((item.price ?? item.unitPrice ?? item.unit_price) || 0) * item.quantity).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Status:</span>
                  <span className="font-bold text-slate-900">{activeReturn.status.replace(/_/g, " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pickup Status:</span>
                  <span className="font-semibold text-slate-800">{activeReturn.pickup_status || "PENDING"}</span>
                </div>
                {activeReturn.pickup_scheduled_date && (
                  <div className="flex justify-between text-blue-700">
                    <span className="text-slate-500">Pickup Scheduled For:</span>
                    <span className="font-semibold">{formatExactDateTime(activeReturn.pickup_scheduled_date)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Seller Arrival Status:</span>
                  <span className="font-semibold text-slate-800">
                    {activeReturn.seller_received_at ? `Received (${formatExactDateTime(activeReturn.seller_received_at)})` : "Pending Arrival"}
                  </span>
                </div>
              </div>

              {/* Lifecycle Timeline */}
              {sellerAuditLogs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                    Lifecycle Timeline
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar border border-slate-200 p-3 rounded-xl bg-slate-50">
                    {sellerAuditLogs.map((log: Record<string, unknown>, i: number) => (
                      <div key={i} className="text-[11px] flex items-start justify-between py-1 border-b border-slate-200/60 last:border-none">
                        <div>
                          <span className="font-bold text-slate-800">{String(log.action || "").replace(/_/g, " ")}</span>
                          {log.notes ? (
                            <span className="text-slate-500 ml-1.5">• {String(log.notes)}</span>
                          ) : null}
                        </div>
                        <span className="text-slate-400 shrink-0 font-mono text-[10px]">
                          {formatExactDateTime(log.created_at as string)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strict Privacy Notice */}
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Customer refund bank/UPI details and financial disbursement channels are protected and managed centrally by VENDOSMITH Finance.
                </span>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <Button variant="outline" size="sm" onClick={() => setActiveReturn(null)} className="text-xs">
                Close
              </Button>

              <div className="flex items-center gap-2">
                {activeReturn.status.startsWith("REPLACEMENT_") &&
                  ["REPLACEMENT_APPROVED", "REPLACEMENT_SCHEDULED", "OLD_PRODUCT_PICKED_UP", "REPLACEMENT_IN_TRANSIT"].includes(activeReturn.status) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleDispatchReplacement(activeReturn.id)}
                      disabled={dispatchingId === activeReturn.id}
                      className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white border-none gap-1.5"
                    >
                      {dispatchingId === activeReturn.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Truck className="w-3.5 h-3.5" />
                      )}
                      <span>Dispatch Replacement</span>
                    </Button>
                  )}

                {!activeReturn.seller_received_at && !activeReturn.status.startsWith("REPLACEMENT_") && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleConfirmReceived(activeReturn.id)}
                    disabled={confirmingId === activeReturn.id}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none gap-1.5"
                  >
                    {confirmingId === activeReturn.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Product Received</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
