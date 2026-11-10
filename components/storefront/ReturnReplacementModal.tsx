"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  Package,
  ArrowRight,
  ShieldCheck,
  Building,
  Smartphone,
  Loader2,
  X,
  Search,
  Check,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

export interface ReturnModalItem {
  id: string; // order_item_id
  orderId: string;
  orderNumber: string;
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sku?: string;
  imageUrl?: string;
  categoryId?: string;
  categorySlug?: string;
  sellerStoreName?: string;
  return_allowed?: boolean | null;
  return_window_days?: number | null;
  replacement_allowed?: boolean | null;
  replacement_window_days?: number | null;
  allocatedDiscount?: number;
  walletTender?: number;
  codOrGatewayTender?: number;
  effectiveUnitPrice?: number;
}

export interface ReplacementProductOption {
  id: string;
  title: string;
  price: number;
  sale_price?: number | null;
  sku?: string;
  stock_quantity?: number | null;
  track_inventory?: boolean | null;
  allow_backorders?: boolean | null;
  product_images?: Array<{ image_url: string }>;
  stores?: { name?: string };
}

export interface SelectedReplacementItem {
  product: ReplacementProductOption;
  quantity: number;
}

interface ReturnReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ReturnModalItem | null;
  onSuccess?: (returnNumber: string) => void;
  initialStep?: "CHOICE" | "RETURN_DETAILS" | "REFUND_DETAILS" | "REPLACEMENT_SELECT" | "SUCCESS";
  initialSelectedReplacements?: SelectedReplacementItem[];
}

const DEFAULT_EMPTY_REPLACEMENTS: SelectedReplacementItem[] = [];

