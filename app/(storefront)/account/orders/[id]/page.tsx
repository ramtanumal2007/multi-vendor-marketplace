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
  MapPin,
  Store,
  FileText,
  Download,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
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
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import { executeReorder } from "@/lib/reorderHelper";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InvoiceModal } from "@/components/checkout/InvoiceModal";

interface StorefrontOrderDetail {
  id: string;
  order_number: string;
  invoice_number?: string;
  created_at: string;
  internal_status?: string;
  fulfillment_status: string;
  payment_status: string;
  payment_method?: string;
  total: number;
  subtotal?: number;
  tax_amount?: number;
  delivery_charge?: number;
  tip_amount?: number;
  coupon_discount?: number;
  applied_coupon_code?: string;
  shipping_method?: string;
  shipping_cost?: number;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address_line1?: string;
    address_line2?: string;
    address1?: string;
    address2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    phone?: string;
    [key: string]: unknown;
  };
  email?: string;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  [key: string]: unknown;
}

interface StorefrontOrderItem {
  id: string;
  order_id: string;
  order_item_code?: string;
  title: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  stores?: { name?: string } | { name?: string }[];
}

interface StorefrontTimeline {
  id: string;
  status: string;
  note?: string;
  created_at: string;
  profiles?: {
    role?: string;
    full_name?: string;
  };
}

interface CustomerProfileData {
  id: string;
  customer_id_code?: string;
  full_name?: string;
  phone?: string;
  email?: string;
}

