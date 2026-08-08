"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Search,
  Filter,
  User,
  MessageSquare,
  Send,
  Loader2,
  RefreshCw,
  AlertCircle,
  Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  normalizeInternalStatus,
  mapInternalToFulfillmentStatus,
  getGoogleMapsUrl,
  formatSequentialCustomerId,
} from "@/lib/utils";
import { MapPin, ExternalLink } from "lucide-react";

interface SellerOrderItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface SellerOrder {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: any;
  items: SellerOrderItem[];
  seller_total: number;
  payment_status: string;
  fulfillment_status: string;
  internal_status: string;
  created_at: string;
  timeline: any[];
}

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);

  // Custom Note Input State
  const [customNote, setCustomNote] = useState("");
  const [isPostingNote, setIsPostingNote] = useState(false);
  const [updatingStatusTo, setUpdatingStatusTo] = useState("");

  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    fetchSellerOrders();
  }, []);

  const fetchSellerOrders = async () => {
    setIsLoading(true);

    try {
      // 1. Get current authenticated user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 2. Get seller's store ID
      const { data: storeData } = await supabase
        .from("stores")
        .select("id")
        .eq("seller_id", user.id)
        .single();

      if (!storeData?.id) {
        setOrders([]);
        setIsLoading(false);
        return;
      }

      // 3. Fetch order items for seller's store joined with order
      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select(
          "id, order_id, title, quantity, unit_price, line_total, orders(id, order_number, user_id, email, shipping_address, payment_status, fulfillment_status, created_at)"
        )
        .eq("store_id", storeData.id);

      if (itemsErr) throw itemsErr;

      if (itemsData && itemsData.length > 0) {
        // Group by order
        const orderMap = new Map<string, { ord: any; items: SellerOrderItem[]; total: number }>();

        itemsData.forEach((item: any) => {
          const ord = Array.isArray(item.orders) ? item.orders[0] : item.orders;
          if (!ord) return;

          const current = orderMap.get(ord.id) || { ord, items: [], total: 0 };
          current.items.push({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            unit_price: Number(item.unit_price || 0),
            line_total: Number(item.line_total || 0),
          });
          current.total += Number(item.line_total || 0);
          orderMap.set(ord.id, current);
        });

        const orderIds = Array.from(orderMap.keys());

        // Fetch customer profile names & order timelines
        const { data: timelinesData } = await supabase
          .from("order_timeline")
          .select("*")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });

        const timelineMap = new Map<string, any[]>();
        (timelinesData || []).forEach((t) => {
          const arr = timelineMap.get(t.order_id) || [];
          arr.push(t);
          timelineMap.set(t.order_id, arr);
        });

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

        const compiledOrders: SellerOrder[] = Array.from(orderMap.values()).map(
          ({ ord, items, total }) => {
            const ship = ord.shipping_address || {};
            const custProfile = ord.user_id ? profilesMap.get(ord.user_id) : null;
            const customerName =
              custProfile?.full_name ||
              `${ship.first_name || ""} ${ship.last_name || ""}`.trim() ||
              "Customer";
            const customerPhone = custProfile?.phone || ship.phone || "—";
            const tLine = timelineMap.get(ord.id) || [];

            // Determine latest internal status from timeline or mapped fulfillment status
            const latestTimeline = tLine[0];
            const internalStatus = latestTimeline?.status
              ? normalizeInternalStatus(latestTimeline.status)
              : normalizeInternalStatus(ord.fulfillment_status);

            return {
              id: ord.id,
              order_number: ord.order_number,
              user_id: ord.user_id,
              customer_name: customerName,
              customer_email: ord.email,
              customer_phone: customerPhone,
              shipping_address: ship,
              items,
              seller_total: total,
              payment_status: ord.payment_status,
              fulfillment_status: ord.fulfillment_status,
              internal_status: internalStatus,
              created_at: ord.created_at,
              timeline: tLine,
            };
          }
        );

        // Sort newest first
        compiledOrders.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setOrders(compiledOrders);
        if (selectedOrder) {
          const refreshed = compiledOrders.find((o) => o.id === selectedOrder.id);
          if (refreshed) setSelectedOrder(refreshed);
        }
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to load seller orders.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (order: SellerOrder, newInternalStatus: string) => {
    setUpdatingStatusTo(newInternalStatus);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const dbFulfillmentStatus = mapInternalToFulfillmentStatus(newInternalStatus);

      // 1. Update order fulfillment status in orders table
      const { error: orderErr } = await supabase
        .from("orders")
        .update({ fulfillment_status: dbFulfillmentStatus })
        .eq("id", order.id);

      if (orderErr) throw orderErr;

      // 2. Add entry to order_timeline
      const { error: timelineErr } = await supabase.from("order_timeline").insert({
        order_id: order.id,
        status: newInternalStatus,
        note: `Seller updated status to ${newInternalStatus}`,
        created_by: user?.id,
      });

      if (timelineErr) console.warn("Timeline insert warning:", timelineErr);

      addToast({
        title: "Status Updated",
        description: `Order #${order.order_number} marked as ${newInternalStatus}`,
        type: "success",
      });

      fetchSellerOrders();
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to update order status.",
        type: "error",
      });
    } finally {
      setUpdatingStatusTo("");
    }
  };

  const handlePostCustomNote = async (order: SellerOrder) => {
    if (!customNote.trim()) return;
    setIsPostingNote(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("order_timeline").insert({
        order_id: order.id,
        status: order.internal_status || "ORDERED",
        note: customNote.trim(),
        created_by: user?.id,
      });

      if (error) throw error;

      addToast({
        title: "Update Sent",
        description: "Customer-facing status update posted.",
        type: "success",
      });

      setCustomNote("");
      fetchSellerOrders();
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to post update.",
        type: "error",
      });
    } finally {
      setIsPostingNote(false);
    }
  };

  // Filter orders by search & status
  const filteredOrders = orders.filter((ord) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      ord.order_number.toLowerCase().includes(term) ||
      ord.customer_name.toLowerCase().includes(term) ||
      ord.customer_email.toLowerCase().includes(term) ||
      ord.items.some((i) => i.title.toLowerCase().includes(term));

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = ord.internal_status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store Orders</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage incoming orders, dispatch preparation, and customer updates.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSellerOrders} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by order #, customer, or product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">All Internal Statuses</option>
                <option value="ORDERED">ORDERED</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="READY TO DISPATCH">READY TO DISPATCH</option>
                <option value="SHIPPED">SHIPPED</option>
                <option value="IN TRANSIT">IN TRANSIT</option>
                <option value="OUT FOR DELIVERY">OUT FOR DELIVERY</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>
            </div>

            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              {filteredOrders.length} Orders
            </span>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-12 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[950px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-4">Order & Date</th>
                  <th className="p-4">Customer Details</th>
                  <th className="p-4">Products & Quantity</th>
                  <th className="p-4">Amount & Payment</th>
                  <th className="p-4">Internal Status</th>
                  <th className="p-4 text-right">Actions & Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOrders.map((ord) => {
                  const normStatus = ord.internal_status;
                  const isSellerControlled = ["ORDERED", "CONFIRMED"].includes(normStatus);
                  const isReadyToDispatch = normStatus === "READY TO DISPATCH";
                  const isLocked = !isSellerControlled;

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-bold text-slate-900">#{ord.order_number}</div>
                        <div className="text-slate-500 text-xs mt-0.5">
                          {formatExactDateTime(ord.created_at)}
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          ({formatRelativeTime(ord.created_at)})
                        </div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {ord.customer_name}
                        </div>
                        <div className="text-slate-500 mt-0.5">{ord.customer_email}</div>
                        <div className="text-slate-500">{ord.customer_phone}</div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="space-y-1">
                          {ord.items.map((item) => (
                            <div key={item.id} className="text-slate-800">
                              <span className="font-semibold">{item.title}</span>{" "}
                              <span className="text-slate-500">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatCurrency(ord.seller_total)}
                        </div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize mt-1 ${
                            ord.payment_status === "paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {ord.payment_status}
                        </span>
                      </td>

                      <td className="p-4 align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            normStatus === "DELIVERED"
                              ? "bg-green-100 text-green-800 border border-green-200"
                              : normStatus === "CANCELLED"
                              ? "bg-red-100 text-red-800 border border-red-200"
                              : normStatus === "READY TO DISPATCH"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {normStatus}
                        </span>
                        {isReadyToDispatch && (
                          <div className="text-[10px] text-purple-700 font-semibold mt-1">
                            Dispatched to Shipping
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top text-right space-y-2">
                        <button
                          onClick={() => setSelectedOrder(ord)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details & Updates
                        </button>

                        {/* Seller Control Buttons */}
                        {isSellerControlled ? (
                          <div className="flex flex-col gap-1.5 items-end pt-1">
                            {normStatus === "ORDERED" && (
                              <button
                                disabled={updatingStatusTo === "CONFIRMED"}
                                onClick={() => handleUpdateStatus(ord, "CONFIRMED")}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                              >
                                {updatingStatusTo === "CONFIRMED" ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                Confirm Order
                              </button>
                            )}

                            {normStatus === "CONFIRMED" && (
                              <button
                                disabled={updatingStatusTo === "READY TO DISPATCH"}
                                onClick={() => handleUpdateStatus(ord, "READY TO DISPATCH")}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                              >
                                {updatingStatusTo === "READY TO DISPATCH" ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Truck className="w-3 h-3" />
                                )}
                                Mark Ready to Dispatch
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic pt-1">
                            Logistics control active
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center text-slate-500">
              <Package className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No orders found</h3>
              <p className="text-xs text-slate-500">
                No orders match your current search query or status filter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Order Detailed Activity Drawer/Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 relative overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Order #{selectedOrder.order_number} Details & Activity
                </h2>
                <p className="text-xs text-slate-500">
                  Placed on {formatExactDateTime(selectedOrder.created_at)} (
                  {formatRelativeTime(selectedOrder.created_at)})
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
              {/* Order Info & Customer Summary */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-medium">Customer</span>
                  <span className="font-bold text-slate-800">{selectedOrder.customer_name}</span>
                  <span className="text-slate-500 block">{selectedOrder.customer_email}</span>
                  <span className="text-slate-500 block">{selectedOrder.customer_phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Current Internal Status</span>
                  <span className="font-bold text-blue-700 text-sm">{selectedOrder.internal_status}</span>
                  <span className="text-slate-500 block mt-1">
                    Items total: <strong>{formatCurrency(selectedOrder.seller_total)}</strong>
                  </span>
                </div>
              </div>

              {/* Shipping Address & Google Maps Location */}
              {selectedOrder.shipping_address && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs text-slate-700">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" /> Delivery Address
                  </div>
                  <div>
                    {selectedOrder.shipping_address.first_name} {selectedOrder.shipping_address.last_name} — {selectedOrder.shipping_address.address_line1}
                  </div>
                  {selectedOrder.shipping_address.landmark && (
                    <div className="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px] inline-block">
                      Landmark: {selectedOrder.shipping_address.landmark}
                    </div>
                  )}
                  <div>
                    {[selectedOrder.shipping_address.city, selectedOrder.shipping_address.postal_code, selectedOrder.shipping_address.country || "IN"].filter(Boolean).join(", ")}
                  </div>
                  {(() => {
                    const gMapsUrl = getGoogleMapsUrl(selectedOrder.shipping_address);
                    if (!gMapsUrl) return null;
                    return (
                      <div className="pt-1">
                        <a
                          href={gMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold text-[11px] hover:bg-emerald-100 transition-colors"
                        >
                          <MapPin className="w-3 h-3" /> Open in Google Maps <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Custom Customer Message Post Area (If seller control active) */}
              {["ORDERED", "CONFIRMED"].includes(selectedOrder.internal_status) ? (
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                  <label className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    Post Customer-Facing Status Note
                  </label>
                  <p className="text-[11px] text-slate-500">
                    This note will be visible directly in the customer&apos;s tracking activity timeline (e.g. &quot;Cake is being prepared&quot;).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Your order is being freshly prepared..."
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePostCustomNote(selectedOrder)}
                      isLoading={isPostingNote}
                      disabled={!customNote.trim()}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Post Note
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 italic">
                  Seller status control is locked because the order has entered dispatch/shipping workflow ({selectedOrder.internal_status}).
                </div>
              )}

              {/* Timeline History */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Full Order Timeline History
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedOrder.timeline.length === 0 ? (
                    <div className="p-3 text-slate-400 border border-dashed rounded-lg text-center">
                      No custom events logged yet.
                    </div>
                  ) : (
                    selectedOrder.timeline.map((event) => (
                      <div key={event.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">{event.status}</span>
                          <span className="text-slate-400 text-[10px]">
                            {formatExactDateTime(event.created_at)} ({formatRelativeTime(event.created_at)})
                          </span>
                        </div>
                        {event.note && <p className="text-slate-600 text-xs italic">&quot;{event.note}&quot;</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
