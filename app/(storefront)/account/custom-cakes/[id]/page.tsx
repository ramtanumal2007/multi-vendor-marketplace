"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Cake,
  Clock,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Loader2,
  Package,
  MessageSquare,
  CreditCard,
  Banknote,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface CashfreeInstance {
  checkout: (options: { paymentSessionId: string; redirectTarget?: "_self" | "_modal" | "_blank" }) => Promise<{ error?: { message?: string; code?: string } }>;
}

interface WindowWithCashfree extends Window {
  Cashfree?: (config: { mode: "sandbox" | "production" }) => CashfreeInstance;
}

interface SignedImage {
  path: string;
  signedUrl: string;
}

interface CustomCakeDetail {
  id: string;
  request_number: string;
  user_id: string;
  cake_type: string;
  flavor: string;
  weight: string;
  servings?: string | null;
  theme_description: string;
  message_on_cake?: string | null;
  preferred_delivery_date: string;
  preferred_delivery_time: string;
  budget_max: number;
  budget_min?: number | null;
  contact_name: string;
  contact_phone: string;
  delivery_address: {
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    landmark?: string;
  };
  dietary_notes?: string | null;
  additional_instructions?: string | null;
  status: string;
  seller_quote?: {
    cake_price: number;
    customization_charge: number;
    delivery_charge: number;
    discount: number;
    final_amount: number;
    seller_note?: string;
    quoted_at?: string;
    store_name?: string;
  } | null;
  clarification_notes?: string | null;
  converted_order_id?: string | null;
  created_at: string;
  signed_reference_images?: SignedImage[];
  stores?: { id: string; name: string } | null;
}

interface ActivityLog {
  id: string;
  action: string;
  actor_role: string;
  actor_name?: string;
  notes?: string;
  created_at: string;
}

