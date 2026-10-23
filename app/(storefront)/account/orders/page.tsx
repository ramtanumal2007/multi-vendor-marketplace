"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  formatCurrency,
  mapInternalToCustomerStage,
  normalizeInternalStatus,
  getActiveReturnDisplayLabel,
} from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import {
  FileText,
  RotateCcw,
  RefreshCw,
  Loader2,
  Package,
  Star,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Store,
} from "lucide-react";
import { InvoiceModal } from "@/components/checkout/InvoiceModal";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import { executeReorder } from "@/lib/reorderHelper";
import { evaluateProductReturnPolicy, checkItemReturnEligibility, checkOrderCancellationEligibility } from "@/lib/return-policy";
import { ReturnReplacementModal, ReturnModalItem } from "@/components/storefront/ReturnReplacementModal";
import { ReturnTrackingModal } from "@/components/storefront/ReturnTrackingModal";
import { CancelOrderModal } from "@/components/storefront/CancelOrderModal";
import { WriteReviewModal, ReviewTargetItem } from "@/components/storefront/WriteReviewModal";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

interface OrderItemDetail {
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
  stores?: { name?: string; city?: string } | Array<{ name?: string; city?: string }> | null;
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

interface CustomerOrderWithItems {
  id: string;
  order_number: string;
  invoice_number?: string;
  created_at: string;
  delivered_at?: string;
  internal_status?: string;
  fulfillment_status: string;
  payment_status: string;
  payment_method?: string;
  total: number;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  shipping_cost?: number;
  shipping_address?: Record<string, unknown>;
  order_items: OrderItemDetail[];
  [key: string]: unknown;
}

interface UserReviewRecord {
  id: string;
  product_id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
}

interface UserReturnRecord {
  id: string;
  return_number: string;
  order_id: string;
  order_item_id: string;
  replacement_order_id?: string | null;
  replacement_price_difference?: number | null;
  refund_details?: {
    walletCreditAmount?: number;
    walletCreditStatus?: string;
    originalEligibleValue?: number;
    replacementSubtotal?: number;
    calculatedPriceDifference?: number;
    [key: string]: unknown;
  } | null;
  status: string;
  request_type: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrderWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState<Record<string, unknown> | null>(null);

  // User reviews keyed by product_id
  const [reviewsMap, setReviewsMap] = useState<Record<string, UserReviewRecord>>({});

  // User returns keyed by order_item_id & replacement_order_id
  const [returnsMap, setReturnsMap] = useState<Record<string, UserReturnRecord>>({});
  const [replOrdersMap, setReplOrdersMap] = useState<Record<string, UserReturnRecord>>({});

  // Invoice Modal State
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<CustomerOrderWithItems | null>(null);
  const [activeInvoiceItems, setActiveInvoiceItems] = useState<Array<Record<string, unknown>>>([]);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Reorder State
  const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);
  const [reorderingProductId, setReorderingProductId] = useState<string | null>(null);

