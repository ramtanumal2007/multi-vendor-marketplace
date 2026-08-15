"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Loader2,
  User,
  Store,
  MapPin,
  ExternalLink,
  MessageSquare,
  Send,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  INTERNAL_ORDER_STATUSES,
  normalizeInternalStatus,
  mapInternalToFulfillmentStatus,
  getGoogleMapsUrl,
  formatSequentialCustomerId,
} from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CustomerDetailsModal } from "@/components/admin/CustomerDetailsModal";
import { SellerDetailsModal } from "@/components/admin/SellerDetailsModal";
import { DeliveryConfirmationModal } from "@/components/admin/DeliveryConfirmationModal";
import { InvoiceModal } from "@/components/checkout/InvoiceModal";

export default function AdminOrderDetailsPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [customerProfile, setCustomerProfile] = useState<any>(null);
  const [sellerProfilesMap, setSellerProfilesMap] = useState<Map<string, any>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingTo, setUpdatingTo] = useState("");
  const [currentStatus, setCurrentStatus] = useState("ORDERED");

  // Admin Custom Note state
  const [adminNote, setAdminNote] = useState("");
  const [isPostingNote, setIsPostingNote] = useState(false);

  // Modal navigation states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    fetchOrderDetails();

    const channel = supabase
      .channel(`admin-order-${params.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${params.id}` },
        (payload: any) => {
          setOrder(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_timeline", filter: `order_id=eq.${params.id}` },
        (payload: any) => {
          setTimeline((prev) => {
            if (prev.some((t) => t.id === payload.new.id)) return prev;

            const norm = normalizeInternalStatus(payload.new.status);
            setCurrentStatus(norm);

            return [payload.new, ...prev].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.id]);

  async function fetchOrderDetails() {
    setIsLoading(true);

    try {
      // 1. Fetch Order
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", params.id)
        .single();

      if (orderErr) throw orderErr;
      setOrder(orderData);

      // 2. Fetch Customer Profile if user_id exists
      if (orderData.user_id) {
        const { data: cProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", orderData.user_id)
          .single();

        setCustomerProfile(cProfile || null);
      }

      // 3. Fetch Items with store & product details
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("*, stores(id, name, status, seller_id, seller_profiles(id, business_name, contact_name, business_email)), products(id, title, product_images(image_url))")
        .eq("order_id", params.id);

      setItems(itemsData || []);

      // Build seller profiles map from items
      const sMap = new Map<string, any>();
      (itemsData || []).forEach((item: any) => {
        const storeObj = Array.isArray(item.stores) ? item.stores[0] : item.stores;
        if (storeObj) {
          const sellerProf = Array.isArray(storeObj.seller_profiles)
            ? storeObj.seller_profiles[0]
            : storeObj.seller_profiles;

          if (sellerProf?.id && !sMap.has(sellerProf.id)) {
            sMap.set(sellerProf.id, {
              seller_id: sellerProf.id,
              store_id: storeObj.id,
              store_name: storeObj.name,
              store_status: storeObj.status,
              owner_name: sellerProf.contact_name || sellerProf.business_name || "Seller",
              email: sellerProf.business_email || "N/A",
            });
          }
        }
      });
      setSellerProfilesMap(sMap);

      // 4. Fetch Order Timeline
      const { data: timelineData } = await supabase
        .from("order_timeline")
        .select("*, profiles(full_name, role)")
        .eq("order_id", params.id)
        .order("created_at", { ascending: false });

      setTimeline(timelineData || []);
      setCurrentStatus(normalizeInternalStatus(orderData.internal_status || orderData.fulfillment_status));
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to load order details.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleConfirmDelivery = async (paymentMethod: string) => {
    setIsUpdating(true);
    setUpdatingTo("DELIVERED");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc("confirm_order_delivery", {
        p_order_id: params.id,
        p_payment_method: paymentMethod,
        p_admin_id: user?.id,
      });

      if (error) throw error;

      addToast({
        title: "Order Delivered & Paid",
        description: `Order marked DELIVERED and payment confirmed via ${paymentMethod}`,
        type: "success",
      });

      setIsDeliveryModalOpen(false);
      await fetchOrderDetails();
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to confirm delivery.",
        type: "error",
      });
    } finally {
      setIsUpdating(false);
      setUpdatingTo("");
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (newStatus === "DELIVERED") {
      setIsDeliveryModalOpen(true);
      return;
    }

    setIsUpdating(true);
    setUpdatingTo(newStatus);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const dbFulfillmentStatus = mapInternalToFulfillmentStatus(newStatus);

      // 1. Update Order Table
      const { data: updatedOrder, error: orderError } = await supabase
        .from("orders")
        .update({
          fulfillment_status: dbFulfillmentStatus,
          internal_status: newStatus,
        })
        .eq("id", params.id)
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Add Timeline Event
      const { data: newTimelineEvent, error: timelineError } = await supabase
        .from("order_timeline")
        .insert({
          order_id: params.id,
          status: newStatus,
          note: `Admin updated status to ${newStatus}`,
          created_by: user?.id,
        })
        .select("*, profiles(full_name, role)")
        .single();

      if (timelineError) throw timelineError;

      addToast({
        title: "Success",
        description: `Order status changed to ${newStatus}`,
        type: "success",
      });

      setOrder(updatedOrder);
      setCurrentStatus(newStatus);

      if (newTimelineEvent) {
        setTimeline((prev) => {
          if (prev.some((t) => t.id === newTimelineEvent.id)) return prev;
          return [newTimelineEvent, ...prev].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to update status.",
        type: "error",
      });
    } finally {
      setIsUpdating(false);
      setUpdatingTo("");
    }
  };

  const handlePostAdminNote = async () => {
    if (!adminNote.trim()) return;
    setIsPostingNote(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: newEvent, error } = await supabase
        .from("order_timeline")
        .insert({
          order_id: params.id,
          status: currentStatus,
          note: adminNote.trim(),
          created_by: user?.id,
        })
        .select("*, profiles(full_name, role)")
        .single();

      if (error) throw error;

      addToast({
        title: "Update Posted",
        description: "Custom customer-facing update published.",
        type: "success",
      });

      setAdminNote("");
      if (newEvent) {
        setTimeline((prev) => [newEvent, ...prev]);
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to post note.",
        type: "error",
      });
    } finally {
      setIsPostingNote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return <div className="p-8 text-center text-slate-500">Order not found.</div>;
  }

  const ship = order.shipping_address || {};
  const customerName =
    customerProfile?.full_name ||
    `${ship.first_name || ""} ${ship.last_name || ""}`.trim() ||
    "Customer";
  const customerEmail = customerProfile?.email || order.email;
  const customerPhone = customerProfile?.phone || ship.phone || "Not provided";

  const sellersList = Array.from(sellerProfilesMap.values());

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-12 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/orders"
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">Order #{order.order_number}</h1>
              <span className="text-sm text-slate-500 font-mono font-extrabold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                Invoice #{order.invoice_number || (order.order_number ? `INV-${order.order_number.replace("ORD-", "")}` : "INV-10007")}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  currentStatus === "DELIVERED"
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : currentStatus === "CANCELLED"
                    ? "bg-red-100 text-red-800 border border-red-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {currentStatus}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Placed on {formatExactDateTime(order.created_at)} ({formatRelativeTime(order.created_at)})
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsInvoiceModalOpen(true)}
          className="bg-white border-slate-200 hover:bg-slate-50 font-bold text-xs h-9"
        >
          <FileText className="w-4 h-4 mr-1.5 text-blue-600" /> Tax Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Items, Delivery, Timeline) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Products / Items Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Package className="w-4 h-4 text-blue-600" /> Products & Order Items ({items.length})
            </h3>

            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const prod = Array.isArray(item.products) ? item.products[0] : item.products;
                const images = prod?.product_images || [];
                const imgUrl = images[0]?.image_url;
                const storeObj = Array.isArray(item.stores) ? item.stores[0] : item.stores;

                return (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {imgUrl ? (
                          <img src={imgUrl} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-blue-600 font-bold mb-0.5">
                          <span>{item.order_item_code || `OI-${(order.order_number || "10000").replace("ORD-", "")}-${String(items.indexOf(item) + 1).padStart(3, "0")}`}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500 font-normal">SKU: {item.sku || prod?.sku || "N/A"}</span>
                        </div>
                        <div className="font-bold text-slate-900 truncate">{item.title}</div>
                        <div className="text-slate-500">
                          Qty: {item.quantity} × {formatCurrency(Number(item.unit_price))}
                        </div>
                        {storeObj && (
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Store className="w-3 h-3 text-slate-400" />
                            Store: <span className="font-medium text-slate-700">{storeObj.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="font-bold text-slate-900 text-sm flex-shrink-0">
                      {formatCurrency(Number(item.line_total))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Summary */}
            <div className="border-t border-slate-100 pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatCurrency(Number(order.subtotal || 0))}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Shipping ({order.shipping_method || "Standard"})</span>
                <span>{formatCurrency(Number(order.shipping_cost || 0))}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span>{formatCurrency(Number(order.tax_amount || 0))}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-base pt-2 border-t border-slate-100">
                <span>Total Amount</span>
                <span>{formatCurrency(Number(order.total || 0))}</span>
              </div>
            </div>
          </div>

          {/* Delivery & Shipping Info */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" /> Delivery & Shipping Address
              </h3>
              {getGoogleMapsUrl(ship) && (
                <a
                  href={getGoogleMapsUrl(ship)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold border border-emerald-200 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Maps Location
                </a>
              )}
            </div>
            <div className="text-slate-700 space-y-1 pt-1">
              <div className="font-bold text-slate-900 text-sm">{customerName}</div>
              <div>{ship.address_line1}</div>
              {ship.address_line2 && <div>{ship.address_line2}</div>}
              {ship.landmark && (
                <div className="text-slate-500 font-medium">Landmark: {ship.landmark}</div>
              )}
              <div>
                {[ship.city, ship.state, ship.postal_code, ship.country].filter(Boolean).join(", ")}
              </div>
              <div className="pt-2 text-slate-500 font-medium">Phone: {customerPhone}</div>
            </div>
          </div>

          {/* Activity Timeline & History */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" /> Order Status History & Custom Updates
              </h3>
              <span className="text-xs text-slate-500">{timeline.length} Events</span>
            </div>

            {/* Admin Custom Update Input */}
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
              <label className="font-bold text-indigo-900 flex items-center gap-1.5 text-xs">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                Post Admin Custom Customer Update
              </label>
              <p className="text-[11px] text-slate-500">
                Post custom delivery updates visible in the customer&apos;s activity timeline (e.g. &quot;Package in transit to Kolkata hub&quot;).
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Package handed over to delivery courier..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePostAdminNote}
                  isLoading={isPostingNote}
                  disabled={!adminNote.trim()}
                >
                  <Send className="w-3.5 h-3.5 mr-1" /> Publish Note
                </Button>
              </div>
            </div>

            {/* Timeline Stream */}
            <div className="space-y-4">
              {timeline.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  No order timeline events recorded yet.
                </div>
              ) : (
                timeline.map((event, i) => {
                  const authorProfile = Array.isArray(event.profiles)
                    ? event.profiles[0]
                    : event.profiles;
                  const authorRole = authorProfile?.role || "System";
                  const authorName = authorProfile?.full_name || "Admin/System";

                  return (
                    <div key={event.id} className="flex gap-4 relative text-xs">
                      {i !== timeline.length - 1 && (
                        <div className="absolute top-8 bottom-[-20px] left-5 w-0.5 bg-slate-200" />
                      )}
                      <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 z-10 font-bold text-slate-700">
                        {authorRole === "seller" ? (
                          <Store className="w-4 h-4 text-purple-600" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-blue-600" />
                        )}
                      </div>

                      <div className="pt-1.5 flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-900 text-sm">
                            {event.status}
                          </span>
                          <span className="text-slate-400 text-[11px]">
                            {formatExactDateTime(event.created_at)} ({formatRelativeTime(event.created_at)})
                          </span>
                        </div>

                        {event.note && (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium italic">
                            &quot;{event.note}&quot;
                          </div>
                        )}

                        <div className="text-[10px] text-slate-400">
                          Updated by: <span className="font-semibold text-slate-600">{authorName}</span> (
                          <span className="capitalize">{authorRole}</span>)
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Customer Card, Seller Cards, Status Controls) */}
        <div className="flex flex-col gap-6">
          {/* Administrative Status Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider border-b border-slate-100 pb-3">
              Admin Status Workflow Controls
            </h3>
            <p className="text-xs text-slate-500">
              Admin can update order status to any stage across the complete marketplace lifecycle.
            </p>

            <div className="flex flex-col gap-2">
              {INTERNAL_ORDER_STATUSES.map((status) => {
                const isActive = currentStatus === status;
                const isThisUpdating = updatingTo === status;

                return (
                  <button
                    key={status}
                    disabled={isUpdating}
                    onClick={() => updateStatus(status)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all duration-200 cursor-pointer ${
                      isActive
                        ? status === "DELIVERED"
                          ? "border-green-600 bg-green-600 text-white shadow-sm"
                          : status === "CANCELLED"
                          ? "border-red-600 bg-red-600 text-white shadow-sm"
                          : "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isActive && !isThisUpdating && <CheckCircle2 className="w-4 h-4 text-white" />}
                      {isThisUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                      {!isActive && !isThisUpdating && <div className="w-4 h-4" />}
                      <span>{status}</span>
                    </div>
                    {isActive && <span className="text-[10px] uppercase font-extrabold opacity-80">Current</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer Card (Interconnected) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="w-4 h-4 text-blue-600" /> Customer Information
            </h3>

            <div className="space-y-2">
              <div>
                <span className="text-slate-400 block font-medium">Customer Name</span>
                {order.user_id ? (
                  <button
                    onClick={() => setSelectedCustomerId(order.user_id)}
                    className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm inline-flex items-center gap-1"
                  >
                    {customerName}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="font-bold text-slate-900 text-sm">{customerName}</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Email Address</span>
                <span className="font-semibold text-slate-800">{customerEmail}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Phone Number</span>
                <span className="font-semibold text-slate-800">{customerPhone}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Customer ID</span>
                <code className="font-mono text-[10px] font-bold text-blue-600">
                  {order.user_id ? formatSequentialCustomerId(0, customerProfile?.customer_id_code) : "Guest"}
                </code>
              </div>
            </div>
          </div>

          {/* Delivery Location & Google Maps Card */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="w-4 h-4 text-emerald-600" /> Shipping & Delivery Location
            </h3>

            <div className="space-y-2 text-slate-700">
              <div className="font-bold text-slate-900 text-sm">
                {ship.first_name} {ship.last_name}
              </div>
              <div>{ship.address_line1}</div>
              {ship.address_line2 && <div>{ship.address_line2}</div>}
              {ship.landmark && (
                <div className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 text-[11px] font-medium">
                  Landmark: {ship.landmark}
                </div>
              )}
              <div>
                {[ship.city, ship.postal_code, ship.country || "IN"].filter(Boolean).join(", ")}
              </div>

              {(() => {
                const mapsUrl = getGoogleMapsUrl(ship);
                if (!mapsUrl) return null;
                return (
                  <div className="pt-2">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-xs hover:bg-emerald-100 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Open Location in Google Maps
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Seller / Store Cards (Interconnected) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Store className="w-4 h-4 text-indigo-600" /> Seller / Store Information ({sellersList.length})
            </h3>

            <div className="space-y-4">
              {sellersList.length === 0 ? (
                <div className="text-slate-400 italic">No seller associated.</div>
              ) : (
                sellersList.map((s) => (
                  <div key={s.seller_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-medium">Store Name</span>
                      <button
                        onClick={() => setSelectedSellerId(s.seller_id)}
                        className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline text-xs inline-flex items-center gap-1"
                      >
                        {s.store_name}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] font-medium">Owner</span>
                      <span className="font-semibold text-slate-800">{s.owner_name}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] font-medium">Seller Email</span>
                      <span className="font-semibold text-slate-800">{s.email}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerId && (
        <CustomerDetailsModal
          customerId={selectedCustomerId}
          isOpen={!!selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onSelectSeller={(sellerId) => {
            setSelectedCustomerId(null);
            setSelectedSellerId(sellerId);
          }}
        />
      )}

      {/* Seller Details Modal */}
      {selectedSellerId && (
        <SellerDetailsModal
          sellerId={selectedSellerId}
          isOpen={!!selectedSellerId}
          onClose={() => setSelectedSellerId(null)}
          onSelectCustomer={(custUserId) => {
            setSelectedSellerId(null);
            setSelectedCustomerId(custUserId);
          }}
        />
      )}

      {/* Delivery Confirmation Modal */}
      <DeliveryConfirmationModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        onConfirm={handleConfirmDelivery}
        orderNumber={order.order_number}
        currentPaymentMethod={order.payment_method}
        currentPaymentStatus={order.payment_status}
        isSubmitting={isUpdating}
      />

      {/* Tax Invoice Modal */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        order={order}
        items={items}
        customerProfile={customerProfile}
      />
    </div>
  );
}