export default function CustomerCustomCakeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const { addToast } = useToast();

  const [request, setRequest] = useState<CustomCakeDetail | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Action states
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isChangesModalOpen, setIsChangesModalOpen] = useState(false);
  const [changesText, setChangesText] = useState("");

  // Interactive Checkout States
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<"ONLINE" | "COD">("ONLINE");
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  const loadCashfreeSdk = (mode: "sandbox" | "production" = "sandbox"): Promise<CashfreeInstance | null> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(null);
        return;
      }
      const win = window as WindowWithCashfree;
      if (win.Cashfree) {
        resolve(win.Cashfree({ mode }));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.onload = () => {
        if (win.Cashfree) {
          resolve(win.Cashfree({ mode }));
        } else {
          resolve(null);
        }
      };
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  };

  const handleCheckoutConfirm = async () => {
    if (!request || !request.seller_quote) return;
    setIsSubmittingCheckout(true);

    try {
      if (paymentChoice === "COD") {
        const res = await fetch(`/api/customer/custom-cakes/${id}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethod: "COD" }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to confirm Cash on Delivery order.");
        }

        addToast({
          title: "Order Placed Successfully! 🎉",
          description: `Marketplace Order #${data.order_number || data.order_id.slice(0, 8)} is confirmed. Pay upon delivery.`,
          type: "success",
        });
        setIsCheckoutModalOpen(false);
        router.push(`/account/orders/${data.order_id}`);
        return;
      }

      // ONLINE PAYMENT via Cashfree
      const cfInitRes = await fetch(`/api/customer/custom-cakes/${id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "ONLINE" }),
      });
      const cfInitData = await cfInitRes.json();
      if (!cfInitRes.ok || !cfInitData.success || !cfInitData.payment_session_id) {
        throw new Error(cfInitData.message || "Failed to initialize Cashfree payment session.");
      }

      const cashfree = await loadCashfreeSdk("sandbox");
      if (!cashfree) {
        throw new Error("Unable to load Cashfree payment gateway. Please check your internet connection.");
      }

      const checkoutRes = await cashfree.checkout({
        paymentSessionId: cfInitData.payment_session_id,
        redirectTarget: "_modal",
      });

      if (checkoutRes?.error) {
        addToast({
          title: "Payment Window Closed",
          description: checkoutRes.error.message || "Payment attempt was closed.",
          type: "error",
        });
        setIsSubmittingCheckout(false);
        return;
      }

      // Authoritative verification
      const verifyRes = await fetch("/api/payment/cashfree/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashfreeOrderId: cfInitData.cashfree_order_id,
          customCakeRequestId: id,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.message || "Payment verification failed.");
      }

      addToast({
        title: "Payment Verified! 🎉",
        description: `Marketplace Order #${verifyData.order_number || verifyData.order_id.slice(0, 8)} confirmed.`,
        type: "success",
      });
      setIsCheckoutModalOpen(false);
      router.push(`/account/orders/${verifyData.order_id}`);
    } catch (err: unknown) {
      console.error("Custom cake checkout error:", err);
      const msg = err instanceof Error ? err.message : "Failed to process payment.";
      addToast({ title: "Checkout Error", description: msg, type: "error" });
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  const loadDetails = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/customer/custom-cakes/${id}`);
      const data = await res.json();
      if (data.success && data.request) {
        setRequest(data.request);
        setActivityLogs(data.activity_logs || []);
      } else {
        addToast({ title: "Not Found", description: "Request not found.", type: "error" });
      }
    } catch (err) {
      console.error("Error loading custom cake details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadDetails();
  }, [id]);

  const handleAction = async (action: string, notes?: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/customer/custom-cakes/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to process action.");
      }

      if (action === "accept_quote" && data.order_id) {
        addToast({
          title: "Order Created Successfully! 🎉",
          description: `Marketplace Order #${data.order_number || data.order_id.slice(0, 8)} is confirmed.`,
          type: "success",
        });
        router.push(`/account/orders/${data.order_id}`);
        return;
      }

      addToast({
        title: "Action Complete",
        description: data.message || "Your request has been updated.",
        type: "success",
      });

      setIsChangesModalOpen(false);
      setChangesText("");
      await loadDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute action.";
      addToast({ title: "Action Failed", description: msg, type: "error" });
    } finally {
      setIsProcessingAction(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16">
        <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500">Loading custom cake details...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Custom cake request not found.</p>
        <Link href="/account/custom-cakes" className="text-xs text-accent font-bold mt-2 inline-block">
          ← Back to Cake Requests
        </Link>
      </div>
    );
  }

  const quote = request.seller_quote;
  const isQuoted = request.status === "QUOTED" && quote;
  const isConverted = request.status === "CONVERTED_TO_ORDER" && request.converted_order_id;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/account/custom-cakes"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                Request #{request.request_number || request.id.slice(0, 8)}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                {request.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Submitted on {formatExactDateTime(request.created_at)}
            </p>
          </div>
        </div>

        {isConverted && (
          <Link
            href={`/account/orders/${request.converted_order_id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all shrink-0"
          >
            <Package className="w-4 h-4" />
            <span>Track Live Order Status</span>
          </Link>
        )}
      </div>

      {/* 1. SELLER QUOTATION CARD (SECTION J: CUSTOMER QUOTE & CONFIRMATION) */}
      {isQuoted && (
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900 rounded-3xl p-6 sm:p-7 border-2 border-emerald-400/80 dark:border-emerald-600 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800/80 pb-3">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-extrabold text-base sm:text-lg">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>Your Custom Cake Quote is Ready!</span>
            </div>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Merchant Partner
            </span>
          </div>

          {/* Itemized Price Breakdown */}
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Base Cake Price ({request.flavor}, {request.weight}):</span>
              <span className="font-bold">{formatCurrency(quote.cake_price)}</span>
            </div>
            {quote.customization_charge > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Handcrafted Design & Customization Charge:</span>
                <span className="font-bold">{formatCurrency(quote.customization_charge)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Delivery Charge ({request.preferred_delivery_time}):</span>
              <span className="font-bold">
                {quote.delivery_charge > 0 ? formatCurrency(quote.delivery_charge) : "FREE"}
              </span>
            </div>
            {quote.discount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Promotional Discount:</span>
                <span>-{formatCurrency(quote.discount)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-emerald-200 dark:border-emerald-800 flex justify-between text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              <span>Total Payable Amount:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-black">
                {formatCurrency(quote.final_amount)}
              </span>
            </div>
          </div>

          {/* Bakery Note */}
          {quote.seller_note && (
            <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-emerald-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold text-emerald-700 dark:text-emerald-300 block mb-0.5">
                Note from Bakery:
              </span>
              <p>{quote.seller_note}</p>
            </div>
          )}

          {/* ACTIONS: ACCEPT & CONTINUE, DECLINE, REQUEST CHANGES */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <Button
              type="button"
              disabled={isProcessingAction || isSubmittingCheckout}
              onClick={() => setIsCheckoutModalOpen(true)}
              className="w-full sm:w-auto flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 text-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Accept &amp; Continue to Order</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isProcessingAction}
              onClick={() => setIsChangesModalOpen(true)}
              className="w-full sm:w-auto font-bold py-3 px-5 rounded-xl text-xs sm:text-sm"
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              <span>Request Changes</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isProcessingAction}
              onClick={() => handleAction("decline_quote")}
              className="w-full sm:w-auto font-bold py-3 px-5 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-200 text-xs sm:text-sm"
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              <span>Decline</span>
            </Button>
          </div>
        </div>
      )}

      {/* CLARIFICATION ALERT IF ACTIVE */}
      {request.status === "CLARIFICATION_REQUESTED" && request.clarification_notes && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-bold block mb-1">Message from Bakery / Admin:</span>
            <p>{request.clarification_notes}</p>
          </div>
        </div>
      )}

      {/* 2. SPECIFICATIONS CARD */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-5">
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Cake className="w-5 h-5 text-rose-600" /> Cake Specifications
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-400 block mb-1">Occasion / Type</span>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
              {request.cake_type}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-400 block mb-1">Flavor</span>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
              {request.flavor}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-400 block mb-1">Weight / Size</span>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
              {request.weight}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-400 block mb-1">Customer Budget</span>
            <span className="font-extrabold text-slate-900 dark:text-white text-sm">
              Up to {formatCurrency(request.budget_max)}
            </span>
          </div>
        </div>

        {/* Message on Cake */}
        {request.message_on_cake && (
          <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50">
            <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
              Message / Inscription on Cake
            </span>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              &ldquo;{request.message_on_cake}&rdquo;
            </p>
          </div>
        )}

        {/* Design Description */}
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            Design & Theme Details
          </span>
          <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            {request.theme_description}
          </p>
        </div>

        {/* REFERENCE IMAGES (SECURE PRIVATE BUCKET PREVIEW) */}
        {request.signed_reference_images && request.signed_reference_images.length > 0 && (
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Reference Design Images ({request.signed_reference_images.length})
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {request.signed_reference_images.map((img, idx) => (
                <a
                  key={idx}
                  href={img.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 block shadow-xs hover:shadow-md transition-shadow"
                >
                  <Image
                    src={img.signedUrl}
                    alt={`Reference design ${idx + 1}`}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                    View Full
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. DELIVERY & CONTACT DETAILS */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <MapPin className="w-5 h-5 text-rose-600" /> Delivery &amp; Contact Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-slate-400 block">Recipient</span>
            <p className="font-bold text-slate-800 dark:text-slate-200">
              {request.contact_name} ({request.contact_phone})
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block">Delivery Window</span>
            <p className="font-bold text-slate-800 dark:text-slate-200">
              {request.preferred_delivery_date} • {request.preferred_delivery_time}
            </p>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <span className="text-slate-400 block">Address</span>
            <p className="font-bold text-slate-800 dark:text-slate-200">
              {request.delivery_address?.address_line1}, {request.delivery_address?.city},{" "}
              {request.delivery_address?.state} — {request.delivery_address?.postal_code}
              {request.delivery_address?.landmark && ` (Landmark: ${request.delivery_address.landmark})`}
            </p>
          </div>
        </div>
      </div>

      {/* 4. ACTIVITY TIMELINE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" /> Request Progress Timeline
        </h2>

        <div className="space-y-4">
          {activityLogs.map((log, idx) => (
            <div key={log.id || idx} className="flex items-start gap-3 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-600 mt-1 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {log.action.replace(/_/g, " ")}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {formatExactDateTime(log.created_at)}
                  </span>
                </div>
                {log.notes && <p className="text-slate-500 mt-0.5">{log.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* REQUEST CHANGES MODAL */}
      {isChangesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Request Changes to Quote
            </h3>
            <p className="text-xs text-slate-500">
              Tell the bakery partner what changes you would like to make to the specifications or price.
            </p>

            <textarea
              rows={4}
              placeholder="e.g. Can we make it 1 kg instead of 1.5 kg, or use whipped cream instead of fondant?"
              value={changesText}
              onChange={(e) => setChangesText(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsChangesModalOpen(false)}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isProcessingAction || !changesText.trim()}
                onClick={() => handleAction("request_changes", changesText)}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Send Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL: SELECT PAYMENT METHOD & CONFIRM ORDER */}
      {isCheckoutModalOpen && quote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" /> Confirm &amp; Place Cake Order
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Request #{request.request_number || request.id.slice(0, 8)} • Total: {formatCurrency(quote.final_amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isSubmittingCheckout && setIsCheckoutModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Select Payment Method:
              </span>

              {/* Option 1: Cashfree Online */}
              <div
                onClick={() => setPaymentChoice("ONLINE")}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  paymentChoice === "ONLINE"
                    ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  paymentChoice === "ONLINE" ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
                }`}>
                  {paymentChoice === "ONLINE" && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-600" /> Pay Online (Cashfree)
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      Instant Confirmation
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">
                    UPI, Credit/Debit Cards, NetBanking via secure Cashfree payment gateway.
                  </p>
                </div>
              </div>

              {/* Option 2: Cash on Delivery */}
              <div
                onClick={() => setPaymentChoice("COD")}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  paymentChoice === "COD"
                    ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  paymentChoice === "COD" ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
                }`}>
                  {paymentChoice === "COD" && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-emerald-600" /> Cash on Delivery (COD)
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                      Pay on Arrival
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">
                    Pay full cash of {formatCurrency(quote.final_amount)} directly upon cake delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* Price Breakdown Snapshot */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Cake Base + Customization:</span>
                <span>{formatCurrency(Number(quote.cake_price || 0) + Number(quote.customization_charge || 0))}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Delivery Charge:</span>
                <span>{quote.delivery_charge > 0 ? formatCurrency(quote.delivery_charge) : "FREE"}</span>
              </div>
              {quote.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Discount:</span>
                  <span>-{formatCurrency(quote.discount)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-black text-sm text-slate-900 dark:text-white">
                <span>Final Order Amount:</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(quote.final_amount)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmittingCheckout}
                onClick={() => setIsCheckoutModalOpen(false)}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmittingCheckout}
                onClick={handleCheckoutConfirm}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-6 py-2.5 rounded-xl shadow-md"
              >
                {isSubmittingCheckout ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  <span>{paymentChoice === "ONLINE" ? `Pay ${formatCurrency(quote.final_amount)} Online` : "Place COD Order"}</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
