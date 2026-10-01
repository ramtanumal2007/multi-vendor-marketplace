"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Store as StoreIcon,
  CheckCircle,
  XCircle,
  AlertCircle,
  Award,
  Zap,
  MapPin,
  User,
  Package,
  ExternalLink,
  ShoppingBag,
  RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  formatSequentialSellerId,
  normalizeInternalStatus,
} from "@/lib/utils";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";

interface SellerDetailsModalProps {
  sellerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer?: (customerId: string) => void;
  onSelectOrder?: (orderId: string) => void;
  onRefresh?: () => void;
}

interface SellerProfile {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  business_email: string | null;
  business_type: string | null;
  verification_status: string;
  approved_at: string | null;
  membership_plan: string | null;
  seller_level: string | null;
  seller_score: number | null;
  created_at: string;
  seller_id_code?: string;
  rejection_reason?: string | null;
  rejection_note?: string | null;
  correction_reason?: string | null;
  correction_note?: string | null;
  reviewed_at?: string | null;
  resubmitted_at?: string | null;
}

interface StoreInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  status: string;
  tax_gst_number: string | null;
}

interface IncomingOrder {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  total_seller_amount: number;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
  items_summary: string;
}

export function SellerDetailsModal({
  sellerId,
  isOpen,
  onClose,
  onSelectCustomer,
  onRefresh,
}: SellerDetailsModalProps) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [incomingOrders, setIncomingOrders] = useState<IncomingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Action Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<
    "approve" | "reject" | "return_for_correction" | "reconsider" | "suspend" | "unsuspend"
  >("approve");
  const [actionReason, setActionReason] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen && sellerId) {
      fetchSellerDetails(sellerId);
    } else {
      setSeller(null);
      setStore(null);
      setIncomingOrders([]);
    }
  }, [isOpen, sellerId]);

  const fetchSellerDetails = async (id: string) => {
    setIsLoading(true);

    try {
      // 1. Fetch Seller Profile
      const { data: sellerData, error: sellerErr } = await supabase
        .from("seller_profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (sellerErr) throw sellerErr;
      setSeller(sellerData);

      // 2. Fetch Store Info
      const { data: storeData } = await supabase
        .from("stores")
        .select("*")
        .eq("seller_id", id)
        .single();

      setStore(storeData || null);

      // 3. Fetch Incoming Orders for Seller's store
      if (storeData?.id) {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("order_id, line_total, title, quantity, orders(id, order_number, user_id, email, shipping_address, payment_status, fulfillment_status, created_at)")
          .eq("store_id", storeData.id);

        if (orderItems && orderItems.length > 0) {
          interface RawOrderDetails {
            id: string;
            order_number: string;
            user_id: string | null;
            email?: string;
            shipping_address?: { first_name?: string; last_name?: string; phone?: string } | null;
            payment_status: string;
            fulfillment_status: string;
            created_at: string;
          }

          interface OrderItemRow {
            order_id: string;
            line_total: number;
            title: string;
            quantity: number;
            orders: RawOrderDetails | RawOrderDetails[] | null;
          }

          const orderMap = new Map<string, {
            ord: RawOrderDetails;
            totalSellerAmount: number;
            items: string[];
          }>();

          ((orderItems || []) as unknown as OrderItemRow[]).forEach((item) => {
            const ord = Array.isArray(item.orders) ? item.orders[0] : item.orders;
            if (!ord) return;

            const current = orderMap.get(ord.id) || {
              ord,
              totalSellerAmount: 0,
              items: [],
            };

            current.totalSellerAmount += Number(item.line_total || 0);
            current.items.push(`${item.title} (${item.quantity}x)`);
            orderMap.set(ord.id, current);
          });

          // Fetch profiles for customer names
          const userIds = Array.from(orderMap.values())
            .map((v) => v.ord.user_id)
            .filter(Boolean) as string[];

          const profilesMap = new Map<string, { full_name: string; phone: string }>();
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, full_name, phone")
              .in("id", userIds);

            ((profiles || []) as Array<{ id: string; full_name?: string | null; phone?: string | null }>).forEach((p) => {
              profilesMap.set(p.id, { full_name: p.full_name || "", phone: p.phone || "" });
            });
          }

          const enriched: IncomingOrder[] = Array.from(orderMap.values()).map(({ ord, totalSellerAmount, items }) => {
            const ship = ord.shipping_address || {};
            const custProfile = ord.user_id ? profilesMap.get(ord.user_id) : null;
            const customerName = custProfile?.full_name || `${ship.first_name || ""} ${ship.last_name || ""}`.trim() || "Customer";
            const customerPhone = custProfile?.phone || ship.phone || "—";

            return {
              id: ord.id,
              order_number: ord.order_number,
              user_id: ord.user_id,
              customer_name: customerName,
              customer_email: ord.email,
              customer_phone: customerPhone,
              total_seller_amount: totalSellerAmount,
              payment_status: ord.payment_status,
              fulfillment_status: ord.fulfillment_status,
              created_at: ord.created_at,
              items_summary: items.join(", "),
            };
          });

          // Sort default: Newest orders first
          enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setIncomingOrders(enriched);
        } else {
          setIncomingOrders([]);
        }
      } else {
        setIncomingOrders([]);
      }
    } catch (err: unknown) {
      const errObj = err as Error;
      addToast({
        title: "Error",
        description: errObj.message || "Failed to load seller details.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = (
    action: "approve" | "reject" | "return_for_correction" | "reconsider" | "suspend" | "unsuspend"
  ) => {
    setDialogAction(action);
    setActionReason("");
    setActionNote("");
    setDialogOpen(true);
  };

  const executeAction = async () => {
    if (!seller) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/admin/sellers/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: seller.id,
          action: dialogAction,
          reason: actionReason.trim(),
          note: actionNote.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process seller action.");
      }

      addToast({
        title: "Success",
        description: data.message || "Action processed successfully.",
        type: "success",
      });

      setDialogOpen(false);
      await fetchSellerDetails(seller.id);
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Action failed.";

      addToast({
        title: "Error",
        description: message,
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  // Compute Order Metrics
  const totalOrdersCount = incomingOrders.length;
  const totalSalesAmount = incomingOrders.reduce((sum, o) => sum + o.total_seller_amount, 0);
  const pendingCount = incomingOrders.filter((o) =>
    ["pending", "ORDERED"].includes(normalizeInternalStatus(o.fulfillment_status))
  ).length;
  const processingCount = incomingOrders.filter((o) =>
    ["CONFIRMED", "READY TO DISPATCH", "processing"].includes(normalizeInternalStatus(o.fulfillment_status))
  ).length;
  const shippedCount = incomingOrders.filter((o) =>
    ["SHIPPED", "IN TRANSIT", "OUT FOR DELIVERY", "shipped"].includes(normalizeInternalStatus(o.fulfillment_status))
  ).length;
  const deliveredCount = incomingOrders.filter(
    (o) => normalizeInternalStatus(o.fulfillment_status) === "DELIVERED"
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-6 relative overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Seller & Store Details"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
              <StoreIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">
                  {seller?.business_name || store?.name || "Seller Profile"}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    seller?.verification_status === "approved"
                      ? "bg-green-100 text-green-800 border border-green-200"
                      : seller?.verification_status === "pending" || seller?.verification_status === "under_review"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-red-100 text-red-800 border border-red-200"
                  }`}
                >
                  {seller?.verification_status || "Pending"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Store: {store?.name || "No Store"} • ID: {formatSequentialSellerId(0, seller?.seller_id_code)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading seller details...
            </div>
          ) : seller ? (
            <>
              {/* Seller & Store Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Seller Information */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                    <User className="w-4 h-4 text-indigo-600" /> Seller Information
                  </h3>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-slate-400 block font-medium">Owner Name</span>
                      <span className="font-semibold text-slate-800">{seller.contact_name || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Business Email</span>
                      <span className="font-semibold text-slate-800 truncate block">{seller.business_email || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Phone Number</span>
                      <span className="font-semibold text-slate-800">{seller.phone || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Business Type</span>
                      <span className="font-semibold text-slate-800 capitalize">{seller.business_type || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Membership Plan</span>
                      <span className="font-bold text-indigo-700 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        {seller.membership_plan || "BASIC"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Seller Level & Score</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-purple-600" />
                        {seller.seller_level || "New Seller"} ({seller.seller_score || 50} pts)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Approval Date</span>
                      <span className="font-semibold text-slate-800">
                        {seller.approved_at ? formatExactDateTime(seller.approved_at) : "Pending"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Applied On</span>
                      <span className="font-semibold text-slate-800">{formatExactDateTime(seller.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Store Information */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                    <StoreIcon className="w-4 h-4 text-emerald-600" /> Store Information
                  </h3>
                  {store ? (
                    <div className="space-y-2 pt-1">
                      <div>
                        <span className="text-slate-400 block font-medium">Store Name & Slug</span>
                        <span className="font-bold text-slate-800">{store.name}</span>
                        <span className="text-slate-500 font-mono text-[11px] block">/{store.slug}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Address</span>
                        <span className="font-semibold text-slate-800 flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          {[store.address_line1, store.address_line2, store.city, store.state, store.postal_code]
                            .filter(Boolean)
                            .join(", ") || "No store address provided"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block font-medium">GST / Tax Number</span>
                          <span className="font-mono font-semibold text-slate-800">{store.tax_gst_number || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Store Status</span>
                          <span className="font-semibold text-emerald-700 capitalize">{store.status || "draft"}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 italic">No store registered for this seller yet.</div>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" /> Seller Order Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                  <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Total Sales</div>
                    <div className="font-bold text-indigo-700 text-sm mt-0.5">{formatCurrency(totalSalesAmount)}</div>
                  </div>
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Total Orders</div>
                    <div className="font-bold text-blue-700 text-sm mt-0.5">{totalOrdersCount}</div>
                  </div>
                  <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Pending</div>
                    <div className="font-bold text-amber-700 text-sm mt-0.5">{pendingCount}</div>
                  </div>
                  <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Confirmed / Prep</div>
                    <div className="font-bold text-purple-700 text-sm mt-0.5">{processingCount}</div>
                  </div>
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Shipped / Transit</div>
                    <div className="font-bold text-blue-700 text-sm mt-0.5">{shippedCount}</div>
                  </div>
                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Delivered</div>
                    <div className="font-bold text-emerald-700 text-sm mt-0.5">{deliveredCount}</div>
                  </div>
                </div>
              </div>

              {/* Incoming Orders Section */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" /> Incoming Orders ({incomingOrders.length})
                </h3>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {incomingOrders.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No incoming orders received by this seller yet.
                    </div>
                  ) : (
                    incomingOrders.map((ord) => {
                      const normStatus = normalizeInternalStatus(ord.fulfillment_status);

                      return (
                        <div
                          key={ord.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:bg-slate-100/80 transition-colors"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">#{ord.order_number}</span>
                              <span className="text-slate-400 text-[11px]">
                                • {formatExactDateTime(ord.created_at)}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                ({formatRelativeTime(ord.created_at)})
                              </span>
                            </div>

                            <div className="text-slate-600 text-[11px] truncate">{ord.items_summary}</div>

                            {/* Customer Link */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-500 font-medium">Customer:</span>
                              {ord.user_id ? (
                                <button
                                  onClick={() => onSelectCustomer && onSelectCustomer(ord.user_id!)}
                                  className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                                >
                                  {ord.customer_name}
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              ) : (
                                <span className="font-semibold text-slate-700">{ord.customer_name}</span>
                              )}
                              <span className="text-slate-400 text-[10px]">({ord.customer_phone})</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    ord.payment_status === "paid"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {ord.payment_status}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    normStatus === "DELIVERED"
                                      ? "bg-green-100 text-green-800"
                                      : normStatus === "CANCELLED"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-indigo-100 text-indigo-800"
                                  }`}
                                >
                                  {normStatus}
                                </span>
                              </div>
                              <span className="font-bold text-slate-900 text-sm">
                                {formatCurrency(ord.total_seller_amount)}
                              </span>
                            </div>

                            <Link href={`/admin/orders/${ord.id}`}>
                              <Button variant="outline" size="sm">
                                View Order
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">Seller profile not found.</div>
          )}
        </div>

        {/* Footer with Moderation Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {seller?.verification_status === "pending" || seller?.verification_status === "under_review" ? (
              <>
                <button
                  onClick={() => handleActionClick("approve")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => handleActionClick("return_for_correction")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" /> Return for Correction
                </button>
                <button
                  onClick={() => handleActionClick("reject")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </>
            ) : seller?.verification_status === "correction_required" ? (
              <>
                <button
                  onClick={() => handleActionClick("approve")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => handleActionClick("return_for_correction")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" /> Update Correction
                </button>
                <button
                  onClick={() => handleActionClick("reject")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </>
            ) : seller?.verification_status === "rejected" ? (
              <>
                <button
                  onClick={() => handleActionClick("reconsider")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reconsider / Review
                </button>
                <button
                  onClick={() => handleActionClick("approve")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => handleActionClick("return_for_correction")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" /> Correction
                </button>
              </>
            ) : seller?.verification_status === "approved" ? (
              <button
                onClick={() => handleActionClick("suspend")}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold transition-colors"
              >
                Suspend Seller
              </button>
            ) : seller?.verification_status === "suspended" ? (
              <button
                onClick={() => handleActionClick("unsuspend")}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Unsuspend / Reactivate Seller
              </button>
            ) : null}
          </div>

          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Action Dialog Modal */}
      {dialogOpen && seller && (
        <Modal
          isOpen={dialogOpen}
          onClose={() => !actionLoading && setDialogOpen(false)}
          title={
            dialogAction === "approve"
              ? "Approve Seller"
              : dialogAction === "reject"
              ? "Reject Seller Application"
              : dialogAction === "suspend"
              ? "Suspend Seller"
              : dialogAction === "unsuspend"
              ? "Unsuspend / Reactivate Seller"
              : dialogAction === "reconsider"
              ? "Reconsider Seller Application"
              : "Return for Correction"
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div
                className={`p-2.5 rounded-full flex-shrink-0 ${
                  dialogAction === "approve" || dialogAction === "unsuspend"
                    ? "bg-green-100 text-green-700"
                    : dialogAction === "reject" || dialogAction === "suspend"
                    ? "bg-rose-100 text-rose-700"
                    : dialogAction === "return_for_correction"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {dialogAction === "approve" || dialogAction === "unsuspend" ? (
                  <CheckCircle className="w-5 h-5" />
                ) : dialogAction === "reject" || dialogAction === "suspend" ? (
                  <XCircle className="w-5 h-5" />
                ) : dialogAction === "return_for_correction" ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <RotateCcw className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 text-xs">
                <p className="text-slate-800 font-semibold text-sm">
                  {seller.business_name || seller.contact_name}
                </p>
                <p className="text-slate-500 mt-0.5">
                  Current Status: <span className="font-bold uppercase text-slate-700">{seller.verification_status}</span>
                </p>
              </div>
            </div>

            {dialogAction === "return_for_correction" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Correction Reason <span className="text-rose-500">* (Required)</span>
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md shadow-xs p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    rows={2}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Explain clearly what corrections the applicant must make..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Admin Custom Note (Optional instructions for seller)
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md shadow-xs p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    rows={2}
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Provide additional guidance, contact details, or upload instructions..."
                  />
                </div>
              </div>
            )}

            {dialogAction === "reject" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Rejection Reason <span className="text-rose-500">* (Required)</span>
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md shadow-xs p-2.5 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    rows={2}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="State reason for rejecting this application..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Admin Custom Message (Optional)
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md shadow-xs p-2.5 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    rows={2}
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Additional message or appeal guidance for seller..."
                  />
                </div>
              </div>
            )}

            {dialogAction === "reconsider" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  This will move the seller from <strong>{seller.verification_status}</strong> back to{" "}
                  <strong>Under Review</strong>, enabling further actions (Approve, Request Correction, Reject).
                </p>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reconsideration Note (Optional):
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md shadow-xs p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    rows={2}
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="e.g., Documents verified via appeal; reopening application..."
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className={
                  dialogAction === "approve" || dialogAction === "unsuspend"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : dialogAction === "reject" || dialogAction === "suspend"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : dialogAction === "return_for_correction"
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }
                onClick={executeAction}
                isLoading={actionLoading}
                disabled={
                  (dialogAction === "return_for_correction" || dialogAction === "reject") &&
                  !actionReason.trim()
                }
              >
                Confirm {dialogAction.replace(/_/g, " ").toUpperCase()}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