export function ReturnReplacementModal({
  isOpen,
  onClose,
  item,
  onSuccess,
  initialStep = "CHOICE",
  initialSelectedReplacements = DEFAULT_EMPTY_REPLACEMENTS,
}: ReturnReplacementModalProps) {
  const { addToast } = useToast();

  const [step, setStep] = useState<
    "CHOICE" | "RETURN_DETAILS" | "REFUND_DETAILS" | "REPLACEMENT_SELECT" | "SUCCESS"
  >(initialStep);
  const [requestType, setRequestType] = useState<"return" | "replacement">(
    initialStep === "REPLACEMENT_SELECT" ? "replacement" : "return"
  );
  const [quantityToReturn, setQuantityToReturn] = useState<number>(1);

  // Return Reason State
  const [reasonCode, setReasonCode] = useState<string>("DEFECTIVE_DAMAGED");
  const [customReasonText, setCustomReasonText] = useState<string>("");

  // Refund State
  const [refundMethod, setRefundMethod] = useState<"UPI" | "BANK_ACCOUNT">("UPI");
  const [upiId, setUpiId] = useState<string>("");
  const [bankHolder, setBankHolder] = useState<string>("");
  const [bankAccount, setBankAccount] = useState<string>("");
  const [bankIfsc, setBankIfsc] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [bankBranch, setBankBranch] = useState<string>("");

  // Multi-Product Replacement State
  const [replacementProducts, setReplacementProducts] = useState<ReplacementProductOption[]>([]);
  const [isLoadingReplacements, setIsLoadingReplacements] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [selectedReplacements, setSelectedReplacements] = useState<SelectedReplacementItem[]>(
    initialSelectedReplacements
  );
  const [replacementSearch, setReplacementSearch] = useState<string>("");
  const [replacementPaymentMethod, setReplacementPaymentMethod] = useState<"UPI" | "COD">("UPI");
  const [isSelectionExpanded, setIsSelectionExpanded] = useState<boolean>(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedResult, setSubmittedResult] = useState<{
    returnNumber: string;
    requestType: "return" | "replacement";
    refundAmount: number;
    priceDifference: number;
    walletCreditApplied?: boolean;
    walletCreditAmount?: number;
    itemsCount?: number;
  } | null>(null);

  // Track opening lifecycle to ONLY reset state when modal opens or item changes
  const prevOpenRef = useRef(false);
  const prevItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && item) {
      const isOpening = !prevOpenRef.current;
      const isDifferentItem = item.id !== prevItemIdRef.current;

      if (isOpening || isDifferentItem) {
        setStep(initialStep);
        setRequestType(initialStep === "REPLACEMENT_SELECT" ? "replacement" : "return");
        setQuantityToReturn(1);
        setReasonCode("DEFECTIVE_DAMAGED");
        setCustomReasonText("");
        setRefundMethod("UPI");
        setUpiId("");
        setBankHolder("");
        setBankAccount("");
        setBankIfsc("");
        setBankName("");
        setBankBranch("");
        setSelectedReplacements(initialSelectedReplacements);
        setReplacementSearch("");
        setPage(1);
        setHasMore(false);
        setSubmittedResult(null);
        setIsSelectionExpanded(false);
      }
    }
    prevOpenRef.current = isOpen;
    prevItemIdRef.current = item?.id || null;
  }, [isOpen, item?.id, initialStep]);

  // Initial load or search query change: fetch first page (max 10 products)
  useEffect(() => {
    if (step === "REPLACEMENT_SELECT" && item) {
      const fetchInitial = async () => {
        setIsLoadingReplacements(true);
        try {
          const params = new URLSearchParams();
          const trimmedSearch = replacementSearch.trim();

          params.set("page", "1");
          params.set("limit", "10");

          if (trimmedSearch) {
            // Global search: Do NOT send categoryId
            params.set("q", trimmedSearch);
          } else if (item.categoryId) {
            // Initial view without search: Send categoryId for category prioritization
            params.set("categoryId", item.categoryId);
          }

          if (item.productId) {
            params.set("excludeProductId", item.productId);
          }

          const res = await fetch(`/api/products/replacement-options?${params.toString()}`);
          const data = await res.json();
          if (res.ok && data.success && Array.isArray(data.products)) {
            setReplacementProducts(data.products);
            setHasMore(Boolean(data.hasMore));
            setPage(1);
          } else {
            addToast({
              title: "Catalog Unavailable",
              description: data?.message || "Failed to load replacement options.",
              type: "error",
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Error loading replacement options.";
          addToast({
            title: "Error Loading Catalog",
            description: msg,
            type: "error",
          });
        } finally {
          setIsLoadingReplacements(false);
        }
      };
      fetchInitial();
    }
  }, [step, item?.id, item?.categoryId, item?.productId, replacementSearch]);

  // Lock body scroll unconditionally when modal is open, restore on close or unmount
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Load More Handler: fetches next page and appends without duplicates
  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || !item) return;

    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const params = new URLSearchParams();
      const trimmedSearch = replacementSearch.trim();

      params.set("page", String(nextPage));
      params.set("limit", "10");

      if (trimmedSearch) {
        params.set("q", trimmedSearch);
      } else if (item.categoryId) {
        params.set("categoryId", item.categoryId);
      }

      if (item.productId) {
        params.set("excludeProductId", item.productId);
      }

      const res = await fetch(`/api/products/replacement-options?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.products)) {
        setReplacementProducts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newUnique = data.products.filter((p: ReplacementProductOption) => !existingIds.has(p.id));
          return [...prev, ...newUnique];
        });
        setPage(nextPage);
        setHasMore(Boolean(data.hasMore));
      } else {
        addToast({
          title: "Load More Failed",
          description: data?.message || "Failed to load more products.",
          type: "error",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading more products.";
      addToast({
        title: "Network Error",
        description: msg,
        type: "error",
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (!isOpen || !item) return null;

  const unitPrice = Number(item.unitPrice || 0);
  const purchasedQty = Math.max(1, Number(item.quantity || 1));
  const totalItemDiscount = Number(item.allocatedDiscount || 0);
  const allocatedDiscountForQty = Number(((totalItemDiscount / purchasedQty) * quantityToReturn).toFixed(2));
  const originalGrossValue = Number((unitPrice * quantityToReturn).toFixed(2));
  const originalEligibleValue = Number(Math.max(0, originalGrossValue - allocatedDiscountForQty).toFixed(2));

  const getEffectivePrice = (p: ReplacementProductOption) =>
    p.sale_price && p.sale_price > 0 && p.sale_price < p.price ? Number(p.sale_price) : Number(p.price);

  const getMaxAvailableQuantity = (p: ReplacementProductOption): number => {
    if (p.track_inventory && !p.allow_backorders) {
      return Math.max(0, p.stock_quantity ?? 0);
    }
    return 999;
  };

  // Multi-product calculations (Quantity is independent of original purchased quantity)
  const totalSelectedQuantity = selectedReplacements.reduce((sum, it) => sum + it.quantity, 0);

  const replacementTotalValue = selectedReplacements.reduce(
    (sum, it) => sum + getEffectivePrice(it.product) * it.quantity,
    0
  );
  const priceDifference = Number((replacementTotalValue - originalEligibleValue).toFixed(2));

  // Multi-product selection handlers
  const handleSelectProduct = (product: ReplacementProductOption) => {
    const maxStock = getMaxAvailableQuantity(product);
    if (maxStock <= 0) {
      addToast({
        title: "Out of Stock",
        description: `"${product.title}" is currently out of stock.`,
        type: "error",
      });
      return;
    }

    const existingIndex = selectedReplacements.findIndex((s) => s.product.id === product.id);

    if (existingIndex >= 0) {
      // Already selected: increment quantity if stock permits
      const current = selectedReplacements[existingIndex];
      if (current.quantity + 1 > maxStock) {
        addToast({
          title: "Stock Limit",
          description: `Only ${maxStock} units are currently available for "${product.title}".`,
          type: "info",
        });
        return;
      }
      setSelectedReplacements((prev) =>
        prev.map((s, idx) => (idx === existingIndex ? { ...s, quantity: s.quantity + 1 } : s))
      );
    } else {
      setSelectedReplacements((prev) => [...prev, { product, quantity: 1 }]);
    }
  };

  const handleUpdateItemQuantity = (productId: string, delta: number) => {
    setSelectedReplacements((prev) => {
      return prev
        .map((s) => {
          if (s.product.id === productId) {
            const nextQty = s.quantity + delta;
            if (nextQty <= 0) return null;
            const maxStock = getMaxAvailableQuantity(s.product);
            if (delta > 0 && nextQty > maxStock) {
              addToast({
                title: "Stock Limit",
                description: `Only ${maxStock} units are currently available for "${s.product.title}".`,
                type: "info",
              });
              return s;
            }
            return { ...s, quantity: nextQty };
          }
          return s;
        })
        .filter((s): s is SelectedReplacementItem => s !== null);
    });
  };

  const handleRemoveSelectedItem = (productId: string) => {
    setSelectedReplacements((prev) => prev.filter((s) => s.product.id !== productId));
  };

  // Step 1: Handle Choice
  const handleChoiceContinue = () => {
    if (requestType === "return") {
      setStep("RETURN_DETAILS");
    } else {
      if (item && item.replacement_allowed === false) {
        addToast({
          title: "Replacement Not Allowed",
          description: "This item is not eligible for replacement per policy.",
          type: "error",
        });
        return;
      }
      setStep("REPLACEMENT_SELECT");
    }
  };

  // Step 2 Return: Handle Reason Continue
  const handleReasonContinue = () => {
    if (reasonCode === "OTHER" && (!customReasonText.trim() || customReasonText.trim().length < 3)) {
      addToast({
        title: "Reason Required",
        description: "Please describe the reason for returning this item.",
        type: "error",
      });
      return;
    }
    setStep("REFUND_DETAILS");
  };

  // Submit Final Return or Replacement
  const handleSubmit = async () => {
    if (isSubmitting || !item) return;

    if (requestType === "return") {
      if (refundMethod === "UPI") {
        if (!upiId.trim() || !upiId.includes("@") || upiId.length < 5) {
          addToast({
            title: "Invalid UPI ID",
            description: "Please enter a valid UPI address (e.g. name@okhdfcbank).",
            type: "error",
          });
          return;
        }
      } else if (refundMethod === "BANK_ACCOUNT") {
        if (!bankHolder.trim() || !bankAccount.trim() || !bankIfsc.trim()) {
          addToast({
            title: "Bank Details Incomplete",
            description: "Please fill in Account Holder, Account Number, and IFSC Code.",
            type: "error",
          });
          return;
        }
      }
    } else if (requestType === "replacement") {
      if (selectedReplacements.length === 0) {
        addToast({
          title: "Select Replacement",
          description: "Please choose at least one replacement product to proceed.",
          type: "error",
        });
        return;
      }
      if (totalSelectedQuantity <= 0) {
        addToast({
          title: "Invalid Replacement Quantity",
          description: "Please choose at least one replacement unit to proceed.",
          type: "error",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        orderId: item.orderId,
        orderItemId: item.id,
        requestType,
        quantity: quantityToReturn,
        reasonCode,
        reasonText: reasonCode === "OTHER" ? customReasonText.trim() : undefined,
      };

      if (requestType === "return") {
        payload.refundMethod = refundMethod;
        payload.refundDetails =
          refundMethod === "UPI"
            ? { method: "UPI", upiId: upiId.trim() }
            : {
                method: "BANK_ACCOUNT",
                accountHolder: bankHolder.trim(),
                accountNumber: bankAccount.trim(),
                ifscCode: bankIfsc.trim().toUpperCase(),
                bankName: bankName.trim() || undefined,
                branch: bankBranch.trim() || undefined,
              };
      } else {
        // Multi-product replacement payload
        payload.replacementItems = selectedReplacements.map((s) => ({
          productId: s.product.id,
          quantity: s.quantity,
        }));
        payload.replacementProductId = selectedReplacements[0]?.product.id;
        payload.replacementQuantity = totalSelectedQuantity;
        payload.replacementPaymentMethod = priceDifference > 0 ? replacementPaymentMethod : undefined;
      }

      const res = await fetch("/api/returns/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit request.");
      }

      setSubmittedResult({
        returnNumber: data.returnNumber,
        requestType,
        refundAmount: data.refundAmount,
        priceDifference: data.priceDifference,
        walletCreditApplied: data.walletCreditApplied,
        walletCreditAmount: data.walletCreditAmount,
        itemsCount: selectedReplacements.length,
      });

      setStep("SUCCESS");
      if (onSuccess) onSuccess(data.returnNumber);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit request.";
      addToast({
        title: "Request Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col ${
          step === "REPLACEMENT_SELECT"
            ? "h-[94dvh] sm:h-[90vh] sm:max-h-[820px]"
            : "h-[94dvh] sm:h-auto sm:max-h-[90vh]"
        }`}
      >
        {/* Header — fixed/non-shrinking */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-border flex items-center justify-between bg-background-secondary/30 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
              {requestType === "return" ? (
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
              ) : (
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
              )}
            </div>
            <div>
              <h3 className="font-serif font-bold text-base sm:text-lg text-foreground leading-tight">
                {step === "CHOICE"
                  ? "Return / Replacement"
                  : step === "RETURN_DETAILS"
                  ? "Select Return Reason"
                  : step === "REFUND_DETAILS"
                  ? "Refund Method"
                  : step === "REPLACEMENT_SELECT"
                  ? "Choose Replacement Products"
                  : "Request Submitted"}
              </h3>
              <p className="text-[11px] sm:text-xs text-foreground-secondary font-mono">
                Order #{item.orderNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-background-secondary flex items-center justify-center text-foreground-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product Snapshot Bar (Original Product Summary) — fixed/non-shrinking */}
        <div className="px-4 sm:px-6 py-2 sm:py-2.5 bg-background border-b border-border/60 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-background-secondary flex-shrink-0 flex items-center justify-center overflow-hidden relative border border-border">
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
              ) : (
                <Package className="w-4 h-4 text-foreground-secondary/40" />
              )}
            </div>
            <div className="min-w-0 truncate">
              <p className="font-semibold text-foreground truncate text-xs">{item.title}</p>
              <p className="text-foreground-secondary text-[11px]">
                {item.quantity > 1 ? `Ordered: ${item.quantity} units • ` : ""}
                Price: {formatCurrency(item.unitPrice)}
              </p>
            </div>
          </div>
          {item.quantity > 1 && step !== "SUCCESS" && (
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-[11px] text-foreground-secondary font-medium">Qty:</span>
              <select
                value={quantityToReturn}
                onChange={(e) => {
                  const newQty = Number(e.target.value);
                  setQuantityToReturn(newQty);
                }}
                className="bg-card border border-border rounded-lg text-xs px-2 py-0.5 font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {Array.from({ length: item.quantity }, (_, i) => i + 1).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className={`flex-1 min-h-0 ${step === "REPLACEMENT_SELECT" ? "flex flex-col overflow-hidden" : "p-6 overflow-y-auto space-y-6"}`}>
          {/* STEP 1: CHOICE */}
          {step === "CHOICE" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
                What would you like to do?
              </p>

              <label
                onClick={() => setRequestType("return")}
                className={`flex items-start gap-3.5 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  requestType === "return"
                    ? "border-accent bg-accent/5 shadow-xs"
                    : "border-border hover:bg-background-secondary/30"
                }`}
              >
                <input
                  type="radio"
                  name="request_choice"
                  value="return"
                  checked={requestType === "return"}
                  onChange={() => setRequestType("return")}
                  className="mt-1 text-accent focus:ring-accent"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-sm text-foreground">Return & Get Refund</span>
                  </div>
                  <p className="text-xs text-foreground-secondary mt-1 leading-relaxed">
                    Product is picked up from your doorstep and your refund will be deposited directly into your UPI or Bank Account after quality verification.
                  </p>
                </div>
              </label>

              <label
                onClick={() => {
                  if (item?.replacement_allowed === false) {
                    addToast({
                      title: "Replacement Not Eligible",
                      description: "This product is not eligible for replacement per policy.",
                      type: "info",
                    });
                    return;
                  }
                  setRequestType("replacement");
                }}
                className={`flex items-start gap-3.5 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  item?.replacement_allowed === false
                    ? "opacity-60 cursor-not-allowed border-border"
                    : requestType === "replacement"
                    ? "border-accent bg-accent/5 shadow-xs"
                    : "border-border hover:bg-background-secondary/30"
                }`}
              >
                <input
                  type="radio"
                  name="request_choice"
                  value="replacement"
                  disabled={item?.replacement_allowed === false}
                  checked={requestType === "replacement"}
                  onChange={() => {
                    if (item?.replacement_allowed !== false) {
                      setRequestType("replacement");
                    }
                  }}
                  className="mt-1 text-accent focus:ring-accent disabled:opacity-50"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-sm text-foreground">Replacement (Single or Multi-Product)</span>
                    {item?.replacement_allowed === false && (
                      <span className="text-[10px] text-red-500 font-semibold ml-2">
                        (Not eligible for replacement)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-secondary mt-1 leading-relaxed">
                    Choose one or multiple replacement products from any category across the marketplace. Price differences are credited to your customer wallet or adjusted smoothly.
                  </p>
                </div>
              </label>

              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-start gap-3 text-xs text-blue-900 dark:text-blue-300">
                <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  Authoritative Doorstep Service: Reverse pickup and replacement delivery are coordinated directly by VENDOSMITH.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: RETURN DETAILS (Reason Selection) */}
          {step === "RETURN_DETAILS" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
                Why are you returning this product?
              </p>

              <div className="space-y-2.5">
                {[
                  { code: "DEFECTIVE_DAMAGED", label: "Product is defective / damaged" },
                  { code: "QUALITY_NOT_SATISFACTORY", label: "Product quality is not satisfactory" },
                  { code: "SIZE_FIT_ISSUE", label: "Size / fit issue" },
                  { code: "WRONG_PRODUCT", label: "Wrong product received" },
                  { code: "DOES_NOT_MATCH_DESCRIPTION", label: "Product does not match description" },
                  { code: "OTHER", label: "Other / Custom reason" },
                ].map((r) => (
                  <label
                    key={r.code}
                    onClick={() => setReasonCode(r.code)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all text-xs font-semibold ${
                      reasonCode === r.code
                        ? "border-accent bg-accent/5 text-foreground shadow-2xs"
                        : "border-border text-foreground hover:bg-background-secondary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="return_reason"
                      checked={reasonCode === r.code}
                      onChange={() => setReasonCode(r.code)}
                      className="text-accent focus:ring-accent"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>

              {reasonCode === "OTHER" && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-bold text-foreground">
                    Please tell us the reason:
                  </label>
                  <textarea
                    rows={3}
                    value={customReasonText}
                    onChange={(e) => setCustomReasonText(e.target.value)}
                    placeholder="Provide a brief explanation of why you'd like to return this product..."
                    className="w-full p-3 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: REFUND DETAILS (UPI / Bank Account) */}
          {step === "REFUND_DETAILS" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
                  How would you like to receive your refund?
                </p>
                <p className="text-[11px] text-foreground-secondary mt-0.5">
                  Refund amount: <strong className="text-foreground">{formatCurrency(originalEligibleValue)}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRefundMethod("UPI")}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border-2 transition-all gap-1.5 ${
                    refundMethod === "UPI"
                      ? "border-accent bg-accent/5 text-foreground"
                      : "border-border text-foreground hover:bg-background-secondary/40"
                  }`}
                >
                  <Smartphone className="w-5 h-5 text-accent" />
                  <span className="text-xs font-bold">UPI</span>
                  <span className="text-[10px] text-foreground-secondary">Instant Direct Credit</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRefundMethod("BANK_ACCOUNT")}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border-2 transition-all gap-1.5 ${
                    refundMethod === "BANK_ACCOUNT"
                      ? "border-accent bg-accent/5 text-foreground"
                      : "border-border text-foreground hover:bg-background-secondary/40"
                  }`}
                >
                  <Building className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-bold">Bank Account</span>
                  <span className="text-[10px] text-foreground-secondary">Direct NEFT / IMPS</span>
                </button>
              </div>

              {refundMethod === "UPI" ? (
                <div className="space-y-2 p-4 rounded-2xl bg-background-secondary/20 border border-border">
                  <label className="text-xs font-bold text-foreground block">
                    Enter your UPI ID / VPA
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="e.g. yourname@okaxis or 9876543210@paytm"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="text-[11px] text-foreground-secondary">
                    Your UPI ID is encrypted and securely processed only by authorized admin finance operators.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-2xl bg-background-secondary/20 border border-border">
                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={bankHolder}
                      onChange={(e) => setBankHolder(e.target.value)}
                      placeholder="Name as printed on bank passbook"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      placeholder="e.g. 50100234567890"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-foreground block mb-1">
                        IFSC Code
                      </label>
                      <input
                        type="text"
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        placeholder="e.g. HDFC0001234"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-foreground block mb-1">
                        Bank Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. HDFC Bank"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Strict Privacy Notice */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-[11px] text-amber-800 dark:text-amber-400">
                <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Privacy Guarantee:</strong> Your UPI and bank details are never shared with merchants or sellers.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2 REPLACEMENT: MULTI-PRODUCT SELECTION */}
          {step === "REPLACEMENT_SELECT" && (
            <>
              {/* Search Bar — fixed/non-shrinking with spacious, polished UI */}
              <div className="px-3 sm:px-4 py-2 shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-xs">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-foreground-secondary absolute left-3 pointer-events-none transition-colors" />
                  <input
                    type="text"
                    value={replacementSearch}
                    onChange={(e) => setReplacementSearch(e.target.value)}
                    placeholder="Search replacement products (e.g. jacket, watch, paper)..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-background-secondary/30 hover:bg-background-secondary/50 focus:bg-background border border-border text-xs text-foreground placeholder:text-foreground-secondary/70 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                  />
                  {replacementSearch && (
                    <button
                      type="button"
                      onClick={() => setReplacementSearch("")}
                      className="absolute right-2.5 p-1 rounded-md text-foreground-secondary hover:text-foreground hover:bg-background-secondary transition-colors"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Products Section — compact summary row & collapsible edit panel */}
              {selectedReplacements.length > 0 && (
                <div className="shrink-0 border-b border-border/50 bg-accent/5">
                  {/* Compact Summary Row (~38-42px) */}
                  <div className="px-3 sm:px-4 py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <span className="font-bold text-accent">
                        Selected Products ({selectedReplacements.length})
                      </span>
                      <span className="text-[11px] text-foreground-secondary">·</span>
                      <span className="text-[11px] font-mono text-foreground-secondary truncate">
                        Total Units: <strong className="text-foreground">{totalSelectedQuantity}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsSelectionExpanded((prev) => !prev)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-accent/30 bg-card hover:bg-accent/10 text-accent text-xs font-semibold shrink-0 transition-colors shadow-2xs"
                      title={isSelectionExpanded ? "Collapse selected items" : "View and edit selected items"}
                    >
                      <span>{isSelectionExpanded ? "Collapse" : "View / Edit"}</span>
                      {isSelectionExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Controlled Expanded Panel (capped at max-h-28 ~ 112px on mobile) */}
                  {isSelectionExpanded && (
                    <div className="px-3 sm:px-4 pb-2.5 pt-0.5 space-y-1.5 max-h-28 sm:max-h-32 overflow-y-auto border-t border-accent/15 animate-in fade-in duration-150">
                      {selectedReplacements.map((s) => {
                        const effPrice = getEffectivePrice(s.product);
                        const lineTotal = effPrice * s.quantity;
                        const maxStock = getMaxAvailableQuantity(s.product);
                        const isAtMaxStock = s.quantity >= maxStock;

                        return (
                          <div
                            key={s.product.id}
                            className="flex items-center justify-between p-1.5 sm:p-2 rounded-xl bg-card border border-border text-xs gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground text-xs truncate" title={s.product.title}>
                                {s.product.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-foreground-secondary truncate">
                                <span>
                                  {formatCurrency(effPrice)} × {s.quantity} ={" "}
                                  <strong className="text-foreground">{formatCurrency(lineTotal)}</strong>
                                </span>
                                {maxStock < 999 && (
                                  <span className="text-[10px] text-foreground-secondary/70">
                                    (max: {maxStock})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(s.product.id, -1)}
                                className="w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg border border-border flex items-center justify-center hover:bg-background-secondary text-foreground-secondary transition-colors"
                                title="Decrease quantity"
                              >
                                <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              </button>
                              <span className="w-4 sm:w-5 text-center font-bold text-xs">{s.quantity}</span>
                              <button
                                type="button"
                                disabled={isAtMaxStock}
                                onClick={() => handleUpdateItemQuantity(s.product.id, 1)}
                                className="w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg border border-border flex items-center justify-center hover:bg-background-secondary text-foreground-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title={isAtMaxStock ? `Stock limit of ${maxStock} reached` : "Increase quantity"}
                              >
                                <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSelectedItem(s.product.id)}
                                className="w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg text-red-500 hover:bg-red-500/10 flex items-center justify-center ml-0.5 transition-colors"
                                title="Remove item"
                              >
                                <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Replacement Catalog — flex-1, min-h-0, independently scrollable */}
              <div className="p-2.5 sm:p-4 flex-1 min-h-0 overflow-y-auto space-y-2">
                <div className="text-[11px] font-semibold text-foreground-secondary uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Replacement Catalog</span>
                  <span className="text-[10px] font-normal lowercase">Unlimited products & units subject to stock</span>
                </div>

                {isLoadingReplacements ? (
                  <div className="p-8 text-center text-xs text-foreground-secondary flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                    <span>Loading replacement products...</span>
                  </div>
                ) : replacementProducts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-foreground-secondary bg-background-secondary/20 rounded-xl">
                    No replacement alternatives found for this search.
                  </div>
                ) : (
                  <>
                    {replacementProducts.map((p) => {
                      const price = getEffectivePrice(p);
                      const selectedItem = selectedReplacements.find((s) => s.product.id === p.id);
                      const isSelected = Boolean(selectedItem);
                      const img = p.product_images?.[0]?.image_url;
                      const maxStock = getMaxAvailableQuantity(p);
                      const isOutOfStock = maxStock <= 0;

                      return (
                        <div
                          key={p.id}
                          onClick={() => !isOutOfStock && handleSelectProduct(p)}
                          className={`flex items-center justify-between p-2 sm:p-3 rounded-xl border transition-all ${
                            isOutOfStock
                              ? "opacity-50 cursor-not-allowed border-border bg-background-secondary/10"
                              : isSelected
                              ? "border-accent bg-accent/5 shadow-2xs cursor-pointer"
                              : "border-border hover:bg-background-secondary/30 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-background-secondary flex-shrink-0 relative overflow-hidden border border-border flex items-center justify-center">
                              {img ? (
                                <Image src={img} alt={p.title} fill className="object-cover" />
                              ) : (
                                <Package className="w-4 h-4 text-foreground-secondary/40" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate" title={p.title}>
                                {p.title}
                              </p>
                              <p className="text-[11px] text-foreground-secondary truncate">
                                Price: <strong className="text-foreground">{formatCurrency(price)}</strong>
                                {p.track_inventory && !p.allow_backorders && (
                                  <span className={`ml-2 text-[10px] ${p.stock_quantity && p.stock_quantity > 0 ? "text-emerald-600 font-medium" : "text-red-500 font-bold"}`}>
                                    {p.stock_quantity && p.stock_quantity > 0 ? `${p.stock_quantity} in stock` : "Out of stock"}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 pl-2">
                            {isSelected ? (
                              <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-bold">
                                <Check className="w-3.5 h-3.5 stroke-3" />
                                <span>Added ({selectedItem?.quantity})</span>
                              </div>
                            ) : (
                              <span className={`text-xs font-bold px-2 sm:px-2.5 py-1 rounded-lg border ${
                                isOutOfStock
                                  ? "text-foreground-secondary/50 border-border"
                                  : "text-accent border-accent/30 hover:bg-accent/10"
                              }`}>
                                {isOutOfStock ? "Out of Stock" : "Select"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Load More Products Button */}
                    {hasMore && (
                      <div className="pt-2 text-center">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          disabled={isLoadingMore}
                          className="w-full py-2 px-3 rounded-xl border border-border bg-background-secondary/40 hover:bg-background-secondary text-xs font-bold text-foreground flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {isLoadingMore ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                              <span>Loading more products...</span>
                            </>
                          ) : (
                            <span>Load More Products</span>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Bill Summary — compact, non-shrinking */}
              {selectedReplacements.length > 0 && (
                <div className="px-3.5 sm:px-4 py-2 sm:py-2.5 shrink-0 border-t border-border/60 bg-background-secondary/40 space-y-1 text-xs">
                  {/* Financial Lines */}
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between text-foreground-secondary">
                      <span>Original Product Value:</span>
                      <span className="font-medium text-foreground">{formatCurrency(originalGrossValue)}</span>
                    </div>
                    {allocatedDiscountForQty > 0 && (
                      <div className="flex justify-between text-foreground-secondary">
                        <span>Coupon Discount Applied:</span>
                        <span className="font-medium text-amber-700 dark:text-amber-400">-{formatCurrency(allocatedDiscountForQty)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-foreground-secondary font-medium">
                      <span>Eligible Original Payment:</span>
                      <span className="text-foreground">{formatCurrency(originalEligibleValue)}</span>
                    </div>
                    <div className="flex justify-between text-foreground-secondary">
                      <span>Replacement Package Total:</span>
                      <span className="font-medium text-foreground">{formatCurrency(replacementTotalValue)}</span>
                    </div>

                    {priceDifference < 0 ? (
                      <div className="pt-1 border-t border-border/50 flex items-center justify-between">
                        <span className="text-emerald-600 font-bold">
                          Total Credit Due: +{formatCurrency(Math.abs(priceDifference))}
                        </span>
                        <span className="font-extrabold text-foreground">
                          Final Payable: <span className="text-emerald-600">₹0</span>
                        </span>
                      </div>
                    ) : priceDifference > 0 ? (
                      <div className="pt-1 border-t border-border/50 flex items-center justify-between">
                        <span className="text-amber-700 dark:text-amber-400 font-bold">
                          Additional Payment: {formatCurrency(priceDifference)}
                        </span>
                        <span className="font-extrabold text-foreground">
                          Final Payable: <span className="text-accent">{formatCurrency(priceDifference)}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="pt-1 border-t border-border/50 flex items-center justify-between">
                        <span className="text-emerald-600 font-medium">
                          Price Difference: ₹0
                        </span>
                        <span className="font-extrabold text-foreground">
                          Final Payable: ₹0
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Secondary details / actions */}
                  {priceDifference < 0 ? (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-tight">
                      ✓ ₹{Math.abs(priceDifference)} will be credited to your Customer Wallet upon pickup verification.
                    </p>
                  ) : priceDifference > 0 ? (
                    <div className="flex items-center justify-between pt-0.5 text-[11px]">
                      <span className="text-[10px] font-semibold text-foreground-secondary shrink-0">Pay Via:</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReplacementPaymentMethod("UPI")}
                          className={`py-0.5 px-2.5 rounded-lg border text-[10px] font-semibold transition-colors ${
                            replacementPaymentMethod === "UPI"
                              ? "border-accent bg-accent/10 text-accent font-bold"
                              : "border-border text-foreground hover:bg-background-secondary"
                          }`}
                        >
                          UPI / Online
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplacementPaymentMethod("COD")}
                          className={`py-0.5 px-2.5 rounded-lg border text-[10px] font-semibold transition-colors ${
                            replacementPaymentMethod === "COD"
                              ? "border-accent bg-accent/10 text-accent font-bold"
                              : "border-border text-foreground hover:bg-background-secondary"
                          }`}
                        >
                          Cash on Delivery
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}

          {/* STEP 4: SUCCESS CONFIRMATION */}
          {step === "SUCCESS" && submittedResult && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="font-serif font-bold text-xl text-foreground">
                  {submittedResult.requestType === "return"
                    ? "Return Request Submitted Successfully"
                    : "Replacement Request Submitted"}
                </h4>
                <p className="text-xs text-foreground-secondary mt-1">
                  Reference Request Number:{" "}
                  <strong className="font-mono text-accent">{submittedResult.returnNumber}</strong>
                </p>
              </div>

              <div className="max-w-md mx-auto p-4 rounded-2xl bg-background-secondary/30 border border-border text-xs text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Product:</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">{item.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Quantity:</span>
                  <span className="font-semibold text-foreground">{quantityToReturn} unit(s)</span>
                </div>

                {submittedResult.requestType === "return" ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-foreground-secondary">Refund Method:</span>
                      <span className="font-semibold text-foreground">{refundMethod}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/60 pt-2 font-bold">
                      <span className="text-foreground">Refund Amount:</span>
                      <span className="text-emerald-600">{formatCurrency(submittedResult.refundAmount)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-foreground-secondary">Replacements:</span>
                      <span className="font-semibold text-foreground">
                        {submittedResult.itemsCount || 1} product selection(s)
                      </span>
                    </div>
                    {submittedResult.walletCreditApplied && (
                      <div className="flex justify-between text-emerald-600 font-bold border-t border-border/60 pt-2">
                        <span>Wallet Credited:</span>
                        <span>+ {formatCurrency(submittedResult.walletCreditAmount || 0)}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="border-t border-border/60 pt-2 text-[11px] text-foreground-secondary">
                  <strong>Next Step:</strong> Pickup will be arranged. Our courier partner will collect the item from your registered address.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer — fixed/non-shrinking */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3.5 border-t border-border bg-background-secondary/30 flex items-center justify-between shrink-0">
          {step === "CHOICE" && (
            <>
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleChoiceContinue} className="text-xs font-bold gap-1">
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {step === "RETURN_DETAILS" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("CHOICE")} className="text-xs">
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={handleReasonContinue} className="text-xs font-bold gap-1">
                <span>Next: Refund Method</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {step === "REFUND_DETAILS" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("RETURN_DETAILS")} className="text-xs">
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="text-xs font-bold gap-1.5"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Submit Return Request</span>
              </Button>
            </>
          )}

          {step === "REPLACEMENT_SELECT" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("CHOICE")} className="text-xs">
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  selectedReplacements.length === 0 ||
                  totalSelectedQuantity <= 0
                }
                className="text-xs font-bold gap-1.5"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Confirm Replacement</span>
              </Button>
            </>
          )}

          {step === "SUCCESS" && (
            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
              className="w-full text-xs font-bold justify-center"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