export default function CustomerOrderDetailsPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<StorefrontOrderDetail | null>(null);
  const [items, setItems] = useState<StorefrontOrderItem[]>([]);
  const [timeline, setTimeline] = useState<StorefrontTimeline[]>([]);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Phase 2 Customer Action States
  const [isReordering, setIsReordering] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("Ordered by mistake");
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnType, setReturnType] = useState<"return" | "replacement">("return");
  const [returnReason, setReturnReason] = useState("Defective item");
  const [returnNotes, setReturnNotes] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [activeTickets, setActiveTickets] = useState<{ id: string; ticket_number: string; category: string; subject: string; status: string }[]>([]);

  const { addItem, openDrawer } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const handleReorder = async () => {
    if (!order) return;
    setIsReordering(true);
    try {
      const res = await executeReorder(supabase, order.id, addItem, openDrawer);
      if (res.addedCount > 0) {
        addToast({
          title: "Added to Cart",
          description: `Added ${res.addedCount} available item(s) to your cart with current store pricing.`,
          type: "success",
        });
      }
      if (res.unavailableCount > 0 && res.messages.length > 0) {
        addToast({
          title: "Product Notice",
          description: res.messages[0],
          type: "info",
        });
      }
    } catch {
      addToast({
        title: "Reorder Failed",
        description: "Could not add items to cart. Please try again.",
        type: "error",
      });
    } finally {
      setIsReordering(false);
    }
  };

  const handleCopyTracking = (trackingNum: string) => {
    navigator.clipboard.writeText(trackingNum);
    setCopiedTracking(true);
    addToast({ title: "Copied", description: "Tracking number copied to clipboard.", type: "success" });
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  const handleCancelRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || isSubmittingCancel) return;
    if (!cancelConfirmed) {
      addToast({ title: "Confirmation Required", description: "Please check the confirmation box to proceed.", type: "error" });
      return;
    }
    setIsSubmittingCancel(true);
    try {
      const { data: resData, error } = await supabase.rpc("create_support_ticket", {
        p_category: "Order Issue",
        p_subject: `Order Cancellation Request — #${order.order_number}`,
        p_description: `Customer requested order cancellation.\nReason: ${cancelReason}\nAdditional Comments: ${cancelNotes || "None"}\nOrder ID: ${order.id}\nOrder Total: ₹${order.total}`,
        p_order_id: order.id,
        p_order_number: order.order_number,
      });

      if (error) throw error;

      if (resData?.is_duplicate) {
        addToast({
          title: "Request Already Active",
          description: resData.message || "An active cancellation ticket already exists for this order.",
          type: "info",
        });
      } else {
        addToast({
          title: "Cancellation Request Received",
          description: "Our operations desk has received your request and will process it shortly.",
          type: "success",
        });
      }
      setIsCancelModalOpen(false);
      setCancelNotes("");
      setCancelConfirmed(false);
      fetchOrderDetails(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit cancellation request.";
      addToast({ title: "Request Failed", description: msg, type: "error" });
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleReturnRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || isSubmittingReturn) return;
    setIsSubmittingReturn(true);
    try {
      const label = returnType === "return" ? "Return & Refund" : "Product Replacement";
      const { data: resData, error } = await supabase.rpc("create_support_ticket", {
        p_category: "Return / Refund",
        p_subject: `${label} Request — #${order.order_number}`,
        p_description: `Customer submitted a ${label.toLowerCase()} request.\nType: ${label}\nReason: ${returnReason}\nDetails: ${returnNotes || "None"}\nOrder ID: ${order.id}\nOrder Total: ₹${order.total}`,
        p_order_id: order.id,
        p_order_number: order.order_number,
      });

      if (error) throw error;

      if (resData?.is_duplicate) {
        addToast({
          title: "Request Already Active",
          description: resData.message || `An active ${label.toLowerCase()} ticket already exists for this order.`,
          type: "info",
        });
      } else {
        addToast({
          title: `${label} Request Submitted`,
          description: "Your request has been logged. Our support team will coordinate reverse pickup.",
          type: "success",
        });
      }
      setIsReturnModalOpen(false);
      setReturnNotes("");
      fetchOrderDetails(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit request.";
      addToast({ title: "Request Failed", description: msg, type: "error" });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const fetchOrderDetails = React.useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);

    try {
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setCustomerProfile(prof || null);
      }

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

        // 4. Fetch Active Support Tickets for Duplicate Prevention
        const { data: ticketsData } = await supabase
          .from("support_tickets")
          .select("id, ticket_number, category, subject, status")
          .eq("order_id", params.id)
          .in("status", ["OPEN", "UNDER_REVIEW", "ACTION_TAKEN"]);

        setActiveTickets((ticketsData as { id: string; ticket_number: string; category: string; subject: string; status: string }[]) || []);
      }
    } catch (err) {
      console.error("Error fetching order details:", err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [params.id, user, supabase]);

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
          (payload: { new: StorefrontTimeline }) => {
            setTimeline((prev) => [payload.new, ...prev]);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${params.id}` },
          (payload: { new: StorefrontOrderDetail }) => {
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
  }, [params.id, user, authLoading, router, supabase, fetchOrderDetails]);

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

  const currentInternalStatus = normalizeInternalStatus(order.internal_status || order.fulfillment_status);

  const activeCustomerStage = mapInternalToCustomerStage(currentInternalStatus);
  const isCancelled = currentInternalStatus === "CANCELLED";
  const currentStepIndex = CUSTOMER_TRACKING_STAGES.indexOf(activeCustomerStage as typeof CUSTOMER_TRACKING_STAGES[number]);

  const openCancelTicket = activeTickets.find(
    (t) =>
      t.category === "Order Issue" ||
      t.subject?.toLowerCase().includes("cancellation") ||
      t.subject?.toLowerCase().includes("cancel")
  );

  const openReturnTicket = activeTickets.find(
    (t) =>
      t.category === "Return / Refund" ||
      t.category === "Returns & Refunds" ||
      t.subject?.toLowerCase().includes("return") ||
      t.subject?.toLowerCase().includes("replacement")
  );

  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-12 w-full flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/account/orders"
            className="p-2 border border-border rounded-lg hover:bg-background-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold">Order #{order.order_number}</h1>
              <span className="text-sm text-foreground-secondary font-mono font-bold bg-background-secondary px-2.5 py-1 rounded-lg border border-border">
                Invoice #{order.invoice_number || (order.order_number ? `INV-${order.order_number.replace("ORD-", "")}` : "INV-10007")}
              </span>
            </div>
            <p className="text-foreground-secondary mt-1 font-medium text-sm">
              Placed on {formatExactDateTime(order.created_at)} ({formatRelativeTime(order.created_at)})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReorder}
            disabled={isReordering}
            className="font-bold text-xs h-10 border-accent/40 text-accent hover:bg-accent/10 flex items-center gap-1.5"
          >
            {isReordering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span>Buy Again</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsInvoiceOpen(true)}
            className="font-bold text-xs h-10 border-slate-300 flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-blue-600" /> Preview Invoice
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsInvoiceOpen(true)}
            className="font-bold text-xs h-10 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download Invoice
          </Button>
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

        {/* Courier & Delivery Information Card */}
        <div className="pt-4 border-t border-border/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-background border border-border flex flex-col justify-between gap-2">
            <span className="text-foreground-secondary font-semibold uppercase tracking-wider text-[10px]">
              Delivery Logistics
            </span>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-bold text-foreground text-sm">
                {order.tracking_carrier || "Designated Surface Courier"}
              </span>
            </div>
            <p className="text-[11px] text-foreground-secondary">
              Verified Marketplace Partner Carrier
            </p>
          </div>

          <div className="p-4 rounded-xl bg-background border border-border flex flex-col justify-between gap-2">
            <span className="text-foreground-secondary font-semibold uppercase tracking-wider text-[10px]">
              AWB / Tracking Number
            </span>
            {order.tracking_number ? (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-sm text-foreground">
                  {order.tracking_number}
                </span>
                <button
                  onClick={() => handleCopyTracking(order.tracking_number!)}
                  className="p-1 hover:bg-background-secondary rounded text-foreground-secondary hover:text-foreground transition-colors"
                  title="Copy tracking number"
                >
                  {copiedTracking ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ) : (
              <span className="text-foreground-secondary italic text-xs">
                Tracking number will be assigned upon dispatch
              </span>
            )}
            {order.tracking_number && (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent((order.tracking_carrier || "courier") + " tracking " + order.tracking_number)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1 text-[11px]"
              >
                <span>Track on Carrier Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="p-4 rounded-xl bg-background border border-border flex flex-col justify-between gap-2">
            <span className="text-foreground-secondary font-semibold uppercase tracking-wider text-[10px]">
              Estimated Delivery Window
            </span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-bold text-foreground text-sm">
                {activeCustomerStage === "DELIVERED"
                  ? "Delivered Successfully"
                  : `By ${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(new Date(order.created_at).getTime() + 4 * 24 * 60 * 60 * 1000))}`}
              </span>
            </div>
            <p className="text-[11px] text-foreground-secondary">
              Standard 3–5 business day delivery timeline
            </p>
          </div>
        </div>

        {/* Phase 2: Order Cancellation Eligibility Banner (When in ORDERED status) */}
        {!isCancelled && currentInternalStatus === "ORDERED" && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-amber-900 dark:text-amber-300 block sm:inline mr-1">
                  Cancellation Window Active:
                </span>
                <span className="text-amber-800 dark:text-amber-400">
                  This order has not been dispatched yet. You can submit an immediate cancellation request.
                </span>
              </div>
            </div>
            {openCancelTicket ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300/80 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Cancellation Pending ({openCancelTicket.ticket_number})</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="text-xs h-8 font-bold border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-100 self-start sm:self-auto flex-shrink-0"
              >
                Request Cancellation
              </Button>
            )}
          </div>
        )}

        {/* Phase 2: Return / Replacement Eligibility Banner (When DELIVERED) */}
        {activeCustomerStage === "DELIVERED" && (
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-blue-900 dark:text-blue-300 block sm:inline mr-1">
                  7-Day Buyer Protection:
                </span>
                <span className="text-blue-800 dark:text-blue-400">
                  Delivered items are eligible for return or replacement within 7 days of arrival.
                </span>
              </div>
            </div>
            {openReturnTicket ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-300/80 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Return Pending ({openReturnTicket.ticket_number})</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReturnModalOpen(true)}
                className="text-xs h-8 font-bold border-blue-300 text-blue-800 dark:text-blue-300 hover:bg-blue-100 self-start sm:self-auto flex-shrink-0"
              >
                Request Return / Replacement
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Items & Total */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          <div className="border border-border rounded-2xl p-6 bg-background">
            <h2 className="text-xl font-bold mb-6">Order Items</h2>
            <div className="flex flex-col gap-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center pb-6 border-b border-border last:border-0 last:pb-0"
                >
                    <div className="flex gap-4 items-center">
                      <div className="w-16 h-16 bg-background-secondary rounded-xl flex items-center justify-center">
                        <Package className="w-6 h-6 text-foreground-secondary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-mono text-xs text-blue-600 font-bold mb-0.5">
                          <span>{item.order_item_code || `OI-${(order.order_number || "10000").replace("ORD-", "")}-${String(items.indexOf(item) + 1).padStart(3, "0")}`}</span>
                          <span className="text-foreground-secondary/40">|</span>
                          <span className="text-foreground-secondary font-normal">SKU: {item.sku || "N/A"}</span>
                        </div>
                        <p className="font-semibold text-base">{item.title}</p>
                        <p className="text-sm text-foreground-secondary mt-0.5">
                          Quantity: {item.quantity} × {formatCurrency(Number(item.unit_price))}
                        </p>
                      </div>
                    </div>
                    <div className="font-bold text-base">{formatCurrency(Number(item.line_total))}</div>
                  </div>
              ))}
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

      {order && (
        <InvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
          order={order}
          items={items}
          customerProfile={customerProfile}
        />
      )}

      {/* PHASE 2: ORDER CANCELLATION REQUEST MODAL */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => !isSubmittingCancel && setIsCancelModalOpen(false)}
        title="Request Order Cancellation"
      >
        <form onSubmit={handleCancelRequest} className="flex flex-col gap-4 text-xs sm:text-sm">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300 text-xs">
            <p className="font-bold">Cancellation Policy:</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-400">
              Orders can only be cancelled while in <strong>ORDERED</strong> status. Once approved, prepaid payments will be refunded via your original payment mode.
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-foreground">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="Ordered by mistake">Ordered by mistake</option>
              <option value="Found better price elsewhere">Found a lower price elsewhere</option>
              <option value="Change of delivery address">Need to change delivery address</option>
              <option value="Order processing delay">Delivery window too long</option>
              <option value="Other">Other reason</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-foreground">
              Additional Details / Comments
            </label>
            <textarea
              value={cancelNotes}
              onChange={(e) => setCancelNotes(e.target.value)}
              rows={3}
              placeholder="Tell our support team anything else relevant..."
              className="w-full p-3 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-background-secondary border border-border/80 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={cancelConfirmed}
              onChange={(e) => setCancelConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-accent focus:ring-accent"
              required
            />
            <span className="text-foreground font-medium">
              I confirm I want to cancel order #{order.order_number} (Total: {formatCurrency(order.total)}).
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingCancel}
              onClick={() => setIsCancelModalOpen(false)}
            >
              Nevermind
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isSubmittingCancel || !cancelConfirmed}
              className="font-bold flex items-center gap-1.5"
            >
              {isSubmittingCancel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Confirm Cancellation</span>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* PHASE 2: RETURN / REPLACEMENT REQUEST MODAL */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => !isSubmittingReturn && setIsReturnModalOpen(false)}
        title="Request Return or Replacement"
      >
        <form onSubmit={handleReturnRequest} className="flex flex-col gap-4 text-xs sm:text-sm">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-300 text-xs">
            <p className="font-bold">Marketplace Guarantee:</p>
            <p className="mt-0.5 text-blue-800 dark:text-blue-400">
              Our verified seller network provides 7-day doorstep replacement or refund pickup for damaged, defective, or incorrect items.
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-1.5 text-foreground">
              Request Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReturnType("return")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  returnType === "return"
                    ? "bg-accent/10 border-accent font-bold text-accent"
                    : "bg-background border-border text-foreground hover:bg-background-secondary"
                }`}
              >
                Return &amp; Refund
              </button>
              <button
                type="button"
                onClick={() => setReturnType("replacement")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  returnType === "replacement"
                    ? "bg-accent/10 border-accent font-bold text-accent"
                    : "bg-background border-border text-foreground hover:bg-background-secondary"
                }`}
              >
                Product Replacement
              </button>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-foreground">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="Damaged item">Damaged or broken on delivery</option>
              <option value="Defective item">Defective / not functioning</option>
              <option value="Wrong product received">Received wrong item or variant</option>
              <option value="Quality not as described">Quality does not match description</option>
              <option value="Size or fit issue">Size or fit issue</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-foreground">
              Problem Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              required
              rows={3}
              placeholder="Describe the issue with the item(s) so our team can approve pickup promptly..."
              className="w-full p-3 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingReturn}
              onClick={() => setIsReturnModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmittingReturn}
              className="font-bold flex items-center gap-1.5"
            >
              {isSubmittingReturn ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Request</span>
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
