"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Mail,
  Phone,
  Calendar,
  Store as StoreIcon,
  CheckCircle,
  XCircle,
  AlertCircle,
  Award,
  Zap,
  MapPin,
  FileText,
  User,
  Package,
  ExternalLink,
  ShoppingBag,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  formatSequentialSellerId,
  formatSequentialCustomerId,
  getGoogleMapsUrl,
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
  onSelectOrder,
  onRefresh,
}: SellerDetailsModalProps) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [incomingOrders, setIncomingOrders] = useState<IncomingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Action Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject" | "return_for_correction" | "suspend">("approve");
  const [adminComment, setAdminComment] = useState("");
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
          const orderMap = new Map<string, {
            ord: any;
            totalSellerAmount: number;
            items: string[];
          }>();

          orderItems.forEach((item: any) => {
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
            .filter(Boolean);

          let profilesMap = new Map<string, { full_name: string; phone: string }>();
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, full_name, phone")
              .in("id", userIds);

            (profiles || []).forEach((p) => {
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
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to load seller details.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = (action: "approve" | "reject" | "return_for_correction" | "suspend") => {
    setDialogAction(action);
    setAdminComment("");
    setDialogOpen(true);
  };

  const executeAction = async () => {
    if (!seller) return;
    setActionLoading(true);

    try {
      if (dialogAction === "approve") {
        const { error } = await supabase.rpc("approve_seller", { p_seller_id: seller.id });
        if (error) throw error;
        addToast({ title: "Approved", description: "Seller and store approved.", type: "success" });
      } else if (dialogAction === "reject") {
        const { error } = await supabase.rpc("reject_seller", { p_seller_id: seller.id });
        if (error) throw error;
        addToast({ title: "Rejected", description: "Seller rejected.", type: "success" });
      } else if (dialogAction === "suspend") {
        const { error } = await supabase.rpc("suspend_seller", { p_seller_id: seller.id });
        if (error) throw error;
        addToast({ title: "Suspended", description: "Seller suspended.", type: "success" });
      } else if (dialogAction === "return_for_correction") {
        if (!adminComment.trim()) throw new Error("Correction reason is required.");
        const { error } = await supabase.rpc("return_for_correction", {
          p_seller_id: seller.id,
          p_comment: adminComment,
        });
        if (error) throw error;
        addToast({ title: "Returned", description: "Returned for correction.", type: "success" });
      }

      setDialogOpen(false);
      fetchSellerDetails(seller.id);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Action failed.",
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
  const cancelledCount = incomingOrders.filter(
    (o) => normalizeInternalStatus(o.fulfillment_status) === "CANCELLED"
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
                  onClick={() => handleActionClick("reject")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
                <button
                  onClick={() => handleActionClick("return_for_correction")}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" /> Return for Correction
                </button>
              </>
            ) : seller?.verification_status === "approved" ? (
              <button
                onClick={() => handleActionClick("suspend")}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold transition-colors"
              >
                Suspend Seller
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
              ? "Reject Seller"
              : dialogAction === "suspend"
              ? "Suspend Seller"
              : "Return for Correction"
          }
        >
          <div>
            <div className="flex items-start gap-4 mb-6">
              <div
                className={`p-3 rounded-full ${
                  dialogAction === "approve"
                    ? "bg-green-100 text-green-600"
                    : dialogAction === "reject"
                    ? "bg-red-100 text-red-600"
                    : "bg-purple-100 text-purple-600"
                }`}
              >
                {dialogAction === "approve" ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-gray-600 text-sm mt-1">
                  Are you sure you want to {dialogAction.replace(/_/g, " ")} the seller{" "}
                  <strong>{seller.business_name || seller.contact_name}</strong>?
                </p>

                {dialogAction === "return_for_correction" && (
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Reason for Correction (required)
                    </label>
                    <textarea
                      className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                      rows={4}
                      value={adminComment}
                      onChange={(e) => setAdminComment(e.target.value)}
                      placeholder="Explain what the seller needs to fix..."
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className={
                  dialogAction === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : dialogAction === "reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }
                onClick={executeAction}
                isLoading={actionLoading}
                disabled={dialogAction === "return_for_correction" && !adminComment.trim()}
              >
                Confirm Action
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
