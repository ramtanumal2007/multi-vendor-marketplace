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
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Star,
  Camera,
  X,
} from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  mapInternalToCustomerStage,
  CUSTOMER_TRACKING_STAGES,
  normalizeInternalStatus,
  getActiveReturnDisplayLabel,
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
import { evaluateProductReturnPolicy, checkItemReturnEligibility, checkOrderCancellationEligibility } from "@/lib/return-policy";
import { ReturnReplacementModal, ReturnModalItem } from "@/components/storefront/ReturnReplacementModal";
import { ReturnTrackingModal } from "@/components/storefront/ReturnTrackingModal";
import { CancelOrderModal } from "@/components/storefront/CancelOrderModal";

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
  product_id?: string;
  order_item_code?: string;
  title: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  store_id?: string;
  stores?: { name?: string; city?: string } | Array<{ name?: string; city?: string }>;
  products?: {
    id: string;
    title: string;
    slug?: string;
    sku?: string;
    product_images?: Array<{ image_url: string }>;
    category_id?: string;
    categories?: {
      id?: string;
      name?: string;
      slug?: string;
      parent_id?: string | null;
    } | null;
  } | null;
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

  // New Dedicated Return / Replacement / Cancel States
  const [returnModalItem, setReturnModalItem] = useState<ReturnModalItem | null>(null);
  const [isNewReturnModalOpen, setIsNewReturnModalOpen] = useState(false);
  const [trackingReturnId, setTrackingReturnId] = useState<string | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isCancelOrderModalOpen, setIsCancelOrderModalOpen] = useState(false);
  const [itemReturnsMap, setItemReturnsMap] = useState<Record<string, { id: string; return_number: string; status: string; request_type: string }>>({});
  const [linkedReplacementReturn, setLinkedReplacementReturn] = useState<Record<string, unknown> | null>(null);

  // Phase 3: Customer Reviews State
  interface ItemReviewSummary {
    id: string;
    product_id: string;
    rating: number;
    title?: string | null;
    body?: string | null;
    image_url?: string | null;
  }
  const [reviewsByProductId, setReviewsByProductId] = useState<Record<string, ItemReviewSummary>>({});
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [activeReviewItem, setActiveReviewItem] = useState<StorefrontOrderItem | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewHoverRating, setReviewHoverRating] = useState<number | null>(null);
  const [reviewTitle, setReviewTitle] = useState<string>("");
  const [reviewBodyText, setReviewBodyText] = useState<string>("");
  const [reviewImageFile, setReviewImageFile] = useState<File | null>(null);
  const [reviewImagePreview, setReviewImagePreview] = useState<string | null>(null);
  const [reviewExistingImageUrl, setReviewExistingImageUrl] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const reviewFileInputRef = React.useRef<HTMLInputElement>(null);

  const { addItem, openDrawer } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const handleOpenReviewModal = (item: StorefrontOrderItem) => {
    const prodId = item.product_id;
    const existing = prodId ? reviewsByProductId[prodId] : null;
    setActiveReviewItem(item);
    setReviewRating(existing?.rating || 5);
    setReviewHoverRating(null);
    setReviewTitle(existing?.title || "");
    setReviewBodyText(existing?.body || "");
    setReviewExistingImageUrl(existing?.image_url || null);
    setReviewImageFile(null);
    if (reviewImagePreview) {
      URL.revokeObjectURL(reviewImagePreview);
      setReviewImagePreview(null);
    }
    setReviewError(null);
    setIsReviewModalOpen(true);
  };

  const handleReviewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast({
        title: "Invalid file format",
        description: "Only JPEG, PNG, and WebP images are allowed.",
        type: "error",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast({
        title: "File too large",
        description: "Image size must be less than 5MB.",
        type: "error",
      });
      return;
    }

    setReviewImageFile(file);
    setReviewImagePreview(URL.createObjectURL(file));
    setReviewExistingImageUrl(null);
  };

  const handleRemoveReviewImage = () => {
    setReviewImageFile(null);
    if (reviewImagePreview) {
      URL.revokeObjectURL(reviewImagePreview);
      setReviewImagePreview(null);
    }
    setReviewExistingImageUrl(null);
    if (reviewFileInputRef.current) {
      reviewFileInputRef.current.value = "";
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReviewItem?.product_id || isSubmittingReview) return;

    if (!reviewBodyText.trim() || reviewBodyText.trim().length < 3) {
      setReviewError("Please write at least 3 characters in your review.");
      return;
    }

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      let uploadedImageUrl = reviewExistingImageUrl;

      if (reviewImageFile) {
        const formData = new FormData();
        formData.append("file", reviewImageFile);
        formData.append("productId", activeReviewItem.product_id);

        const uploadRes = await fetch("/api/reviews/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.message || "Failed to upload review image.");
        }
        uploadedImageUrl = uploadData.publicUrl;
      }

      const submitRes = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: activeReviewItem.product_id,
          rating: reviewRating,
          title: reviewTitle.trim() || undefined,
          body: reviewBodyText.trim(),
          imageUrl: uploadedImageUrl || undefined,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok || !submitData.success) {
        throw new Error(submitData.message || "Failed to submit review.");
      }

      setReviewsByProductId((prev) => ({
        ...prev,
        [activeReviewItem.product_id!]: {
          id: submitData.review?.id || "rev_" + Date.now(),
          product_id: activeReviewItem.product_id!,
          rating: reviewRating,
          title: reviewTitle.trim() || null,
          body: reviewBodyText.trim(),
          image_url: uploadedImageUrl || null,
        },
      }));

      addToast({
        title: "Review Submitted",
        description: "Thank you! Your verified purchase review has been published.",
        type: "success",
      });

      setIsReviewModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit review.";
      setReviewError(msg);
    } finally {
      setIsSubmittingReview(false);
    }
  };

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
        // 2. Fetch Items with store and product/category info
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("*, stores(name, city), products(id, title, sku, slug, product_images(image_url), category_id, categories(id, name, slug, parent_id))")
          .eq("order_id", params.id);

        // 2b. Fetch Return Requests for this order (both as parent order and as replacement order)
        const { data: userReturns } = await supabase
          .from("return_requests")
          .select("id, return_number, order_id, order_item_id, replacement_order_id, replacement_price_difference, refund_details, status, request_type")
          .or(`order_id.eq.${params.id},replacement_order_id.eq.${params.id}`)
          .order("created_at", { ascending: true });

        if (userReturns) {
          const retObj: Record<string, { id: string; return_number: string; status: string; request_type: string }> = {};
          let matchedReplRet: Record<string, unknown> | null = null;
          (userReturns as Array<{ id: string; return_number: string; order_item_id: string; replacement_order_id?: string; status: string; request_type: string; replacement_price_difference?: number; refund_details?: Record<string, unknown> }>).forEach((ret) => {
            if (ret.order_item_id) retObj[ret.order_item_id] = ret;
            if (ret.replacement_order_id === params.id) matchedReplRet = ret as Record<string, unknown>;
          });
          setItemReturnsMap(retObj);
          setLinkedReplacementReturn(matchedReplRet);
        }

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

        // 5. Fetch Customer Reviews for Delivered Items
        const prodIds = (itemsData || [])
          .map((i: { product_id?: string }) => i.product_id)
          .filter(Boolean) as string[];
        if (user?.id && prodIds.length > 0) {
          const { data: revData } = await supabase
            .from("reviews")
            .select("id, product_id, rating, title, body, image_url")
            .eq("user_id", user.id)
            .in("product_id", prodIds);

          if (revData) {
            const revMap: Record<string, ItemReviewSummary> = {};
            revData.forEach((r: { id: string; product_id: string; rating: number; title?: string | null; body?: string | null; image_url?: string | null }) => {
              revMap[r.product_id] = r;
            });
            setReviewsByProductId(revMap);
          }
        }
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

  const cancellationEligibility = checkOrderCancellationEligibility(order);

  // Derived higher-priority customer-facing lifecycle display for active Return / Replacement
  const activeReturnList = Object.values(itemReturnsMap);
  const primaryActiveReturn = activeReturnList.find(
    (r) => r.status && !["REJECTED", "CANCELLED"].includes(r.status)
  ) || activeReturnList[0] || null;
  const activeReturnDisplayLabel = primaryActiveReturn
    ? getActiveReturnDisplayLabel(primaryActiveReturn.status, primaryActiveReturn.request_type)
    : null;

  const handleOpenReturnModal = (item: StorefrontOrderItem) => {
    const storeObj = Array.isArray(item.stores) ? item.stores[0] : item.stores;
    const prodImg = item.products?.product_images?.[0]?.image_url;
    const catObj = item.products?.categories;
    const orderSubtotal = Number(order.subtotal || item.line_total || 0);
    const orderDiscount = Number(order.discount_amount || 0);
    const itemLineTotal = Number(item.line_total || (Number(item.unit_price) * Number(item.quantity || 1)));
    const itemAllocatedDiscount = orderSubtotal > 0
      ? Number(Math.min(itemLineTotal, (itemLineTotal / orderSubtotal) * orderDiscount).toFixed(2))
      : 0;
    const effectiveUnitPrice = Number(((itemLineTotal - itemAllocatedDiscount) / Math.max(1, Number(item.quantity || 1))).toFixed(2));

    setReturnModalItem({
      id: item.id,
      orderId: order.id,
      orderNumber: order.order_number,
      productId: item.product_id || "",
      title: item.title,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      sku: item.sku,
      imageUrl: prodImg,
      categoryId: item.products?.category_id,
      categorySlug: catObj?.slug,
      sellerStoreName: storeObj?.name,
      return_allowed: (item.products as Record<string, unknown>)?.return_allowed as boolean | undefined,
      return_window_days: (item.products as Record<string, unknown>)?.return_window_days as number | undefined,
      replacement_allowed: (item.products as Record<string, unknown>)?.replacement_allowed as boolean | undefined,
      replacement_window_days: (item.products as Record<string, unknown>)?.replacement_window_days as number | undefined,
      allocatedDiscount: itemAllocatedDiscount,
      effectiveUnitPrice,
    });
    setIsNewReturnModalOpen(true);
  };

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
              {(Boolean(order.is_replacement) || (typeof order.notes === "string" && order.notes.includes("Replacement order"))) && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 flex items-center gap-1.5 shadow-2xs">
                  <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Replacement Order</span>
                </span>
              )}
              {activeReturnDisplayLabel ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 shadow-2xs">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{activeReturnDisplayLabel}</span>
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                    Delivered
                  </span>
                </div>
              ) : (
                <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                  activeCustomerStage === "DELIVERED"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : isCancelled
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                }`}>
                  {activeCustomerStage}
                </span>
              )}
            </div>
            <p className="text-foreground-secondary mt-1 font-medium text-sm">
              Placed on {formatExactDateTime(order.created_at)} ({formatRelativeTime(order.created_at)})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {cancellationEligibility.canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCancelOrderModalOpen(true)}
              className="font-bold text-xs h-10 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4 text-red-600" />
              <span>Cancel Order</span>
            </Button>
          )}
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
        {/* Prominent Active Return / Replacement Lifecycle Banner */}
        {primaryActiveReturn && (
          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex-shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-purple-900 dark:text-purple-200">
                    {activeReturnDisplayLabel}
                  </span>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/80 text-purple-800 dark:text-purple-300 font-semibold">
                    {primaryActiveReturn.return_number}
                  </span>
                  <span className="text-[11px] text-foreground-secondary">
                    (Original delivery status: <span className="font-semibold text-emerald-700 dark:text-emerald-400">Delivered</span>)
                  </span>
                </div>
                <p className="text-purple-700/80 dark:text-purple-300/80 text-xs mt-0.5">
                  An active {primaryActiveReturn.request_type?.toLowerCase() === "replacement" ? "replacement" : "return"} request is currently in progress for this order.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTrackingReturnId(primaryActiveReturn.id);
                setIsTrackingModalOpen(true);
              }}
              className="text-xs h-8 font-bold border-purple-300 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 self-start sm:self-auto flex-shrink-0"
            >
              Track Return / Exchange
            </Button>
          </div>
        )}

        {/* Replacement Order Context Card */}
        {(Boolean(order.is_replacement) || (typeof order.notes === "string" && order.notes.includes("Replacement order"))) && (
          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex-shrink-0">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-purple-900 dark:text-purple-200">
                    Doorstep Exchange Fulfillment Order
                  </span>
                  {Boolean(order.original_order_id) && (
                    <Link
                      href={`/account/orders/${order.original_order_id}`}
                      className="font-mono text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline inline-flex items-center gap-1 bg-white/80 dark:bg-purple-900/60 px-2 py-0.5 rounded border border-purple-200"
                    >
                      <span>Linked Original Purchase</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
                <p className="text-purple-800/90 dark:text-purple-300/90 text-xs mt-1">
                  This order was created to fulfill your replacement exchange.{" "}
                  {(() => {
                    const linkedRetDetails = linkedReplacementReturn
                      ? (linkedReplacementReturn.refund_details as Record<string, unknown> | null)
                      : null;
                    const rawDiff =
                      order.replacement_difference !== undefined && order.replacement_difference !== null
                        ? Number(order.replacement_difference)
                        : linkedReplacementReturn?.replacement_price_difference !== undefined &&
                          linkedReplacementReturn?.replacement_price_difference !== null
                        ? Number(linkedReplacementReturn.replacement_price_difference)
                        : linkedRetDetails?.calculatedPriceDifference !== undefined
                        ? Number(linkedRetDetails.calculatedPriceDifference)
                        : undefined;
                    const refundDetails = linkedRetDetails || {};
                    const creditStatus = refundDetails.walletCreditStatus as string | undefined;
                    const creditAmount = refundDetails.walletCreditAmount as number | undefined;
                    const isCredit = (rawDiff !== undefined && rawDiff < 0) || (creditAmount !== undefined && creditAmount > 0);
                    const resolvedCreditAmt = Math.abs(rawDiff !== undefined && rawDiff < 0 ? rawDiff : creditAmount ?? 0);

                    const alreadyCredited = Number(refundDetails.alreadyCreditedAmount ?? (creditStatus === "CREDITED" ? resolvedCreditAmt : 0));
                    const remainingCredit = Number(refundDetails.remainingCreditDue ?? (creditStatus === "CREDITED" ? 0 : resolvedCreditAmt));

                    if (rawDiff !== undefined && rawDiff > 0) {
                      return (
                        <span className="font-bold text-amber-800 dark:text-amber-300">
                          (Additional amount paid: {formatCurrency(rawDiff)})
                        </span>
                      );
                    }
                    if (isCredit && resolvedCreditAmt > 0) {
                      return (
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          ({creditStatus === "CREDITED" && remainingCredit === 0
                            ? `Wallet credited: +${formatCurrency(resolvedCreditAmt)} (Credited to Wallet)`
                            : alreadyCredited > 0
                            ? `Wallet credited: +${formatCurrency(alreadyCredited)} (Remaining credit pending: +${formatCurrency(remainingCredit)})`
                            : `Eligible refund: +${formatCurrency(resolvedCreditAmt)} — wallet credit pending`})
                        </span>
                      );
                    }
                    return (
                      <span className="font-bold text-purple-900 dark:text-purple-200">
                        (₹0 Even Exchange)
                      </span>
                    );
                  })()}
                </p>
              </div>
            </div>
          </div>
        )}

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

        {/* Order Cancellation Eligibility Banner */}
        {!isCancelled && cancellationEligibility.canCancel && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-amber-900 dark:text-amber-300 block sm:inline mr-1">
                  Cancellation Window Active:
                </span>
                <span className="text-amber-800 dark:text-amber-400">
                  This order has not been dispatched yet. You can cancel directly.
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCancelOrderModalOpen(true)}
              className="text-xs h-8 font-bold border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 self-start sm:self-auto flex-shrink-0"
            >
              Cancel Order
            </Button>
          </div>
        )}

        {/* Shipped notice: Cancellation Unavailable */}
        {!isCancelled && cancellationEligibility.isShippedOrPast && activeCustomerStage !== "DELIVERED" && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs text-foreground-secondary">
            <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span>
              <strong>Cancellation unavailable:</strong> Your order has already been shipped and is in transit.
            </span>
          </div>
        )}

        {/* Return / Replacement Eligibility Banner (When DELIVERED) */}
        {activeCustomerStage === "DELIVERED" && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-emerald-900 dark:text-emerald-300 block sm:inline mr-1">
                  7-Day Return / Replacement Guarantee:
                </span>
                <span className="text-emerald-800 dark:text-emerald-400">
                  Eligible delivered products can be returned or exchanged within 7 days of delivery.
                </span>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Select action per item below
            </span>
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
                        {/* Actions for Item */}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {/* Review Action */}
                          {activeCustomerStage === "DELIVERED" && item.product_id && (
                            <div>
                              {reviewsByProductId[item.product_id] ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReviewModal(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 text-xs font-bold hover:bg-amber-100 transition-colors shadow-2xs"
                                >
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                  <span>Reviewed ({reviewsByProductId[item.product_id].rating}/5) • Edit</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReviewModal(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 text-xs font-bold hover:bg-blue-100 transition-colors shadow-2xs"
                                >
                                  <Star className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Write a Review</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Return / Replacement Action */}
                          {(() => {
                            const existingReturn = itemReturnsMap[item.id];
                            if (existingReturn) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTrackingReturnId(existingReturn.id);
                                    setIsTrackingModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 text-xs font-bold hover:bg-purple-100 transition-colors shadow-2xs"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                                  <span>{getActiveReturnDisplayLabel(existingReturn.status, existingReturn.request_type)} • Track ({existingReturn.return_number})</span>
                                </button>
                              );
                            }

                            const retEligibility = checkItemReturnEligibility(order, item);
                            if (!retEligibility.isDelivered) {
                              return null;
                            }

                            if (!retEligibility.isReturnable && !retEligibility.isReplaceable) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-xs font-medium">
                                  Return / Replacement unavailable
                                </span>
                              );
                            }

                            if (retEligibility.canReturn || retEligibility.canReplace) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReturnModal(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold hover:bg-emerald-100 transition-colors shadow-2xs"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Return / Replacement</span>
                                </button>
                              );
                            }

                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 text-xs font-medium">
                                Return window expired
                              </span>
                            );
                          })()}
                        </div>
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
              {Boolean(order.is_replacement) && (
                <div className="flex justify-between text-purple-700 dark:text-purple-300 font-medium">
                  <span>Replacement Eligible Credit</span>
                  <span>
                    -{formatCurrency(Number(order.replacement_original_value || order.subtotal || 0))}
                  </span>
                </div>
              )}
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

      {/* Verified Customer Review Modal */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title={
          activeReviewItem && activeReviewItem.product_id && reviewsByProductId[activeReviewItem.product_id]
            ? "Edit Your Review"
            : "Write a Product Review"
        }
      >
        {activeReviewItem && (
          <form onSubmit={handleSubmitReview} className="space-y-4 pt-1">
            <div className="p-3 rounded-xl bg-background-secondary/60 border border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs sm:text-sm text-foreground truncate">{activeReviewItem.title}</p>
                <p className="text-[11px] text-foreground-secondary">Verified Purchase Review</p>
              </div>
            </div>

            {reviewError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-600">
                {reviewError}
              </div>
            )}

            {/* Star Rating */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Your Overall Rating *
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const isFilled =
                      reviewHoverRating !== null ? starVal <= reviewHoverRating : starVal <= reviewRating;
                    return (
                      <button
                        key={starVal}
                        type="button"
                        onClick={() => setReviewRating(starVal)}
                        onMouseEnter={() => setReviewHoverRating(starVal)}
                        onMouseLeave={() => setReviewHoverRating(null)}
                        className="p-1 hover:scale-110 transition-transform focus:outline-none"
                        title={`${starVal} Star${starVal > 1 ? "s" : ""}`}
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${
                            isFilled
                              ? "fill-amber-400 text-amber-500"
                              : "fill-slate-100 dark:fill-slate-800 text-slate-300 dark:text-slate-600"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-bold text-foreground-secondary ml-2">
                  {(reviewHoverRating ?? reviewRating) === 5
                    ? "Excellent (5/5)"
                    : (reviewHoverRating ?? reviewRating) === 4
                    ? "Very Good (4/5)"
                    : (reviewHoverRating ?? reviewRating) === 3
                    ? "Good (3/5)"
                    : (reviewHoverRating ?? reviewRating) === 2
                    ? "Fair (2/5)"
                    : "Poor (1/5)"}
                </span>
              </div>
            </div>

            {/* Review Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Review Headline (Optional)
              </label>
              <input
                type="text"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="e.g. Excellent quality and quick delivery!"
                maxLength={150}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Review Body */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Detailed Review *
              </label>
              <textarea
                required
                rows={4}
                value={reviewBodyText}
                onChange={(e) => setReviewBodyText(e.target.value)}
                placeholder="What did you like or dislike about this product? How was the condition upon arrival?"
                className="w-full p-3.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            {/* Photo Upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Upload Photo (Optional)</span>
                <span className="text-[11px] text-foreground-secondary font-normal">Max 5MB (JPG, PNG, WebP)</span>
              </label>

              <input
                ref={reviewFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleReviewFileChange}
                className="hidden"
              />

              {reviewImagePreview || reviewExistingImageUrl ? (
                <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-border group bg-background-secondary">
                  <Image
                    src={reviewImagePreview || reviewExistingImageUrl!}
                    alt="Review Preview"
                    fill
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveReviewImage}
                    className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => reviewFileInputRef.current?.click()}
                  className="h-20 border-2 border-dashed border-border hover:border-accent rounded-xl flex items-center justify-center gap-2 text-foreground-secondary hover:text-accent transition-colors bg-background-secondary/30"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-xs font-semibold">Click to upload photo</span>
                </button>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmittingReview}
                onClick={() => setIsReviewModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmittingReview}
                className="font-bold flex items-center gap-1.5"
              >
                {isSubmittingReview ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Review...</span>
                  </>
                ) : (
                  <span>Submit Review</span>
                )}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Return / Replacement Modal */}
      <ReturnReplacementModal
        isOpen={isNewReturnModalOpen}
        onClose={() => setIsNewReturnModalOpen(false)}
        item={returnModalItem}
        onSuccess={() => {
          fetchOrderDetails(false);
        }}
      />

      {/* Return Tracking Modal */}
      <ReturnTrackingModal
        isOpen={isTrackingModalOpen}
        onClose={() => setIsTrackingModalOpen(false)}
        returnId={trackingReturnId}
      />

      {/* Cancel Order Modal */}
      <CancelOrderModal
        isOpen={isCancelOrderModalOpen}
        onClose={() => setIsCancelOrderModalOpen(false)}
        orderId={order?.id || null}
        orderNumber={order?.order_number}
        onSuccess={() => {
          fetchOrderDetails(false);
        }}
      />
    </div>
  );
}