  // Return / Replacement Modal State
  const [returnModalItem, setReturnModalItem] = useState<ReturnModalItem | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // Tracking Modal State
  const [trackingReturnId, setTrackingReturnId] = useState<string | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);

  // Cancel Modal State
  const [cancelModalOrderId, setCancelModalOrderId] = useState<string | null>(null);
  const [cancelModalOrderNumber, setCancelModalOrderNumber] = useState<string>("");
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Review Modal State
  const [reviewTarget, setReviewTarget] = useState<ReviewTargetItem | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const { addItem, openDrawer } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();

  const loadAllOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Fetch Profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      setCustomerProfile(prof || null);

      // 2. Fetch Orders with order items, products, categories, and stores
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (
            id,
            order_id,
            product_id,
            order_item_code,
            title,
            sku,
            quantity,
            unit_price,
            line_total,
            store_id,
            stores (name, city),
            products (
              id,
              title,
              slug,
              sku,
              category_id,
              product_images (image_url),
              categories (id, name, slug, parent_id)
            )
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (ordersErr) {
        console.error("Orders fetch error:", ordersErr);
      } else if (ordersData) {
        setOrders(ordersData as CustomerOrderWithItems[]);

        // 3. Fetch reviews submitted by this customer
        const prodIds = (ordersData as CustomerOrderWithItems[]).flatMap((o: CustomerOrderWithItems) =>
          (o.order_items || []).map((i: OrderItemDetail) => i.product_id).filter(Boolean)
        ) as string[];

        if (prodIds.length > 0) {
          const { data: userReviews } = await supabase
            .from("reviews")
            .select("id, product_id, rating, title, body, image_url")
            .eq("user_id", user.id)
            .in("product_id", prodIds);

          if (userReviews) {
            const revObj: Record<string, UserReviewRecord> = {};
            (userReviews as UserReviewRecord[]).forEach((r: UserReviewRecord) => {
              revObj[r.product_id] = r;
            });
            setReviewsMap(revObj);
          }
        }

        // 4. Fetch return requests submitted by this customer
        const { data: userReturns } = await supabase
          .from("return_requests")
          .select("id, return_number, order_id, order_item_id, replacement_order_id, replacement_price_difference, refund_details, status, request_type")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: true });

        if (userReturns) {
          const retObj: Record<string, UserReturnRecord> = {};
          const replObj: Record<string, UserReturnRecord> = {};
          (userReturns as UserReturnRecord[]).forEach((ret: UserReturnRecord) => {
            if (ret.order_item_id) retObj[ret.order_item_id] = ret;
            if (ret.replacement_order_id) replObj[ret.replacement_order_id] = ret;
          });
          setReturnsMap(retObj);
          setReplOrdersMap(replObj);
        }
      }
    } catch (err) {
      console.error("Order history fetch exception:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadAllOrders();
  }, [loadAllOrders]);

  const handleOpenInvoice = (order: CustomerOrderWithItems) => {
    setActiveInvoiceOrder(order);
    setActiveInvoiceItems(
      (order.order_items || []).map((oi) => ({
        id: oi.id,
        title: oi.title,
        price: Number(oi.unit_price),
        quantity: oi.quantity,
        sku: oi.sku,
        stores: Array.isArray(oi.stores) ? oi.stores[0] : oi.stores,
      }))
    );
    setIsInvoiceOpen(true);
  };

  const handleReorderOrder = async (orderId: string) => {
    setReorderingOrderId(orderId);
    try {
      const res = await executeReorder(supabase, orderId, addItem, openDrawer);
      if (res.addedCount > 0) {
        addToast({
          title: "Added to Cart",
          description: `Successfully added ${res.addedCount} product(s) to your cart.`,
          type: "success",
        });
      }
      if (res.unavailableCount > 0 && res.messages.length > 0) {
        addToast({
          title: "Availability Notice",
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
      setReorderingOrderId(null);
    }
  };

  const handleBuySingleItemAgain = (item: OrderItemDetail) => {
    if (!item.product_id) return;
    setReorderingProductId(item.id);
    addItem(
      {
        id: item.product_id,
        productId: item.product_id,
        title: item.title,
        price: Number(item.unit_price),
        image: item.products?.product_images?.[0]?.image_url || "",
      },
      1
    );
    addToast({
      title: "Added to Cart",
      description: `"${item.title}" added to your cart.`,
      type: "success",
    });
    openDrawer();
    setReorderingProductId(null);
  };

  // Open Return / Replacement Modal for Item
  const handleStartReturn = (order: CustomerOrderWithItems, item: OrderItemDetail) => {
    const storeObj = Array.isArray(item.stores) ? item.stores[0] : item.stores;
    const catObj = item.products?.categories;
    const imgUrl = item.products?.product_images?.[0]?.image_url;

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
      productId: item.product_id || item.products?.id || "",
      title: item.title,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      sku: item.sku,
      imageUrl: imgUrl,
      categoryId: item.products?.category_id || catObj?.id,
      categorySlug: catObj?.slug,
      sellerStoreName: storeObj?.name,
      return_allowed: (item.products as Record<string, unknown>)?.return_allowed as boolean | undefined,
      return_window_days: (item.products as Record<string, unknown>)?.return_window_days as number | undefined,
      replacement_allowed: (item.products as Record<string, unknown>)?.replacement_allowed as boolean | undefined,
      replacement_window_days: (item.products as Record<string, unknown>)?.replacement_window_days as number | undefined,
      allocatedDiscount: itemAllocatedDiscount,
      effectiveUnitPrice,
    });
    setIsReturnModalOpen(true);
  };

  // Open Write / Edit Review Modal for Item
  const handleOpenReview = (order: CustomerOrderWithItems, item: OrderItemDetail) => {
    const prodId = item.product_id || item.products?.id;
    if (!prodId) return;

    const existing = reviewsMap[prodId] || null;
    setReviewTarget({
      productId: prodId,
      productTitle: item.title,
      orderId: order.id,
      orderNumber: order.order_number,
      imageUrl: item.products?.product_images?.[0]?.image_url,
      existingReview: existing,
    });
    setIsReviewModalOpen(true);
  };

  // Open Cancel Modal
  const handleOpenCancel = (order: CustomerOrderWithItems) => {
    setCancelModalOrderId(order.id);
    setCancelModalOrderNumber(order.order_number);
    setIsCancelModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-1">
          Order History
        </h1>
        <p className="text-sm text-foreground-secondary">
          Track shipments, write verified reviews, request returns or replacements, and buy favourite items again.
        </p>
      </div>

      {isLoading ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3 bg-card rounded-3xl border border-border">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-foreground-secondary">Loading your order history...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-4 bg-card rounded-3xl border border-dashed border-border">
          <Package className="w-14 h-14 text-foreground-secondary/40" />
          <h3 className="font-serif font-bold text-xl text-foreground">No orders yet</h3>
          <p className="text-xs text-foreground-secondary max-w-sm">
            Once you place an order, you will be able to review items, request easy returns, and track deliveries directly from this dashboard.
          </p>
          <Link href="/products" className="mt-2">
            <Button variant="primary" size="sm">
              Start Shopping
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {orders.map((order) => {
            const custStage = mapInternalToCustomerStage(
              order.internal_status || order.fulfillment_status
            );
            const isDelivered = custStage === "DELIVERED";
            const isCancelled = custStage === "CANCELLED";
            const isReorderingOrder = reorderingOrderId === order.id;

            // Check if any item in this order has an active return or replacement request
            const activeReturnOnOrder = order.order_items?.map((it) => returnsMap[it.id]).find(Boolean);

            // Check Cancellation Eligibility
            const cancelCheck = checkOrderCancellationEligibility({
              internal_status: order.internal_status,
              fulfillment_status: order.fulfillment_status,
            });

            return (
              <div
                key={order.id}
                className="bg-card border border-border rounded-3xl overflow-hidden shadow-xs transition-shadow hover:shadow-md"
              >
                {/* Order Header */}
                <div className="p-5 md:px-6 bg-background-secondary/40 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div>
                      <div className="text-xs text-foreground-secondary uppercase tracking-wider font-semibold">
                        Order Placed
                      </div>
                      <div className="text-xs font-bold text-foreground">
                        {formatDate(order.created_at)}
                      </div>
                    </div>

                    <div className="hidden sm:block w-px h-7 bg-border" />

                    <div>
                      <div className="text-xs text-foreground-secondary uppercase tracking-wider font-semibold">
                        Total Amount
                      </div>
                      <div className="text-xs font-black text-foreground">
                        {formatCurrency(order.total)}
                      </div>
                    </div>

                    <div className="hidden sm:block w-px h-7 bg-border" />

                    <div>
                      <div className="text-xs text-foreground-secondary uppercase tracking-wider font-semibold">
                        Order #
                      </div>
                      <div className="text-xs font-mono font-bold text-foreground">
                        {order.order_number}
                      </div>
                    </div>
                  </div>

                  {/* Header Badges & Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(Boolean(order.is_replacement) || (typeof order.notes === "string" && order.notes.includes("Replacement order"))) && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-2xs">
                        <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Replacement Order</span>
                      </span>
                    )}

                    {activeReturnOnOrder ? (
                      <>
                        {/* High-Priority Active Return/Replacement Lifecycle Badge */}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs">
                          {activeReturnOnOrder.request_type === "replacement" ? (
                            <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          )}
                          <span>{getActiveReturnDisplayLabel(activeReturnOnOrder.status, activeReturnOnOrder.request_type)}</span>
                        </span>

                        {/* Preserved Historical Delivered Record */}
                        {isDelivered && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Delivered</span>
                          </span>
                        )}
                      </>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                          custStage === "DELIVERED"
                            ? "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800"
                            : custStage === "CANCELLED"
                            ? "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800"
                            : custStage === "SHIPPED" || custStage === "IN TRANSIT"
                            ? "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                            : "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        {custStage === "DELIVERED" ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : custStage === "CANCELLED" ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Truck className="w-3.5 h-3.5" />
                        )}
                        <span>{custStage}</span>
                      </span>
                    )}

                    {/* Cancellation Button / Notice */}
                    {!isCancelled && !isDelivered && (
                      cancelCheck.canCancel ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenCancel(order)}
                          className="h-8 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-300"
                        >
                          Cancel Order
                        </Button>
                      ) : (
                        <span
                          title="Cancellation unavailable once order enters transit."
                          className="text-[11px] font-semibold text-foreground-secondary/70 bg-background-secondary px-2.5 py-1 rounded-lg border border-border"
                        >
                          Cancellation unavailable (Shipped)
                        </span>
                      )
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenInvoice(order)}
                      className="h-8 text-xs font-semibold gap-1 border-border"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">Invoice</span>
                    </Button>

                    <Link href={`/account/orders/${order.id}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold gap-1"
                      >
                        <span>Details</span>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Replacement Order Context Banner */}
                {(Boolean(order.is_replacement) || (typeof order.notes === "string" && order.notes.includes("Replacement order"))) && (() => {
                  const linkedRet = replOrdersMap[order.id];
                  const rawDiff = order.replacement_difference !== undefined && order.replacement_difference !== null
                    ? Number(order.replacement_difference)
                    : linkedRet?.replacement_price_difference !== undefined && linkedRet?.replacement_price_difference !== null
                    ? Number(linkedRet.replacement_price_difference)
                    : linkedRet?.refund_details?.calculatedPriceDifference !== undefined
                    ? Number(linkedRet.refund_details.calculatedPriceDifference)
                    : undefined;
                  const creditStatus = linkedRet?.refund_details?.walletCreditStatus;
                  const creditAmount = linkedRet?.refund_details?.walletCreditAmount;
                  const isCredit = (rawDiff !== undefined && rawDiff < 0) || (creditAmount !== undefined && creditAmount > 0);
                  const resolvedCreditAmt = Math.abs(rawDiff !== undefined && rawDiff < 0 ? rawDiff : creditAmount ?? 0);

                  return (
                    <div className="px-5 py-3 bg-purple-50/70 dark:bg-purple-950/30 border-b border-purple-200/80 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-purple-950 dark:text-purple-200">
                        <RefreshCw className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span>
                          <strong>Doorstep Exchange:</strong> Replacement order for original purchase.{" "}
                          {rawDiff !== undefined && rawDiff > 0 ? (
                            <span className="text-amber-800 dark:text-amber-300 font-semibold">
                              (Paid difference: {formatCurrency(rawDiff)})
                            </span>
                          ) : isCredit && resolvedCreditAmt > 0 ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              ({creditStatus === "CREDITED" ? "Wallet credited: +" : "Pending wallet credit: +"}{formatCurrency(resolvedCreditAmt)})
                            </span>
                          ) : (
                            <span className="text-purple-800 dark:text-purple-300 font-semibold">(₹0 Even Exchange)</span>
                          )}
                        </span>
                      </div>
                      {Boolean(order.original_order_id || linkedRet?.order_id) && (
                        <Link
                          href={`/account/orders/${order.original_order_id || linkedRet?.order_id}`}
                          className="text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline inline-flex items-center gap-1"
                        >
                          <span>View Original Order</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  );
                })()}

                {/* Items List Inside Order */}
                <div className="divide-y divide-border/60">
                  {order.order_items?.map((item) => {
                    const prod = item.products;
                    const catObj = prod?.categories;
                    const storeObj = Array.isArray(item.stores) ? item.stores[0] : item.stores;
                    const imgUrl = prod?.product_images?.[0]?.image_url;
                    const prodId = item.product_id || prod?.id;

                    const review = prodId ? reviewsMap[prodId] : null;
                    const activeReturn = returnsMap[item.id];

                    // Evaluate product return & replacement policy
                    const policy = evaluateProductReturnPolicy({
                      categoryId: prod?.category_id || catObj?.id,
                      categorySlug: catObj?.slug,
                      categoryName: catObj?.name,
                      sku: item.sku,
                      tags: (prod as Record<string, unknown>)?.tags as string[] | null | undefined,
                      return_allowed: (prod as Record<string, unknown>)?.return_allowed as boolean | undefined,
                      return_window_days: (prod as Record<string, unknown>)?.return_window_days as number | undefined,
                      replacement_allowed: (prod as Record<string, unknown>)?.replacement_allowed as boolean | undefined,
                      replacement_window_days: (prod as Record<string, unknown>)?.replacement_window_days as number | undefined,
                      replacement_selectable: (prod as Record<string, unknown>)?.replacement_selectable as boolean | undefined,
                    });

                    // Check item delivery eligibility
                    const returnElig = checkItemReturnEligibility({
                      orderInternalStatus: order.internal_status,
                      orderFulfillmentStatus: order.fulfillment_status,
                      deliveredAt: order.delivered_at,
                      orderUpdatedAt: (order.updated_at as string | null) || null,
                      policy,
                      hasActiveReturnOrReplacement: Boolean(activeReturn),
                    });

                    const isReorderingThis = reorderingProductId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        {/* Product Info */}
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-background-secondary shrink-0 relative overflow-hidden border border-border flex items-center justify-center">
                            {imgUrl ? (
                              <Image src={imgUrl} alt={item.title} fill className="object-cover" />
                            ) : (
                              <Package className="w-7 h-7 text-foreground-secondary/40" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm md:text-base text-foreground truncate">
                              {item.title}
                            </h4>

                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground-secondary mt-1">
                              {storeObj?.name && (
                                <span className="flex items-center gap-1 font-medium text-foreground">
                                  <Store className="w-3.5 h-3.5 text-blue-600" />
                                  <span>{storeObj.name}</span>
                                </span>
                              )}
                              <span>•</span>
                              <span>Qty: {item.quantity}</span>
                              <span>•</span>
                              <span className="font-semibold text-foreground">
                                {formatCurrency(Number(item.unit_price))}
                              </span>
                            </div>

                            {/* Return Policy Notice if non-returnable & non-replaceable */}
                            {!policy.isReturnEligible && !policy.isReplacementEligible && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 font-medium">
                                ℹ {policy.badgeTitle}
                              </p>
                            )}

                            {/* Active Return Status Tag */}
                            {activeReturn && (
                              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold">
                                <Clock className="w-3 h-3 text-blue-600" />
                                <span>
                                  {getActiveReturnDisplayLabel(activeReturn.status, activeReturn.request_type)} (#{activeReturn.return_number})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Direct Product Actions */}
                        <div className="flex items-center gap-2 flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                          {/* Write / Edit Review (Only available after delivery) */}
                          {isDelivered && (
                            review ? (
                              <button
                                type="button"
                                onClick={() => handleOpenReview(order, item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors shadow-2xs"
                              >
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                <span>Reviewed ★ {review.rating}/5</span>
                                <span className="text-[10px] text-foreground-secondary/70 font-normal">
                                  • Edit
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenReview(order, item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-2xs"
                              >
                                <Star className="w-3.5 h-3.5 text-blue-600" />
                                <span>Write Review</span>
                              </button>
                            )
                          )}

                          {/* Return / Replacement Actions */}
                          {activeReturn ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTrackingReturnId(activeReturn.id);
                                setIsTrackingModalOpen(true);
                              }}
                              className="h-8 text-xs font-bold border-blue-300 text-blue-800 dark:text-blue-300 hover:bg-blue-50"
                            >
                              Track {activeReturn.request_type?.toLowerCase() === "replacement" ? "Exchange" : "Return"}
                            </Button>
                          ) : isDelivered && (policy.isReturnEligible || policy.isReplacementEligible) ? (
                            returnElig.canRequest ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStartReturn(order, item)}
                                className="h-8 text-xs font-bold border-accent/40 text-accent hover:bg-accent/10 flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Return / Replacement</span>
                              </Button>
                            ) : returnElig.status === "EXPIRED" ? (
                              <span
                                title="Return / replacement eligibility window has expired."
                                className="px-2.5 py-1 rounded-lg bg-background-secondary border border-border text-[11px] font-semibold text-foreground-secondary/70 cursor-not-allowed"
                              >
                                Return window expired
                              </span>
                            ) : null
                          ) : null}

                          {/* Buy Again (Individual Item) */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isReorderingThis}
                            onClick={() => handleBuySingleItemAgain(item)}
                            className="h-8 text-xs font-semibold border-border hover:bg-background-secondary flex items-center gap-1.5"
                          >
                            {isReorderingThis ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 text-foreground-secondary" />
                            )}
                            <span>Buy Again</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invoice Modal */}
      {activeInvoiceOrder && (
        <InvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
          order={activeInvoiceOrder}
          items={activeInvoiceItems as never}
          customerProfile={customerProfile as never}
        />
      )}

      {/* Return & Replacement Request Modal */}
      <ReturnReplacementModal
        isOpen={isReturnModalOpen}
        onClose={() => {
          setIsReturnModalOpen(false);
          setReturnModalItem(null);
        }}
        item={returnModalItem}
        onSuccess={() => {
          loadAllOrders();
        }}
      />

      {/* Return Tracking Modal */}
      <ReturnTrackingModal
        isOpen={isTrackingModalOpen}
        onClose={() => {
          setIsTrackingModalOpen(false);
          setTrackingReturnId(null);
        }}
        returnId={trackingReturnId}
      />

      {/* Cancel Order Modal */}
      <CancelOrderModal
        isOpen={isCancelModalOpen}
        onClose={() => {
          setIsCancelModalOpen(false);
          setCancelModalOrderId(null);
        }}
        orderId={cancelModalOrderId}
        orderNumber={cancelModalOrderNumber}
        onSuccess={() => {
          loadAllOrders();
        }}
      />

      {/* Write / Edit Review Modal */}
      <WriteReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => {
          setIsReviewModalOpen(false);
          setReviewTarget(null);
        }}
        target={reviewTarget}
        onSuccess={(revData) => {
          if (reviewTarget) {
            setReviewsMap((prev) => ({
              ...prev,
              [reviewTarget.productId]: {
                id: "rev_" + Date.now(),
                product_id: reviewTarget.productId,
                rating: revData.rating,
                title: revData.title || null,
                body: revData.body,
              },
            }));
          }
        }}
      />
    </div>
  );
}
