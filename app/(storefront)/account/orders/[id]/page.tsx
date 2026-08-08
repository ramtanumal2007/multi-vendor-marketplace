"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Package, Clock, CheckCircle2, Truck, XCircle, MapPin, Store } from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  mapInternalToCustomerStage,
  CUSTOMER_TRACKING_STAGES,
  normalizeInternalStatus,
} from "@/lib/utils";
import { useAuth } from "@/lib/context/AuthContext";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export default function CustomerOrderDetailsPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      fetchOrderDetails();

      // Setup Realtime Subscription
      const channel = supabase
        .channel(`order_updates_${params.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "order_timeline", filter: `order_id=eq.${params.id}` },
          (payload) => {
            setTimeline((prev) => [payload.new, ...prev]);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${params.id}` },
          (payload) => {
            setOrder(payload.new);
          }
        )
        .subscribe();

      // Polling fallback
      const interval = setInterval(() => {
        fetchOrderDetails(false);
      }, 10000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [params.id, user, authLoading]);

  async function fetchOrderDetails(showLoading = true) {
    if (showLoading) setIsLoading(true);

    try {
      // 1. Fetch Order
      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", params.id)
        .eq("user_id", user?.id)
        .single();

      if (orderData) {
        // 2. Fetch Items with store info
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("*, stores(name)")
          .eq("order_id", params.id);

        // 3. Fetch Timeline
        const { data: timelineData } = await supabase
          .from("order_timeline")
          .select("*, profiles(role, full_name)")
          .eq("order_id", params.id)
          .order("created_at", { ascending: false });

        setOrder(orderData);
        setItems(itemsData || []);
        setTimeline(timelineData || []);
      }
    } catch (err) {
      console.error("Error fetching order details:", err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <h1 className="text-3xl font-serif mb-4">Order Not Found</h1>
        <p className="text-foreground-secondary mb-8">
          We couldn&apos;t find this order or you don&apos;t have access to it.
        </p>
        <Link href="/account">
          <Button variant="primary">Back to Account</Button>
        </Link>
      </div>
    );
  }

  // Derive latest internal status and mapped customer stage
  const latestTimelineStatus = timeline[0]?.status;
  const currentInternalStatus = latestTimelineStatus
    ? normalizeInternalStatus(latestTimelineStatus)
    : normalizeInternalStatus(order.internal_status || order.fulfillment_status);

  const activeCustomerStage = mapInternalToCustomerStage(currentInternalStatus);
  const isCancelled = currentInternalStatus === "CANCELLED";
  const currentStepIndex = CUSTOMER_TRACKING_STAGES.indexOf(activeCustomerStage as any);

  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-12 w-full flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/account"
            className="p-2 border border-border rounded-lg hover:bg-background-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Order #{order.order_number}</h1>
            <p className="text-foreground-secondary mt-1 font-medium text-sm">
              Placed on {formatExactDateTime(order.created_at)} ({formatRelativeTime(order.created_at)})
            </p>
          </div>
        </div>
      </div>

      {/* Visual Tracking Bar (5 Stages Only) */}
      <div className="bg-background-secondary/50 p-6 md:p-8 rounded-2xl border border-border space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Order Tracking Status</h2>
          <span className="text-xs font-semibold px-3 py-1 bg-accent/10 text-accent rounded-full capitalize">
            Payment: {order.payment_status}
          </span>
        </div>

        {isCancelled ? (
          <div className="flex items-center gap-4 text-red-500 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
            <XCircle className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold">Order Cancelled</p>
              <p className="text-sm text-foreground-secondary">
                This order has been cancelled. If you have questions, please contact support.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative pt-6 pb-2">
            {/* Background Line */}
            <div className="absolute top-11 left-6 right-6 h-1.5 bg-border rounded-full z-0" />

            {/* Active Progress Line */}
            {currentStepIndex >= 0 && (
              <motion.div
                className="absolute top-11 left-6 h-1.5 bg-blue-600 rounded-full z-0"
                initial={{ width: "0%" }}
                animate={{
                  width: `calc(${(currentStepIndex / (CUSTOMER_TRACKING_STAGES.length - 1)) * 100}% - 12px)`,
                }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
            )}

            {/* Stage Nodes */}
            <div className="relative z-10 flex justify-between">
              {CUSTOMER_TRACKING_STAGES.map((stage, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;

                return (
                  <div key={stage} className="flex flex-col items-center gap-3 relative">
                    {/* Vehicle Indicator on active node */}
                    {isCurrent && (
                      <motion.div
                        className="absolute -top-7 text-blue-600 flex items-center justify-center"
                        initial={{ y: -5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="p-1 bg-blue-600 text-white rounded-full shadow-md">
                          <Truck className="w-4 h-4" />
                        </div>
                      </motion.div>
                    )}

                    <motion.div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-border text-border"
                      }`}
                      animate={{ scale: isCurrent ? 1.15 : 1 }}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-border" />
                      )}
                    </motion.div>

                    <span
                      className={`text-xs md:text-sm font-semibold text-center ${
                        isCurrent
                          ? "text-blue-600 font-bold"
                          : isCompleted
                          ? "text-foreground"
                          : "text-foreground-secondary"
                      }`}
                    >
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Items & Total */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          <div className="border border-border rounded-2xl p-6 bg-background">
            <h2 className="text-xl font-bold mb-6">Order Items</h2>
            <div className="flex flex-col gap-6">
              {items.map((item) => {
                const storeObj = Array.isArray(item.stores) ? item.stores[0] : item.stores;

                return (
                  <div
                    key={item.id}
                    className="flex justify-between items-center pb-6 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex gap-4 items-center">
                      <div className="w-16 h-16 bg-background-secondary rounded-xl flex items-center justify-center">
                        <Package className="w-6 h-6 text-foreground-secondary" />
                      </div>
                      <div>
                        <p className="font-semibold text-base">{item.title}</p>
                        <p className="text-sm text-foreground-secondary mt-0.5">
                          Quantity: {item.quantity} × {formatCurrency(Number(item.unit_price))}
                        </p>
                        {storeObj?.name && (
                          <div className="text-xs text-foreground-secondary mt-1 flex items-center gap-1">
                            <Store className="w-3.5 h-3.5" />
                            Seller: <span className="font-semibold text-foreground">{storeObj.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="font-bold text-base">{formatCurrency(Number(item.line_total))}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 border-t border-border pt-6 flex flex-col gap-3 text-sm">
              <div className="flex justify-between text-foreground-secondary">
                <span>Subtotal</span>
                <span>{formatCurrency(Number(order.subtotal || 0))}</span>
              </div>
              <div className="flex justify-between text-foreground-secondary">
                <span>Shipping ({order.shipping_method || "Standard"})</span>
                <span>{formatCurrency(Number(order.shipping_cost || 0))}</span>
              </div>
              <div className="flex justify-between text-foreground-secondary">
                <span>Estimated Tax</span>
                <span>{formatCurrency(Number(order.tax_amount || 0))}</span>
              </div>
              <div className="flex justify-between font-bold text-lg mt-3 pt-3 border-t border-border">
                <span>Total</span>
                <span>{formatCurrency(Number(order.total || 0))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Detailed Activity Timeline & Delivery Address */}
        <div className="flex flex-col gap-8">
          {/* Detailed Activity Timeline */}
          <div className="border border-border rounded-2xl p-6 bg-background space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" /> Activity Timeline
            </h2>

            <div className="flex flex-col gap-6">
              {timeline.length === 0 ? (
                <div className="text-sm text-foreground-secondary italic">
                  Order received. Updates will appear here as your order progresses.
                </div>
              ) : (
                timeline.map((event, i) => {
                  const authorProfile = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
                  const authorRole = authorProfile?.role || "System";

                  return (
                    <div key={event.id} className="flex gap-4 relative text-sm">
                      {i !== timeline.length - 1 && (
                        <div className="absolute top-8 bottom-[-24px] left-[19px] w-0.5 bg-border" />
                      )}
                      <div className="w-10 h-10 rounded-full bg-background-secondary border border-border flex items-center justify-center flex-shrink-0 z-10">
                        {authorRole === "seller" ? (
                          <Store className="w-5 h-5 text-purple-600" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div className="pt-1 flex-1">
                        <p className="font-bold text-foreground">{event.status}</p>
                        <p className="text-xs text-foreground-secondary mt-0.5">
                          {formatExactDateTime(event.created_at)} ({formatRelativeTime(event.created_at)})
                        </p>
                        {event.note && (
                          <div className="mt-2 p-3 bg-background-secondary/80 border border-border rounded-xl text-xs text-foreground font-medium italic">
                            &quot;{event.note}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="border border-border rounded-2xl p-6 bg-background space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-600" /> Shipping Details
            </h2>
            <div className="text-sm flex flex-col gap-1 text-foreground-secondary">
              <p className="font-bold text-foreground">
                {order.shipping_address?.first_name} {order.shipping_address?.last_name}
              </p>
              <p>{order.shipping_address?.address_line1}</p>
              {order.shipping_address?.address_line2 && <p>{order.shipping_address?.address_line2}</p>}
              <p>
                {[
                  order.shipping_address?.city,
                  order.shipping_address?.postal_code,
                  order.shipping_address?.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
