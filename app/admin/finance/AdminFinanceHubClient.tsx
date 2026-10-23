"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Landmark,
  ArrowUpRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Receipt,
  QrCode,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  X,
  CreditCard,
  Truck,
  Building,
  Check,
  Eye,
  EyeOff,
  Copy,
  Boxes,
  Users,
  ExternalLink,
  RotateCcw,
  Download,
  Lock,
  ArrowDownRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface AdminFinanceMetrics {
  total_seller_liability: number;
  pending_payout_requests: number;
  awaiting_approval_amount: number;
  approved_unpaid_count: number;
  approved_unpaid_amount: number;
  transfers_processing_count: number;
  paid_in_range_count: number;
  paid_in_range_amount: number;
  failed_transfers_count: number;
  pending_bank_verifications: number;
  cod_remittance_awaiting: number;
  outstanding_settlements_count: number;
  currency: string;
  timezone: string;
}

interface AdminPayoutRow {
  id: string;
  payout_number: string;
  amount: number;
  amount_paise: number;
  seller_id: string;
  seller_name: string;
  destination_type: "BANK_ACCOUNT" | "UPI";
  bank_account_id?: string | null;
  destination_snapshot: {
    account_holder_name?: string;
    bank_name?: string;
    branch_name?: string;
    account_number_masked?: string;
    account_number_last4?: string;
    ifsc_code?: string;
    upi_id?: string;
    bank_account_id?: string;
    account_type?: string;
  };
  status: "pending" | "approved" | "processing" | "paid" | "rejected" | "failed" | "cancelled";
  requested_at: string;
  approved_at: string | null;
  processing_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  seller_balance?: {
    available_balance: number;
    locked_balance: number;
    lifetime_earned: number;
    lifetime_withdrawn: number;
  };
  transfer?: {
    utr_reference: string;
    transfer_method: string;
    transferred_amount: number;
    actual_transfer_date: string;
    actual_transfer_time: string;
    actual_transfer_timestamp: string;
    destination_masked: string;
    admin_notes?: string;
  } | null;
}

interface AdminPayoutDestinationDetails {
  payout_id: string;
  seller_id: string;
  destination_type: "BANK_ACCOUNT" | "UPI";
  destination_id: string | null;
  account_holder_name?: string;
  bank_name?: string;
  branch_name?: string | null;
  account_number_last4?: string;
  account_number_masked?: string;
  ifsc_code?: string;
  account_type?: string;
  is_primary?: boolean;
  status: string;
  is_verified: boolean;
  verified_at?: string | null;
  upi_id?: string | null;
  upi_qr_url?: string | null;
  business_name?: string;
  warning?: string | null;
  can_transfer: boolean;
}

interface CalculatorSummary {
  period_label: string;
  start_date: string;
  end_date: string;
  total_gross_sales: number;
  total_customer_paid: number;
  total_quantity: number;
  total_platform_coupon_absorbed: number;
  total_seller_discount: number;
  total_commission: number;
  total_shipping_charges: number;
  total_refunds: number;
  total_net_seller_payable: number;
  distinct_products_count: number;
  settlements_count: number;
  currency: string;
  timezone: string;
}

interface CalculatorProductItem {
  product_id: string;
  product_title: string;
  sku: string | null;
  seller_id: string;
  seller_name: string;
  total_quantity: number;
  gross_sales: number;
  platform_coupon: number;
  seller_discount: number;
  commission_amount: number;
  avg_commission_percent: number;
  shipping_charges: number;
  refunds: number;
  net_seller_payable: number;
  order_breakdown: Array<{
    settlement_id: string;
    order_id: string;
    order_number: string;
    order_item_code: string | null;
    quantity: number;
    unit_price: number;
    gross_amount: number;
    platform_coupon: number;
    seller_discount: number;
    commission_amount: number;
    commission_rate_bps: number;
    net_seller_payable: number;
    settlement_status: string;
    payment_method: string;
    delivered_at: string | null;
    hold_released_at: string | null;
    created_at: string;
  }>;
}

interface PendingCODOrder {
  id: string;
  order_number: string;
  created_at: string;
  delivered_at: string | null;
  payment_method: string;
  total_amount: number;
  customer_name?: string;
  seller_name?: string;
  fulfillment_status: string;
  courier_tracking_id?: string;
  remittance_status: string;
}

interface AdminSellerRow {
  seller_id: string;
  seller_id_code: string | null;
  business_name: string;
  contact_name: string | null;
  business_email: string | null;
  phone: string | null;
  available_balance: number;
  locked_balance: number;
  pending_settlement: number;
  cod_awaiting_remittance: number;
  lifetime_earned: number;
  lifetime_withdrawn: number;
  pending_payout_amount: number;
  pending_payout_count: number;
  has_verified_bank: boolean;
  has_verified_upi: boolean;
  destination_status: "verified" | "pending" | "missing" | "rejected";
  bank_accounts: Array<{
    id: string;
    bank_name: string;
    account_holder_name: string;
    ifsc_code: string;
    account_number_last4: string;
    is_primary: boolean;
    status: string;
  }>;
  upi_id: string | null;
  last_payout_date: string | null;
  last_payout_status: string | null;
  last_payout_amount: number | null;
}

interface SellerDetailedData {
  seller: {
    id: string;
    seller_id_code: string | null;
    business_name: string;
    contact_name: string | null;
    business_email: string | null;
    phone: string | null;
    upi_id: string | null;
    upi_qr_url: string | null;
    stores: Array<{ id: string; name: string; slug: string }>;
  };
  balances: {
    available_balance: number;
    locked_balance: number;
    pending_balance: number;
    lifetime_earned: number;
    lifetime_withdrawn: number;
  };
  ledger: Array<{
    id: string;
    entry_type: string;
    direction: "credit" | "debit" | "neutral";
    amount: number;
    available_balance_after: number;
    description: string;
    created_at: string;
    metadata?: Record<string, unknown>;
  }>;
  settlements: Array<{
    id: string;
    order_id: string;
    order_number: string;
    order_item_code: string | null;
    product_title: string;
    quantity: number;
    unit_price: number;
    gross_amount: number;
    commission_amount: number;
    net_seller_payable: number;
    settlement_status: string;
    payment_method: string;
    cod_reconciled: boolean;
    fulfillment_status: string;
    delivered_at: string | null;
    hold_until: string | null;
    created_at: string;
  }>;
  payouts: Array<{
    id: string;
    payout_number: string;
    amount: number;
    destination_type: string;
    destination_snapshot: Record<string, unknown>;
    status: string;
    requested_at: string;
    approved_at: string | null;
    paid_at: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    failed_at: string | null;
    failure_reason: string | null;
    admin_notes: string | null;
    transfer?: {
      utr_reference: string;
      transfer_method: string;
      transferred_amount: number;
      actual_transfer_date: string;
      actual_transfer_time: string;
      destination_masked: string;
    } | null;
  }>;
  bank_accounts: Array<{
    id: string;
    bank_name: string;
    account_holder_name: string;
    branch_name: string | null;
    ifsc_code: string;
    account_number_last4: string;
    account_type: string;
    is_primary: boolean;
    status: string;
    rejection_reason?: string | null;
    verified_at?: string | null;
    created_at: string;
  }>;
}

export default function AdminFinanceHubClient() {
  const [activeTab, setActiveTab] = useState<"payouts" | "sellers" | "calculator" | "cod">("payouts");
  const [metrics, setMetrics] = useState<AdminFinanceMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Tab 1: Payouts state
  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPayout, setSelectedPayout] = useState<AdminPayoutRow | null>(null);

  // Modals for payouts
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewDestination, setReviewDestination] = useState<AdminPayoutDestinationDetails | null>(null);
  const [loadingReviewDestination, setLoadingReviewDestination] = useState(false);
  const [revealedReviewAccountNumber, setRevealedReviewAccountNumber] = useState<string | null>(null);
  const [isRevealingReviewAccount, setIsRevealingReviewAccount] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferMethod, setTransferMethod] = useState<"BANK_TRANSFER" | "UPI">("BANK_TRANSFER");
  const [utrReference, setUtrReference] = useState("");
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferDate, setTransferDate] = useState("");
  const [transferTime, setTransferTime] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  const [failModalOpen, setFailModalOpen] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [failNotes, setFailNotes] = useState("");
  const [isSubmittingFail, setIsSubmittingFail] = useState(false);

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenNotes, setReopenNotes] = useState("");
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Tab 2: Sellers state
  const [sellers, setSellers] = useState<AdminSellerRow[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellerSearch, setSellerSearch] = useState("");
  const [sellerVerificationFilter, setSellerVerificationFilter] = useState<string>("ALL");
  const [sellerSortField, setSellerSortField] = useState<"available" | "liability" | "pending" | "earned">("available");
  const [sellerSortDir, setSellerSortDir] = useState<"asc" | "desc">("desc");

  // Seller Slide-over detail
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellerDetailData, setSellerDetailData] = useState<SellerDetailedData | null>(null);
  const [loadingSellerDetail, setLoadingSellerDetail] = useState(false);
  const [sellerDetailTab, setSellerDetailTab] = useState<"overview" | "ledger" | "settlements" | "payouts" | "accounts">("overview");

  // Tab 3: Financial Calculator state
  const [calculatorPeriod, setCalculatorPeriod] = useState<string>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [calcSummary, setCalcSummary] = useState<CalculatorSummary | null>(null);
  const [calcProducts, setCalcProducts] = useState<CalculatorProductItem[]>([]);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Tab 4: COD Remittance state
  const [codOrders, setCodOrders] = useState<PendingCODOrder[]>([]);
  const [loadingCod, setLoadingCod] = useState(false);
  const [selectedCodIds, setSelectedCodIds] = useState<string[]>([]);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [remittanceRef, setRemittanceRef] = useState("");
  const [batchAmount, setBatchAmount] = useState<number>(0);
  const [reconcileNote, setReconcileNote] = useState("");
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);

  // Notifications
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const showFeedback = (type: "success" | "error" | "info", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch("/api/admin/finance/overview");
      const data = await res.json();
      if (res.ok && data.success && data.metrics) {
        const m = data.metrics;
        setMetrics({
          total_seller_liability: Number(m.total_seller_liability ?? m.totalSellerLiability ?? 0),
          pending_payout_requests: Number(m.pending_payout_requests ?? m.pendingPayoutRequestsCount ?? 0),
          awaiting_approval_amount: Number(m.awaiting_approval_amount ?? m.totalAwaitingApproval ?? 0),
          approved_unpaid_count: Number(m.approved_unpaid_count ?? 0),
          approved_unpaid_amount: Number(m.approved_unpaid_amount ?? m.approvedUnpaidAmount ?? 0),
          transfers_processing_count: Number(m.transfers_processing_count ?? m.transfersProcessingCount ?? 0),
          paid_in_range_count: Number(m.paid_in_range_count ?? 0),
          paid_in_range_amount: Number(m.paid_in_range_amount ?? m.paidDuringPeriod ?? 0),
          failed_transfers_count: Number(m.failed_transfers_count ?? m.failedTransfersCount ?? 0),
          pending_bank_verifications: Number(m.pending_bank_verifications ?? m.pendingBankVerificationsCount ?? 0),
          cod_remittance_awaiting: Number(m.cod_remittance_awaiting ?? m.codAwaitingReconciliationAmount ?? 0),
          outstanding_settlements_count: Number(m.outstanding_settlements_count ?? m.outstandingSettlementsCount ?? 0),
          currency: m.currency || "INR",
          timezone: m.timezone || "Asia/Kolkata",
        });
      }
    } catch (err) {
      console.error("Failed to load admin finance metrics", err);
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  // Fetch payouts list
  const fetchPayouts = useCallback(async () => {
    setLoadingPayouts(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "100");

      const res = await fetch(`/api/admin/finance/payouts?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPayouts(data.payouts || data.items || []);
      } else {
        showFeedback("error", data.message || "Failed to load payouts queue.");
      }
    } catch {
      showFeedback("error", "Network error while loading payouts.");
    } finally {
      setLoadingPayouts(false);
    }
  }, [statusFilter, searchQuery]);

  // Fetch sellers finance list
  const fetchSellers = useCallback(async () => {
    setLoadingSellers(true);
    try {
      const params = new URLSearchParams();
      if (sellerSearch.trim()) params.set("search", sellerSearch.trim());
      if (sellerVerificationFilter !== "ALL") params.set("verification", sellerVerificationFilter);

      const res = await fetch(`/api/admin/finance/sellers?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSellers(data.sellers || []);
      } else {
        showFeedback("error", data.message || "Failed to load seller finance overview.");
      }
    } catch {
      showFeedback("error", "Network error while loading seller balances.");
    } finally {
      setLoadingSellers(false);
    }
  }, [sellerSearch, sellerVerificationFilter]);

  // Fetch single seller detailed ledger
  const fetchSellerDetail = useCallback(async (sellerId: string) => {
    setLoadingSellerDetail(true);
    try {
      const res = await fetch(`/api/admin/finance/sellers/${sellerId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSellerDetailData(data);
      } else {
        showFeedback("error", data.message || "Failed to load seller detail.");
      }
    } catch {
      showFeedback("error", "Network error loading seller detail.");
    } finally {
      setLoadingSellerDetail(false);
    }
  }, []);

  // Fetch calculator
  const fetchCalculator = useCallback(async () => {
    setLoadingCalc(true);
    try {
      const params = new URLSearchParams();
      params.set("period", calculatorPeriod);
      if (calculatorPeriod === "custom") {
        if (customStartDate) params.set("startDate", customStartDate);
        if (customEndDate) params.set("endDate", customEndDate);
      }

      const res = await fetch(`/api/admin/finance/calculator?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setCalcSummary(data.calculator?.summary || data.summary || null);
        setCalcProducts(data.calculator?.products || data.products || []);
      } else {
        showFeedback("error", data.message || "Failed to calculate financial data.");
      }
    } catch {
      showFeedback("error", "Network error loading financial calculator.");
    } finally {
      setLoadingCalc(false);
    }
  }, [calculatorPeriod, customStartDate, customEndDate]);

  // Fetch COD orders
  const fetchCodOrders = useCallback(async () => {
    setLoadingCod(true);
    try {
      const res = await fetch("/api/admin/finance/cod-remittance");
      const data = await res.json();
      if (res.ok && data.success) {
        setCodOrders(data.orders || data.pendingOrders || []);
      }
    } catch (err) {
      console.error("Error loading COD orders", err);
    } finally {
      setLoadingCod(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchMetrics();
    fetchPayouts();
  }, [fetchMetrics, fetchPayouts]);

  // Tab switch effect
  useEffect(() => {
    if (activeTab === "payouts") {
      fetchPayouts();
    } else if (activeTab === "sellers") {
      fetchSellers();
    } else if (activeTab === "calculator") {
      fetchCalculator();
    } else if (activeTab === "cod") {
      fetchCodOrders();
    }
  }, [activeTab, fetchPayouts, fetchSellers, fetchCalculator, fetchCodOrders]);

  // Handle open seller detail slide-over
  const handleOpenSellerDetail = (sellerId: string) => {
    setSelectedSellerId(sellerId);
    setSellerDetailTab("overview");
    fetchSellerDetail(sellerId);
  };

  // Shared fetcher for linked destination details across all payout modals
  const fetchPayoutDestination = async (payout: AdminPayoutRow) => {
    setLoadingReviewDestination(true);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${payout.id}/destination`);
      const data = await res.json();
      if (res.ok && data.success && data.destination) {
        setReviewDestination(data.destination);
      } else {
        const snap = payout.destination_snapshot as Record<string, any>;
        setReviewDestination({
          payout_id: payout.id,
          seller_id: payout.seller_id,
          destination_type: payout.destination_type,
          destination_id: payout.bank_account_id || snap?.bank_account_id || null,
          account_holder_name: snap?.account_holder_name || "Unknown",
          bank_name: snap?.bank_name || "Unknown Bank",
          branch_name: snap?.branch_name || null,
          account_number_last4: snap?.account_number_last4 || "",
          account_number_masked: snap?.account_number_masked || (snap?.account_number_last4 ? `••••••••${snap.account_number_last4}` : "••••••••"),
          ifsc_code: snap?.ifsc_code || "",
          account_type: snap?.account_type || "CURRENT",
          status: "unverified",
          is_verified: false,
          upi_id: snap?.upi_id || null,
          warning: data?.message || "Could not retrieve live destination verification status.",
          can_transfer: false,
        });
      }
    } catch {
      const snap = payout.destination_snapshot as Record<string, any>;
      setReviewDestination({
        payout_id: payout.id,
        seller_id: payout.seller_id,
        destination_type: payout.destination_type,
        destination_id: payout.bank_account_id || snap?.bank_account_id || null,
        account_holder_name: snap?.account_holder_name || "Unknown",
        bank_name: snap?.bank_name || "Unknown Bank",
        branch_name: snap?.branch_name || null,
        account_number_last4: snap?.account_number_last4 || "",
        account_number_masked: snap?.account_number_masked || (snap?.account_number_last4 ? `••••••••${snap.account_number_last4}` : "••••••••"),
        ifsc_code: snap?.ifsc_code || "",
        account_type: snap?.account_type || "CURRENT",
        status: "unverified",
        is_verified: false,
        upi_id: snap?.upi_id || null,
        warning: "Network error loading live destination verification status.",
        can_transfer: false,
      });
    } finally {
      setLoadingReviewDestination(false);
    }
  };

  const handleCopyAccountNumber = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedAccountNumber(true);
    setTimeout(() => setCopiedAccountNumber(false), 2000);
  };

  // Handlers for Payout Review
  const handleOpenReview = async (payout: AdminPayoutRow) => {
    setSelectedPayout(payout);
    setReviewAction("approve");
    setRejectionReason("");
    setReviewDestination(null);
    setRevealedReviewAccountNumber(null);
    setRevealError(null);
    setReviewModalOpen(true);
    fetchPayoutDestination(payout);
  };

  // Handlers for Eye / Inspect Payout Details & Statement
  const handleOpenDetailModal = (payout: AdminPayoutRow) => {
    setSelectedPayout(payout);
    setRevealedReviewAccountNumber(null);
    setRevealError(null);
    setDetailModalOpen(true);
    fetchPayoutDestination(payout);
  };

  const handleRevealReviewAccount = async () => {
    if (!selectedPayout) return;
    if (revealedReviewAccountNumber) {
      setRevealedReviewAccountNumber(null);
      return;
    }

    setIsRevealingReviewAccount(true);
    setRevealError(null);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${selectedPayout.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.fullAccountNumber) {
        throw new Error(data.message || "Failed to reveal full account number.");
      }
      setRevealedReviewAccountNumber(data.fullAccountNumber);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error revealing account number.";
      setRevealError(msg);
    } finally {
      setIsRevealingReviewAccount(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedPayout) return;
    if (reviewAction === "reject" && !rejectionReason.trim()) {
      showFeedback("error", "Rejection reason is required to release reserved funds safely.");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${selectedPayout.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewAction,
          rejection_reason: reviewAction === "reject" ? rejectionReason.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update review status.");
      }

      showFeedback(
        "success",
        reviewAction === "approve"
          ? `Payout ${selectedPayout.payout_number} approved! Ready for manual bank/UPI transfer.`
          : `Payout ${selectedPayout.payout_number} rejected. Reserved funds restored to seller available balance.`
      );
      setReviewModalOpen(false);
      setRevealedReviewAccountNumber(null);
      setReviewDestination(null);
      fetchPayouts();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error submitting review";
      showFeedback("error", msg);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Handlers for Transfer Confirmation
  const handleOpenTransfer = async (payout: AdminPayoutRow) => {
    setSelectedPayout(payout);
    setTransferMethod(payout.destination_type === "UPI" ? "UPI" : "BANK_TRANSFER");
    setUtrReference("");
    setTransferAmount(payout.amount);

    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    setTransferDate(formatter.format(now));

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    setTransferTime(timeFormatter.format(now));

    setTransferNotes("");
    setTransferConfirmed(false);
    setRevealedReviewAccountNumber(null);
    setRevealError(null);
    setTransferModalOpen(true);
    fetchPayoutDestination(payout);
  };

  // Unified Render function for Authorized Financial Destination Details across Review, Transfer, and Statement Modals
  const renderDestinationDetailsCard = () => {
    if (!selectedPayout) return null;

    return (
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            {selectedPayout.destination_type === "UPI" ? (
              <QrCode className="w-4 h-4 text-purple-600" />
            ) : (
              <Landmark className="w-4 h-4 text-indigo-600" />
            )}
            <span>
              Linked Financial Destination ({selectedPayout.destination_type === "UPI" ? "UPI VPA" : "Bank Account"})
            </span>
          </div>

          <div>
            {loadingReviewDestination ? (
              <span className="text-[10px] text-slate-400 animate-pulse font-medium">Verifying...</span>
            ) : reviewDestination?.is_verified ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                {reviewDestination?.status ? reviewDestination.status.toUpperCase() : "UNVERIFIED"}
              </span>
            )}
          </div>
        </div>

        {loadingReviewDestination ? (
          <div className="py-4 text-center text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
            <span className="text-xs">Retrieving linked account verification status...</span>
          </div>
        ) : selectedPayout.destination_type === "UPI" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">UPI ID / VPA</span>
                <span className="font-mono font-bold text-purple-700 text-sm block break-all">
                  {reviewDestination?.upi_id || selectedPayout.destination_snapshot.upi_id || "None linked"}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Registered Entity</span>
                <span className="font-semibold text-slate-800 text-xs block break-words">
                  {reviewDestination?.business_name || selectedPayout.seller_name}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Account Holder</span>
                <span
                  className="font-semibold text-slate-900 block truncate"
                  title={reviewDestination?.account_holder_name || selectedPayout.destination_snapshot.account_holder_name}
                >
                  {reviewDestination?.account_holder_name || selectedPayout.destination_snapshot.account_holder_name || "—"}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Bank Name</span>
                <span
                  className="font-semibold text-slate-900 block truncate"
                  title={reviewDestination?.bank_name || selectedPayout.destination_snapshot.bank_name}
                >
                  {reviewDestination?.bank_name || selectedPayout.destination_snapshot.bank_name || "—"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Branch Name</span>
                <span
                  className="text-slate-800 font-medium block truncate"
                  title={reviewDestination?.branch_name || selectedPayout.destination_snapshot.branch_name || "Not specified"}
                >
                  {reviewDestination?.branch_name || selectedPayout.destination_snapshot.branch_name || "Not specified"}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">IFSC Code</span>
                <span className="font-mono font-semibold text-slate-800 block">
                  {reviewDestination?.ifsc_code || selectedPayout.destination_snapshot.ifsc_code || "—"}
                </span>
              </div>
            </div>

            {/* Account Number with Protected Reveal Button */}
            <div className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400">Account Number (Protected)</span>
                <button
                  type="button"
                  onClick={handleRevealReviewAccount}
                  disabled={isRevealingReviewAccount}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                >
                  {isRevealingReviewAccount ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Decrypting...</span>
                    </>
                  ) : revealedReviewAccountNumber ? (
                    <>
                      <EyeOff className="w-3 h-3" />
                      <span>Hide Full A/C</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      <span>Reveal Full A/C</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {revealedReviewAccountNumber ? (
                  <>
                    <span className="font-mono font-bold text-sm tracking-wider text-slate-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300 select-all">
                      {revealedReviewAccountNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyAccountNumber(revealedReviewAccountNumber)}
                      className="p-1 px-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                      title="Copy Full Account Number"
                    >
                      {copiedAccountNumber ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-600" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase border border-amber-200">
                      Admin Decrypted
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-slate-700 tracking-wide text-xs">
                    •••• •••• •••• {reviewDestination?.account_number_last4 || selectedPayout.destination_snapshot.account_number_last4 || "••••"}
                  </span>
                )}
              </div>

              {revealError && (
                <div className="text-[10px] text-rose-600 font-medium">{revealError}</div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span className="truncate max-w-[260px]">
                Destination ID:{" "}
                <code className="font-mono text-slate-700">
                  {reviewDestination?.destination_id ||
                    selectedPayout.bank_account_id ||
                    (selectedPayout.destination_snapshot as any)?.bank_account_id ||
                    "Unlinked"}
                </code>
              </span>
              <span>
                Type:{" "}
                <strong className="text-slate-700">
                  {reviewDestination?.account_type || selectedPayout.destination_snapshot.account_type || "CURRENT"}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Warning Banner if destination is unverified or missing */}
        {!loadingReviewDestination && (reviewDestination?.warning || (reviewDestination && !reviewDestination.is_verified)) && (
          <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2 text-[11px] text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Warning: Destination Not Verified</strong>
              <span>
                {reviewDestination?.warning ||
                  "This payout destination has not been verified. Transfers cannot be safely executed until credentials are valid."}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSubmitTransfer = async () => {
    if (!selectedPayout) return;
    if (!utrReference.trim()) {
      showFeedback("error", "UTR / Bank transaction reference is mandatory.");
      return;
    }
    if (!transferDate || !transferTime) {
      showFeedback("error", "Actual transfer date and time must be specified.");
      return;
    }
    if (!transferConfirmed) {
      showFeedback("error", "Please confirm that you have actually executed the manual transfer.");
      return;
    }

    setIsSubmittingTransfer(true);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${selectedPayout.id}/confirm-transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utr_reference: utrReference.trim().toUpperCase(),
          transfer_method: transferMethod,
          transferred_amount: transferAmount,
          actual_transfer_date: transferDate,
          actual_transfer_time: transferTime,
          admin_notes: transferNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to record manual transfer.");
      }

      showFeedback(
        "success",
        `Manual transfer recorded successfully! Payout ${selectedPayout.payout_number} is now confirmed as PAID.`
      );
      setTransferModalOpen(false);
      fetchPayouts();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error confirming transfer";
      showFeedback("error", msg);
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // Handlers for Transfer Failure
  const handleOpenFail = (payout: AdminPayoutRow) => {
    setSelectedPayout(payout);
    setFailureReason("");
    setFailNotes("");
    setFailModalOpen(true);
  };

  const handleSubmitFail = async () => {
    if (!selectedPayout) return;
    if (!failureReason.trim()) {
      showFeedback("error", "Failure reason is required.");
      return;
    }

    setIsSubmittingFail(true);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${selectedPayout.id}/fail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          failure_reason: failureReason.trim(),
          admin_notes: failNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to record transfer failure.");
      }

      showFeedback(
        "info",
        `Payout ${selectedPayout.payout_number} marked as failed. Reserved balance restored to seller.`
      );
      setFailModalOpen(false);
      fetchPayouts();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error failing transfer";
      showFeedback("error", msg);
    } finally {
      setIsSubmittingFail(false);
    }
  };

  // Handlers for Reopening Rejected / Failed Payout
  const handleOpenReopen = (payout: AdminPayoutRow) => {
    setSelectedPayout(payout);
    setReopenReason("");
    setReopenNotes("");
    setReopenModalOpen(true);
  };

  const handleSubmitReopen = async () => {
    if (!selectedPayout) return;
    if (!reopenReason.trim() || reopenReason.trim().length < 3) {
      showFeedback("error", "A valid reason (at least 3 characters) is required to reopen this payout.");
      return;
    }

    setIsSubmittingReopen(true);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${selectedPayout.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reopenReason.trim(),
          admin_notes: reopenNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to reopen payout request.");
      }

      showFeedback(
        "success",
        `Payout ${selectedPayout.payout_number} reopened for review. Amount (${formatCurrency(selectedPayout.amount)}) re-reserved from seller balance.`
      );
      setReopenModalOpen(false);
      fetchPayouts();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error reopening payout";
      showFeedback("error", msg);
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  // Handlers for COD Remittance
  const handleToggleSelectCod = (id: string) => {
    setSelectedCodIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllCod = () => {
    if (selectedCodIds.length === codOrders.length) {
      setSelectedCodIds([]);
    } else {
      setSelectedCodIds(codOrders.map((o) => o.id));
    }
  };

  const handleOpenReconcileModal = () => {
    if (selectedCodIds.length === 0) {
      showFeedback("error", "Please select at least one COD order to reconcile.");
      return;
    }

    const totalSelected = codOrders
      .filter((o) => selectedCodIds.includes(o.id))
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    setBatchAmount(totalSelected);
    setCourierName("");
    setRemittanceRef("");
    setReconcileNote("");
    setReconcileModalOpen(true);
  };

  const handleSubmitReconcile = async () => {
    if (!courierName.trim()) {
      showFeedback("error", "Courier / Delivery Partner name is required.");
      return;
    }
    if (!remittanceRef.trim()) {
      showFeedback("error", "Remittance Reference / UTR / Cheque # is required.");
      return;
    }

    setIsSubmittingReconcile(true);
    try {
      const res = await fetch("/api/admin/finance/cod-remittance/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courier_name: courierName.trim(),
          remittance_reference: remittanceRef.trim(),
          amount: batchAmount,
          order_ids: selectedCodIds,
          note: reconcileNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to reconcile COD remittance.");
      }

      showFeedback(
        "success",
        `Reconciled ${selectedCodIds.length} COD orders totaling ${formatCurrency(batchAmount)}! Seller settlements updated.`
      );
      setReconcileModalOpen(false);
      setSelectedCodIds([]);
      fetchCodOrders();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error reconciling COD";
      showFeedback("error", msg);
    } finally {
      setIsSubmittingReconcile(false);
    }
  };

  // CSV Export
  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const params = new URLSearchParams();
      params.set("period", calculatorPeriod);
      if (calculatorPeriod === "custom") {
        if (customStartDate) params.set("startDate", customStartDate);
        if (customEndDate) params.set("endDate", customEndDate);
      }

      const res = await fetch(`/api/admin/finance/calculator/export?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to download CSV export");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vendosmith_financial_report_${calculatorPeriod}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showFeedback("success", "Financial report exported to CSV successfully.");
    } catch {
      showFeedback("error", "Failed to generate CSV export.");
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Sort and filter sellers
  const filteredAndSortedSellers = useMemo(() => {
    return [...sellers].sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sellerSortField === "available") {
        valA = a.available_balance;
        valB = b.available_balance;
      } else if (sellerSortField === "liability") {
        valA = a.available_balance + a.locked_balance;
        valB = b.available_balance + b.locked_balance;
      } else if (sellerSortField === "pending") {
        valA = a.pending_settlement;
        valB = b.pending_settlement;
      } else if (sellerSortField === "earned") {
        valA = a.lifetime_earned;
        valB = b.lifetime_earned;
      }
      return sellerSortDir === "desc" ? valB - valA : valA - valB;
    });
  }, [sellers, sellerSortField, sellerSortDir]);

  return (
    <div className="w-full text-slate-900 font-sans selection:bg-emerald-500/20">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
                <Landmark className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                  Financial Operations & Payouts
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Authoritative multi-vendor ledger, seller balances, payout approvals, manual bank/UPI transfers, financial calculator & COD reconciliation.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/admin/finance/bank-accounts"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Bank & UPI Approvals
              {metrics && metrics.pending_bank_verifications > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  {metrics.pending_bank_verifications}
                </span>
              )}
            </Link>

            <Button
              onClick={() => {
                fetchMetrics();
                if (activeTab === "payouts") fetchPayouts();
                if (activeTab === "sellers") fetchSellers();
                if (activeTab === "calculator") fetchCalculator();
                if (activeTab === "cod") fetchCodOrders();
              }}
              variant="outline"
              size="sm"
              className="border-slate-300 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl gap-2 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? "animate-spin text-emerald-600" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm border animate-in fade-in duration-200 shadow-xs ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : feedback.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              {feedback.type === "error" && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
              {feedback.type === "info" && <Info className="w-5 h-5 text-blue-600 shrink-0" />}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Executive Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Seller Liability */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs min-w-0">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Total Seller Liability</span>
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="mt-2">
              <span className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 truncate block">
                {metrics ? formatCurrency(metrics.total_seller_liability) : "—"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Unwithdrawn eligible & reserved seller funds
            </p>
          </div>

          {/* Card 2: Pending Approval */}
          <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-xs relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Pending Review</span>
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl md:text-2xl font-bold tracking-tight text-amber-700">
                {metrics ? formatCurrency(metrics.awaiting_approval_amount) : "—"}
              </span>
              <span className="text-xs text-amber-700/80 font-medium">
                ({metrics?.pending_payout_requests || 0} req)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Awaiting admin risk review
            </p>
          </div>

          {/* Card 3: Approved (Awaiting Manual Transfer) */}
          <div className="p-4 rounded-2xl bg-white border border-blue-200 shadow-xs min-w-0">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Approved (Ready to Transfer)</span>
              <ArrowUpRight className="w-4 h-4 text-blue-500 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl md:text-2xl font-bold tracking-tight text-blue-700">
                {metrics ? formatCurrency(metrics.approved_unpaid_amount) : "—"}
              </span>
              <span className="text-xs text-blue-600 font-medium">
                ({metrics?.approved_unpaid_count || 0} req)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Awaiting manual bank/UPI transfer & UTR entry
            </p>
          </div>

          {/* Card 4: Paid In Period */}
          <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs min-w-0">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Total Paid Out</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl md:text-2xl font-bold tracking-tight text-emerald-700">
                {metrics ? formatCurrency(metrics.paid_in_range_amount) : "—"}
              </span>
              <span className="text-xs text-emerald-600 font-medium">
                ({metrics?.paid_in_range_count || 0} transfers)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Confirmed manual transfers with recorded UTR
            </p>
          </div>
        </div>

        {/* Secondary Metrics Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl text-xs shadow-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Truck className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              COD Remittance Awaiting Reconciliation:{" "}
              <strong className="text-slate-900 font-semibold">{formatCurrency(metrics?.cod_remittance_awaiting || 0)}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Boxes className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              Active Unsettled Order Items:{" "}
              <strong className="text-slate-900 font-semibold">{metrics?.outstanding_settlements_count || 0}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Timezone: <strong className="text-slate-900 font-semibold">Asia/Kolkata</strong> | Minimum Payout:{" "}
              <strong className="text-emerald-700 font-semibold">₹10.00</strong>
            </span>
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("payouts")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === "payouts"
                ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Receipt className="w-4 h-4 text-emerald-600" />
            Payout Requests Queue
            {metrics && metrics.pending_payout_requests > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                {metrics.pending_payout_requests}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("sellers")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === "sellers"
                ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            Seller Financial Overview & Balances
          </button>

          <button
            onClick={() => setActiveTab("calculator")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === "calculator"
                ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-purple-600" />
            Financial Calculator & Product Breakdown
          </button>

          <button
            onClick={() => setActiveTab("cod")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === "cod"
                ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Truck className="w-4 h-4 text-amber-600" />
            COD Courier Remittance
          </button>
        </div>

        {/* ===================================================================== */}
        {/* TAB 1: PAYOUT REQUESTS QUEUE */}
        {/* ===================================================================== */}
        {activeTab === "payouts" && (
          <div className="space-y-4">
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search by Payout # (e.g. PO-10001), Seller, or UTR..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              {/* Status Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500 mr-1 flex items-center gap-1 font-medium">
                  <Filter className="w-3.5 h-3.5" /> Status:
                </span>
                {(["ALL", "pending", "approved", "processing", "paid", "rejected", "failed"] as const).map(
                  (st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        statusFilter === st
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      }`}
                    >
                      {st.toUpperCase()}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Payouts Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="sm:hidden px-3.5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                <span>↔ Scroll sideways to view all payout columns</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[960px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Payout #</th>
                      <th className="py-3.5 px-4">Seller</th>
                      <th className="py-3.5 px-4">Amount</th>
                      <th className="py-3.5 px-4">Available Balance</th>
                      <th className="py-3.5 px-4">Destination</th>
                      <th className="py-3.5 px-4">Status & Reason</th>
                      <th className="py-3.5 px-4">Timeline</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingPayouts ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                          Loading payout requests...
                        </td>
                      </tr>
                    ) : payouts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <AlertCircle className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                          No payout requests found matching the current criteria.
                        </td>
                      </tr>
                    ) : (
                      payouts.map((row) => {
                        const isPending = row.status === "pending";
                        const isApprovedOrProcessing = row.status === "approved" || row.status === "processing";
                        const isPaid = row.status === "paid";
                        const isRejected = row.status === "rejected";
                        const isFailed = row.status === "failed";

                        return (
                          <tr
                            key={row.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                              <span className="text-emerald-700 font-bold">{row.payout_number}</span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {formatExactDateTime(row.requested_at)}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900">{row.seller_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                ID: {row.seller_id.slice(0, 8)}...
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              <span className="text-sm font-bold text-slate-900">
                                {formatCurrency(row.amount)}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="text-slate-800 font-medium">
                                {row.seller_balance ? formatCurrency(row.seller_balance.available_balance) : "—"}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Withdrawn: {row.seller_balance ? formatCurrency(row.seller_balance.lifetime_withdrawn) : "—"}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                {row.destination_type === "UPI" ? (
                                  <QrCode className="w-3.5 h-3.5 text-purple-600" />
                                ) : (
                                  <Building className="w-3.5 h-3.5 text-blue-600" />
                                )}
                                <span className="font-medium text-slate-900">
                                  {row.destination_type === "UPI"
                                    ? row.destination_snapshot.upi_id || "UPI ID"
                                    : row.destination_snapshot.bank_name || "Bank Account"}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {row.destination_type === "UPI"
                                  ? "UPI Transfer"
                                  : `A/C: ${row.destination_snapshot.account_number_masked || `****${row.destination_snapshot.account_number_last4 || ""}`} | ${row.destination_snapshot.ifsc_code || ""}`}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                  isPaid
                                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                    : isPending
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : isApprovedOrProcessing
                                    ? "bg-blue-50 text-blue-800 border border-blue-200"
                                    : isRejected
                                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                                    : "bg-slate-100 text-slate-700 border border-slate-300"
                                }`}
                              >
                                {isPaid && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                {isPending && <Clock className="w-3 h-3 text-amber-600" />}
                                {isApprovedOrProcessing && <ArrowUpRight className="w-3 h-3 text-blue-600" />}
                                {isRejected && <AlertCircle className="w-3 h-3 text-rose-600" />}
                                {isFailed && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                                {row.status}
                              </span>

                              {isRejected && row.rejection_reason && (
                                <div className="text-[10px] text-rose-600 font-medium mt-1 truncate max-w-[160px]" title={row.rejection_reason}>
                                  Reason: {row.rejection_reason}
                                </div>
                              )}

                              {isFailed && row.failure_reason && (
                                <div className="text-[10px] text-rose-600 font-medium mt-1 truncate max-w-[160px]" title={row.failure_reason}>
                                  Failed: {row.failure_reason}
                                </div>
                              )}

                              {row.transfer?.utr_reference && (
                                <div className="text-[10px] font-mono text-slate-600 mt-1">
                                  UTR: <span className="text-slate-900 font-bold">{row.transfer.utr_reference}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-[10px] text-slate-500 space-y-0.5">
                              {row.paid_at && <div>Paid: {formatExactDateTime(row.paid_at)}</div>}
                              {row.approved_at && !row.paid_at && <div>Approved: {formatExactDateTime(row.approved_at)}</div>}
                              {row.rejected_at && <div className="text-rose-600">Rejected: {formatExactDateTime(row.rejected_at)}</div>}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* Inspect button */}
                                <button
                                  onClick={() => handleOpenDetailModal(row)}
                                  title="Inspect Payout Statement & Details"
                                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                {/* Pending Review Action */}
                                {isPending && (
                                  <Button
                                    onClick={() => handleOpenReview(row)}
                                    size="sm"
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs py-1 px-2.5 h-auto rounded-lg"
                                  >
                                    Review
                                  </Button>
                                )}

                                {/* Approved Action -> Record Transfer */}
                                {isApprovedOrProcessing && (
                                  <>
                                    <Button
                                      onClick={() => handleOpenTransfer(row)}
                                      size="sm"
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1 px-2.5 h-auto rounded-lg"
                                    >
                                      Record Transfer
                                    </Button>

                                    <Button
                                      onClick={() => handleOpenFail(row)}
                                      variant="outline"
                                      size="sm"
                                      className="border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold text-xs py-1 px-2.5 h-auto rounded-lg"
                                    >
                                      Fail
                                    </Button>
                                  </>
                                )}

                                {/* Reopen Action for Rejected or Failed requests */}
                                {(isRejected || isFailed) && (
                                  <Button
                                    onClick={() => handleOpenReopen(row)}
                                    variant="outline"
                                    size="sm"
                                    className="border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold text-xs py-1 px-2.5 h-auto rounded-lg gap-1"
                                    title="Reopen request for administrative re-evaluation"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reopen
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: SELLER FINANCIAL OVERVIEW & BALANCES */}
        {/* ===================================================================== */}
        {activeTab === "sellers" && (
          <div className="space-y-4">
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search by Seller Name, Seller ID, Email, or UPI ID..."
                  value={sellerSearch}
                  onChange={(e) => setSellerSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Verification Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={sellerVerificationFilter}
                    onChange={(e) => setSellerVerificationFilter(e.target.value)}
                    className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Destinations</option>
                    <option value="verified">Verified Destination</option>
                    <option value="pending">Pending Verification</option>
                    <option value="missing">Missing Destination</option>
                  </select>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs">
                  <span className="text-slate-500">Sort by:</span>
                  <select
                    value={sellerSortField}
                    onChange={(e) => setSellerSortField(e.target.value as "available" | "liability" | "pending" | "earned")}
                    className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="available">Available Balance</option>
                    <option value="liability">Total Liability</option>
                    <option value="pending">Pending Settlement</option>
                    <option value="earned">Lifetime Earned</option>
                  </select>
                  <button
                    onClick={() => setSellerSortDir(prev => prev === "desc" ? "asc" : "desc")}
                    className="text-slate-500 hover:text-slate-900 p-0.5 cursor-pointer"
                    title={`Sort ${sellerSortDir === "desc" ? "Ascending" : "Descending"}`}
                  >
                    {sellerSortDir === "desc" ? "↓" : "↑"}
                  </button>
                </div>
              </div>
            </div>

            {/* Sellers Financial Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="sm:hidden px-3.5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                <span>↔ Scroll sideways to view all seller columns</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[1080px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Seller Entity</th>
                      <th className="py-3.5 px-4 text-right">Available to Withdraw</th>
                      <th className="py-3.5 px-4 text-right">Locked / In Payout</th>
                      <th className="py-3.5 px-4 text-right">Pending Settlement</th>
                      <th className="py-3.5 px-4 text-right">COD Awaiting Courier</th>
                      <th className="py-3.5 px-4 text-right">Lifetime Earned / Paid</th>
                      <th className="py-3.5 px-4">Payout Destination</th>
                      <th className="py-3.5 px-4">Latest Payout</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingSellers ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                          Loading seller financial data...
                        </td>
                      </tr>
                    ) : filteredAndSortedSellers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
                          <Users className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                          No sellers found matching the current search filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedSellers.map((seller) => (
                        <tr
                          key={seller.seller_id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{seller.business_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {seller.seller_id_code || seller.seller_id.slice(0, 8)}
                              {seller.contact_name ? ` • ${seller.contact_name}` : ""}
                            </div>
                            {seller.business_email && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                {seller.business_email}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span className="text-sm font-bold text-emerald-700">
                              {formatCurrency(seller.available_balance)}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span className={`font-semibold ${seller.locked_balance > 0 ? "text-amber-700" : "text-slate-500"}`}>
                              {formatCurrency(seller.locked_balance)}
                            </span>
                            {seller.pending_payout_count > 0 && (
                              <div className="text-[10px] text-amber-700 font-medium">
                                ({seller.pending_payout_count} pending req)
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span className="font-semibold text-blue-700">
                              {formatCurrency(seller.pending_settlement)}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              7-day hold / delivery
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span className={`font-semibold ${seller.cod_awaiting_remittance > 0 ? "text-amber-800" : "text-slate-400"}`}>
                              {formatCurrency(seller.cod_awaiting_remittance)}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="font-semibold text-slate-800">
                              Earned: {formatCurrency(seller.lifetime_earned)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Disbursed: {formatCurrency(seller.lifetime_withdrawn)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              {seller.bank_accounts && seller.bank_accounts.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <Building className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span className="font-medium text-slate-800 truncate max-w-[130px]">
                                    {seller.bank_accounts[0].bank_name} (****{seller.bank_accounts[0].account_number_last4})
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                    {seller.bank_accounts[0].status}
                                  </span>
                                </div>
                              ) : null}

                              {seller.upi_id ? (
                                <div className="flex items-center gap-1.5">
                                  <QrCode className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                  <span className="font-mono text-slate-700 truncate max-w-[140px]" title={seller.upi_id}>
                                    {seller.upi_id}
                                  </span>
                                </div>
                              ) : null}

                              {!seller.bank_accounts?.length && !seller.upi_id && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-3 h-3" /> No Destination
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-[10px] text-slate-600">
                            {seller.last_payout_date ? (
                              <div>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mb-0.5 ${
                                  seller.last_payout_status === "paid"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : seller.last_payout_status === "pending"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}>
                                  {seller.last_payout_status}
                                </span>
                                <div>{formatCurrency(seller.last_payout_amount || 0)}</div>
                                <div className="text-slate-400">{formatExactDateTime(seller.last_payout_date)}</div>
                              </div>
                            ) : (
                              <span className="text-slate-400">Never Disbursed</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <Button
                              onClick={() => handleOpenSellerDetail(seller.seller_id)}
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 px-3 rounded-xl border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 gap-1.5 shadow-xs"
                            >
                              <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                              View Ledger
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: FINANCIAL CALCULATOR */}
        {/* ===================================================================== */}
        {activeTab === "calculator" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" /> Period:
                </span>
                {(["today", "yesterday", "last_7_days", "this_month", "last_month", "all_time", "custom"] as const).map(
                  (p) => (
                    <button
                      key={p}
                      onClick={() => setCalculatorPeriod(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                        calculatorPeriod === p
                          ? "bg-slate-900 text-white font-semibold shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {p.replace(/_/g, " ").toUpperCase()}
                    </button>
                  )
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleExportCsv}
                  disabled={isExportingCsv}
                  variant="outline"
                  size="sm"
                  className="bg-white border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs rounded-xl gap-2 shadow-xs"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  {isExportingCsv ? "Generating CSV..." : "Export Financial CSV"}
                </Button>
              </div>
            </div>

            {/* Financial Summary Cards */}
            {calcSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Gross Product Sales</span>
                  <div className="text-base md:text-lg font-bold text-slate-900 mt-1">
                    {formatCurrency(calcSummary.total_gross_sales)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{calcSummary.total_quantity} items sold</div>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Platform Coupons Absorbed</span>
                  <div className="text-base md:text-lg font-bold text-amber-700 mt-1">
                    {formatCurrency(calcSummary.total_platform_coupon_absorbed)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Funded by platform</div>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Seller Commissions</span>
                  <div className="text-base md:text-lg font-bold text-purple-700 mt-1">
                    {formatCurrency(calcSummary.total_commission)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Marketplace fee revenue</div>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Shipping Charges</span>
                  <div className="text-base md:text-lg font-bold text-blue-700 mt-1">
                    {formatCurrency(calcSummary.total_shipping_charges)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Customer logistics fees</div>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Customer Paid Total</span>
                  <div className="text-base md:text-lg font-bold text-slate-900 mt-1">
                    {formatCurrency(calcSummary.total_customer_paid)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Gross + Shipping - Discount</div>
                </div>

                <div className="p-3.5 bg-white border border-emerald-200 bg-emerald-50/30 rounded-2xl shadow-xs">
                  <span className="text-[11px] text-emerald-800 font-medium">Net Seller Payable</span>
                  <div className="text-base md:text-lg font-bold text-emerald-800 mt-1">
                    {formatCurrency(calcSummary.total_net_seller_payable)}
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">Eligible vendor liability</div>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="sm:hidden px-3.5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                <span>↔ Scroll sideways to view product economics</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[880px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Product / Item</th>
                      <th className="py-3.5 px-4">Seller</th>
                      <th className="py-3.5 px-4 text-center">Qty Sold</th>
                      <th className="py-3.5 px-4 text-right">Gross Sales</th>
                      <th className="py-3.5 px-4 text-right">Coupon Absorbed</th>
                      <th className="py-3.5 px-4 text-right">Commission</th>
                      <th className="py-3.5 px-4 text-right">Net Seller Payable</th>
                      <th className="py-3.5 px-4 text-center">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingCalc ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                          Calculating product economics...
                        </td>
                      </tr>
                    ) : calcProducts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <Boxes className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                          No order settlements found for the selected timeframe.
                        </td>
                      </tr>
                    ) : (
                      calcProducts.map((p) => {
                        const isExpanded = expandedProduct === p.product_id;
                        return (
                          <React.Fragment key={p.product_id}>
                            <tr className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-900">{p.product_title}</div>
                                {p.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</div>}
                              </td>

                              <td className="py-3.5 px-4 text-slate-700">
                                {p.seller_name}
                              </td>

                              <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                                {p.total_quantity}
                              </td>

                              <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                                {formatCurrency(p.gross_sales)}
                              </td>

                              <td className="py-3.5 px-4 text-right text-amber-700 font-medium">
                                {p.platform_coupon > 0 ? `+${formatCurrency(p.platform_coupon)}` : "—"}
                              </td>

                              <td className="py-3.5 px-4 text-right text-purple-700 font-medium">
                                {formatCurrency(p.commission_amount)}
                              </td>

                              <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                                {formatCurrency(p.net_seller_payable)}
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <button
                                  onClick={() => setExpandedProduct(isExpanded ? null : p.product_id)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              </td>
                            </tr>

                            {/* Nested order breakdown */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="p-4 bg-slate-50/70 border-y border-slate-200">
                                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="py-2 px-3">Order #</th>
                                          <th className="py-2 px-3">Item Code</th>
                                          <th className="py-2 px-3">Payment</th>
                                          <th className="py-2 px-3">Delivered Date</th>
                                          <th className="py-2 px-3">Qty</th>
                                          <th className="py-2 px-3">Gross</th>
                                          <th className="py-2 px-3">Net Seller</th>
                                          <th className="py-2 px-3">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {p.order_breakdown.map((item) => (
                                          <tr key={item.settlement_id} className="hover:bg-slate-50">
                                            <td className="py-2 px-3 font-medium text-slate-900">{item.order_number}</td>
                                            <td className="py-2 px-3 text-slate-500 font-mono">{item.order_item_code || "—"}</td>
                                            <td className="py-2 px-3 text-slate-600">{item.payment_method}</td>
                                            <td className="py-2 px-3 text-slate-500">{item.delivered_at ? formatExactDateTime(item.delivered_at) : "Pending"}</td>
                                            <td className="py-2 px-3 font-bold text-slate-900">{item.quantity}</td>
                                            <td className="py-2 px-3 text-slate-800">{formatCurrency(item.gross_amount)}</td>
                                            <td className="py-2 px-3 font-bold text-emerald-700">{formatCurrency(item.net_seller_payable)}</td>
                                            <td className="py-2 px-3">
                                              <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-100 text-slate-700 border border-slate-300">
                                                {item.settlement_status}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: COD COURIER REMITTANCE */}
        {/* ===================================================================== */}
        {activeTab === "cod" && (
          <div className="space-y-4">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delivered COD Orders Awaiting Courier Remittance</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Per VENDOSMITH policy, Cash on Delivery funds remain on hold until courier partners remit collected cash to the marketplace account.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleOpenReconcileModal}
                  disabled={selectedCodIds.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 h-auto rounded-xl gap-2 shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Reconcile Selected Orders ({selectedCodIds.length})
                </Button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="sm:hidden px-3.5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                <span>↔ Scroll sideways to view all COD remittance columns</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[860px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={codOrders.length > 0 && selectedCodIds.length === codOrders.length}
                          onChange={handleSelectAllCod}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Seller</th>
                      <th className="py-3 px-4">Order Total</th>
                      <th className="py-3 px-4">Delivery Date</th>
                      <th className="py-3 px-4">Courier AWB / Tracking</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingCod ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                          Loading COD orders...
                        </td>
                      </tr>
                    ) : codOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
                          All delivered COD orders have been successfully reconciled with courier remittances!
                        </td>
                      </tr>
                    ) : (
                      codOrders.map((order) => {
                        const isSelected = selectedCodIds.includes(order.id);
                        return (
                          <tr
                            key={order.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isSelected ? "bg-emerald-50/50" : ""
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectCod(order.id)}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </td>

                            <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                              {order.order_number}
                              <div className="text-[10px] text-slate-400">
                                {formatExactDateTime(order.created_at)}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-slate-700 font-medium">
                              {order.customer_name || "Guest Customer"}
                            </td>

                            <td className="py-3.5 px-4 text-slate-700 font-medium">
                              {order.seller_name || "Multi-Vendor"}
                            </td>

                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              {formatCurrency(order.total_amount)}
                            </td>

                            <td className="py-3.5 px-4 text-slate-600">
                              {order.delivered_at ? formatExactDateTime(order.delivered_at) : "Delivered"}
                            </td>

                            <td className="py-3.5 px-4 font-mono text-slate-500">
                              {order.courier_tracking_id || "Awaiting Tracking"}
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                                {order.remittance_status || "PENDING"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {/* MODAL 1: REVIEW PAYOUT REQUEST (APPROVE / REJECT) */}
        {/* ===================================================================== */}
        {reviewModalOpen && selectedPayout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Review Payout: <span className="font-mono">{selectedPayout.payout_number}</span>
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRevealedReviewAccountNumber(null);
                    setReviewDestination(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                {/* Payout Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500">Seller</span>
                    <div className="font-semibold text-slate-900 mt-0.5 break-words">{selectedPayout.seller_name}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500">Requested Amount</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      {formatCurrency(selectedPayout.amount)}
                    </div>
                  </div>
                </div>

                {/* Linked Financial Destination Details (Protected & Read-Only) */}
                {renderDestinationDetailsCard()}

                {/* Action selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 block">Decision Action</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setReviewAction("approve")}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-semibold ${
                        reviewAction === "approve"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500 shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Approve Payout
                    </button>

                    <button
                      type="button"
                      onClick={() => setReviewAction("reject")}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-semibold ${
                        reviewAction === "reject"
                          ? "bg-rose-50 border-rose-500 text-rose-800 ring-1 ring-rose-500 shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Reject Payout
                    </button>
                  </div>
                </div>

                {/* Rejection Reason (Required if rejected) */}
                {reviewAction === "reject" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-rose-700 block">
                      Rejection Reason <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Provide a specific reason for rejection (e.g. Mismatched account holder name, suspicious velocity, pending dispute)..."
                      className="w-full p-3 bg-slate-50 border border-rose-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                    />
                    <p className="text-[10px] text-slate-500">
                      Rejecting will release the reserved amount ({formatCurrency(selectedPayout.amount)}) back to the seller's available balance.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRevealedReviewAccountNumber(null);
                    setReviewDestination(null);
                  }}
                  className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview}
                  className={`rounded-xl text-white font-semibold cursor-pointer ${
                    reviewAction === "approve"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {isSubmittingReview ? "Processing..." : reviewAction === "approve" ? "Confirm Approval" : "Confirm Rejection"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODAL 2: RECORD MANUAL TRANSFER */}
        {/* ===================================================================== */}
        {transferModalOpen && selectedPayout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <CreditCard className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Record Manual Transfer
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setTransferModalOpen(false);
                    setRevealedReviewAccountNumber(null);
                    setRevealError(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                {/* Transfer Details Card */}
                <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Payout #:</span>
                    <span className="font-bold text-slate-900 font-mono">{selectedPayout.payout_number}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Seller Entity:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[200px]">{selectedPayout.seller_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Transfer Amount:</span>
                    <span className="font-bold text-emerald-800 text-sm">{formatCurrency(selectedPayout.amount)}</span>
                  </div>
                </div>

                {/* Linked Financial Destination Details with Protected Reveal */}
                {renderDestinationDetailsCard()}

                {/* Unverified / Missing Destination Warning */}
                {reviewDestination && !reviewDestination.can_transfer && (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5 text-xs text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">Transfer Blocked: Destination Not Verified</strong>
                      <span>{reviewDestination.warning || "Cannot execute transfer: Payout destination credentials are unverified or missing."}</span>
                    </div>
                  </div>
                )}

                {/* Form fields */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Transfer Method</label>
                    <select
                      value={transferMethod}
                      onChange={(e) => setTransferMethod(e.target.value as "BANK_TRANSFER" | "UPI")}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS / IMPS)</option>
                      <option value="UPI">UPI Transfer</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      UTR / Transaction Reference # <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={utrReference}
                      onChange={(e) => setUtrReference(e.target.value)}
                      placeholder="e.g. UTR123456789012 or UPI Ref #"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Transfer Date</label>
                      <input
                        type="date"
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Transfer Time</label>
                      <input
                        type="time"
                        value={transferTime}
                        onChange={(e) => setTransferTime(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Admin Notes (Optional)</label>
                    <textarea
                      rows={2}
                      value={transferNotes}
                      onChange={(e) => setTransferNotes(e.target.value)}
                      placeholder="Optional internal remarks or reference note..."
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                    />
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="confirmTransferCheck"
                      checked={transferConfirmed}
                      onChange={(e) => setTransferConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="confirmTransferCheck" className="text-[11px] text-slate-600 leading-normal cursor-pointer">
                      I confirm that the manual transfer of <strong>{formatCurrency(selectedPayout.amount)}</strong> has actually been executed from the company account to the seller destination.
                    </label>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTransferModalOpen(false);
                    setRevealedReviewAccountNumber(null);
                    setRevealError(null);
                  }}
                  className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitTransfer}
                  disabled={isSubmittingTransfer || !transferConfirmed || Boolean(reviewDestination && !reviewDestination.can_transfer)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer"
                >
                  {isSubmittingTransfer ? "Recording Transfer..." : "Confirm & Mark as PAID"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODAL 3: FAIL PAYOUT TRANSFER */}
        {/* ===================================================================== */}
        {failModalOpen && selectedPayout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Record Transfer Failure
                  </h3>
                </div>
                <button
                  onClick={() => setFailModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 text-xs">
                <p className="text-slate-600">
                  Marking this transfer as failed will restore <strong>{formatCurrency(selectedPayout.amount)}</strong> back to the seller's available balance and generate an audit trail.
                </p>

                <div>
                  <label className="font-semibold text-rose-700 block mb-1">
                    Failure Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="e.g. Bank rejected payment, beneficiary account frozen, invalid IFSC..."
                    className="w-full p-2.5 bg-slate-50 border border-rose-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Internal Note (Optional)</label>
                  <textarea
                    rows={2}
                    value={failNotes}
                    onChange={(e) => setFailNotes(e.target.value)}
                    placeholder="Optional context for support/finance team..."
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFailModalOpen(false)}
                  className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitFail}
                  disabled={isSubmittingFail}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl cursor-pointer"
                >
                  {isSubmittingFail ? "Recording..." : "Confirm Transfer Failure"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODAL 4: REOPEN REJECTED / FAILED PAYOUT REQUEST */}
        {/* ===================================================================== */}
        {reopenModalOpen && selectedPayout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <RotateCcw className="w-5 h-5 text-blue-600 shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Reopen Payout Request
                  </h3>
                </div>
                <button
                  onClick={() => setReopenModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 text-xs">
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-blue-900 space-y-1">
                  <div>Payout #: <strong>{selectedPayout.payout_number}</strong> ({formatCurrency(selectedPayout.amount)})</div>
                  <div>Current status: <strong>{selectedPayout.status.toUpperCase()}</strong></div>
                  {selectedPayout.rejection_reason && <div>Rejection reason: <em>"{selectedPayout.rejection_reason}"</em></div>}
                  {selectedPayout.failure_reason && <div>Failure reason: <em>"{selectedPayout.failure_reason}"</em></div>}
                  <div className="text-[11px] text-blue-700 pt-1">
                    Reopening will verify the seller's available balance and re-reserve {formatCurrency(selectedPayout.amount)} back into locked balance for administrative re-evaluation.
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Justification Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="e.g. Seller submitted corrected KYC / updated bank IFSC; clearing for re-evaluation..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Internal Note (Optional)</label>
                  <textarea
                    rows={2}
                    value={reopenNotes}
                    onChange={(e) => setReopenNotes(e.target.value)}
                    placeholder="Optional note for accounts team..."
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReopenModalOpen(false)}
                  className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitReopen}
                  disabled={isSubmittingReopen}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl cursor-pointer"
                >
                  {isSubmittingReopen ? "Reopening..." : "Reopen for Review"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODAL 5: INSPECT PAYOUT DETAILS */}
        {/* ===================================================================== */}
        {detailModalOpen && selectedPayout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <Receipt className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Payout Statement: <span className="font-mono">{selectedPayout.payout_number}</span>
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setDetailModalOpen(false);
                    setRevealedReviewAccountNumber(null);
                    setRevealError(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="font-bold uppercase text-slate-900">{selectedPayout.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount:</span>
                    <span className="font-bold text-emerald-700 text-sm">{formatCurrency(selectedPayout.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Seller:</span>
                    <span className="font-semibold text-slate-900">{selectedPayout.seller_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Requested:</span>
                    <span className="text-slate-700">{formatExactDateTime(selectedPayout.requested_at)}</span>
                  </div>
                  {selectedPayout.approved_at && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Approved:</span>
                      <span className="text-slate-700">{formatExactDateTime(selectedPayout.approved_at)}</span>
                    </div>
                  )}
                  {selectedPayout.paid_at && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Paid:</span>
                      <span className="text-emerald-700 font-semibold">{formatExactDateTime(selectedPayout.paid_at)}</span>
                    </div>
                  )}
                  {selectedPayout.rejected_at && (
                    <div className="flex justify-between">
                      <span className="text-rose-600">Rejected:</span>
                      <span className="text-rose-700">{formatExactDateTime(selectedPayout.rejected_at)}</span>
                    </div>
                  )}
                </div>

                {/* Linked Financial Destination Details with Protected Reveal */}
                {renderDestinationDetailsCard()}

                {selectedPayout.rejection_reason && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                    <span className="font-bold text-rose-800 block mb-0.5">Rejection Reason:</span>
                    <span className="text-rose-700">{selectedPayout.rejection_reason}</span>
                  </div>
                )}

                {selectedPayout.failure_reason && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                    <span className="font-bold text-rose-800 block mb-0.5">Failure Reason:</span>
                    <span className="text-rose-700">{selectedPayout.failure_reason}</span>
                  </div>
                )}

                {selectedPayout.transfer && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                    <span className="font-bold text-emerald-900 block mb-1">Transfer Confirmation Receipt</span>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Method:</span>
                      <span className="font-semibold text-slate-900">{selectedPayout.transfer.transfer_method}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">UTR / Ref #:</span>
                      <span className="font-mono font-bold text-emerald-800">{selectedPayout.transfer.utr_reference}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Destination:</span>
                      <span className="text-slate-800 font-mono text-[11px]">{selectedPayout.transfer.destination_masked}</span>
                    </div>
                    {selectedPayout.transfer.actual_transfer_timestamp && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Transfer Time:</span>
                        <span className="text-slate-800">{formatExactDateTime(selectedPayout.transfer.actual_transfer_timestamp)}</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedPayout.admin_notes && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="font-bold text-slate-700 block mb-0.5">Audit / Admin Notes:</span>
                    <span className="text-slate-600 whitespace-pre-wrap">{selectedPayout.admin_notes}</span>
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 cursor-pointer text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  Print Statement
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setDetailModalOpen(false);
                    setRevealedReviewAccountNumber(null);
                    setRevealError(null);
                  }}
                  className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODAL 6: RECONCILE COD REMITTANCE BATCH */}
        {/* ===================================================================== */}
        {reconcileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Reconcile COD Remittance
                  </h3>
                </div>
                <button
                  onClick={() => setReconcileModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Selected Orders Count:</span>
                    <span className="font-bold text-slate-900">{selectedCodIds.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Remittance Value:</span>
                    <span className="font-bold text-emerald-800 text-sm">{formatCurrency(batchAmount)}</span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Courier / Delivery Partner <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      placeholder="e.g. BlueDart, Delhivery, Shadowfax, XpressBees..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Courier Remittance Ref / UTR / Cheque # <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={remittanceRef}
                      onChange={(e) => setRemittanceRef(e.target.value)}
                      placeholder="e.g. CR-DEL-894729482 or Bank UTR..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Internal Note (Optional)</label>
                    <textarea
                      rows={2}
                      value={reconcileNote}
                      onChange={(e) => setReconcileNote(e.target.value)}
                      placeholder="Optional remarks about the courier remittance statement..."
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReconcileModalOpen(false)}
                  className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitReconcile}
                  disabled={isSubmittingReconcile}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer"
                >
                  {isSubmittingReconcile ? "Reconciling..." : "Confirm & Reconcile Orders"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* SLIDE-OVER MODAL 7: SELLER DETAILED FINANCIAL LEDGER & STATEMENT */}
        {/* ===================================================================== */}
        {selectedSellerId && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white border-l border-slate-200 w-full sm:max-w-2xl lg:max-w-3xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
              {/* Header */}
              <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <Building className="w-5 h-5 text-emerald-600 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                      {sellerDetailData?.seller.business_name || "Seller Financial Ledger"}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    ID: {sellerDetailData?.seller.seller_id_code || selectedSellerId}
                    {sellerDetailData?.seller.contact_name ? ` • ${sellerDetailData.seller.contact_name}` : ""}
                    {sellerDetailData?.seller.business_email ? ` • ${sellerDetailData.seller.business_email}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSellerId(null);
                    setSellerDetailData(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Balances Card Ribbon */}
              {sellerDetailData?.balances && (
                <div className="p-3 sm:p-4 grid grid-cols-2 md:grid-cols-4 gap-2.5 bg-white border-b border-slate-200 flex-shrink-0">
                  <div className="p-2.5 sm:p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 min-w-0">
                    <span className="text-[10px] sm:text-[11px] text-emerald-800 font-medium truncate block">Available to Withdraw</span>
                    <div className="text-sm sm:text-base font-bold text-emerald-800 mt-0.5 truncate">
                      {formatCurrency(sellerDetailData.balances.available_balance)}
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-amber-50/60 rounded-xl border border-amber-200 min-w-0">
                    <span className="text-[10px] sm:text-[11px] text-amber-800 font-medium truncate block">Locked in Payout</span>
                    <div className="text-sm sm:text-base font-bold text-amber-800 mt-0.5 truncate">
                      {formatCurrency(sellerDetailData.balances.locked_balance)}
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200 min-w-0">
                    <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate block">Lifetime Earned</span>
                    <div className="text-sm sm:text-base font-bold text-slate-900 mt-0.5 truncate">
                      {formatCurrency(sellerDetailData.balances.lifetime_earned)}
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200 min-w-0">
                    <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate block">Lifetime Disbursed</span>
                    <div className="text-sm sm:text-base font-bold text-slate-900 mt-0.5 truncate">
                      {formatCurrency(sellerDetailData.balances.lifetime_withdrawn)}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tabs */}
              <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0 overflow-x-auto">
                {(["overview", "ledger", "settlements", "payouts", "accounts"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSellerDetailTab(tab)}
                    className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-t-xl cursor-pointer transition-colors shrink-0 ${
                      sellerDetailTab === tab
                        ? "bg-white text-slate-900 border-t border-x border-slate-200 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Slide-over Content Area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {loadingSellerDetail ? (
                  <div className="py-20 text-center text-slate-500">
                    <RefreshCw className="w-7 h-7 animate-spin mx-auto text-emerald-600 mb-2" />
                    Loading seller statement...
                  </div>
                ) : (
                  <>
                    {/* Tab: Overview */}
                    {sellerDetailTab === "overview" && (
                      <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                          <h4 className="font-bold text-slate-900 text-sm">Entity Profile</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div><span className="text-slate-500">Business Name:</span> <strong className="text-slate-800 break-words">{sellerDetailData?.seller.business_name}</strong></div>
                            <div><span className="text-slate-500">Contact:</span> <strong className="text-slate-800">{sellerDetailData?.seller.contact_name || "—"}</strong></div>
                            <div><span className="text-slate-500">Email:</span> <strong className="text-slate-800 break-all">{sellerDetailData?.seller.business_email || "—"}</strong></div>
                            <div><span className="text-slate-500">Phone:</span> <strong className="text-slate-800">{sellerDetailData?.seller.phone || "—"}</strong></div>
                            <div><span className="text-slate-500">UPI ID:</span> <strong className="text-purple-700 font-mono break-all">{sellerDetailData?.seller.upi_id || "None Registered"}</strong></div>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2 text-xs">
                          <h4 className="font-bold text-slate-900 text-sm">Registered Bank Accounts</h4>
                          {sellerDetailData?.bank_accounts && sellerDetailData.bank_accounts.length > 0 ? (
                            <div className="space-y-2">
                              {sellerDetailData.bank_accounts.map((b) => (
                                <div key={b.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">{b.bank_name} • A/C Ending in ****{b.account_number_last4}</div>
                                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                      IFSC: {b.ifsc_code} | Holder: {b.account_holder_name} | Type: {b.account_type}
                                    </div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                                    b.status === "verified" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    {b.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-400">No bank accounts registered by this seller.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab: Ledger */}
                    {sellerDetailTab === "ledger" && (
                      <div className="space-y-2">
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                          <table className="w-full text-left text-xs border-collapse min-w-[540px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                                <th className="py-2.5 px-3">Date</th>
                                <th className="py-2.5 px-3">Type</th>
                                <th className="py-2.5 px-3">Description</th>
                                <th className="py-2.5 px-3 text-right">Amount</th>
                                <th className="py-2.5 px-3 text-right">Balance After</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sellerDetailData?.ledger && sellerDetailData.ledger.length > 0 ? (
                                sellerDetailData.ledger.map((l) => (
                                  <tr key={l.id} className="hover:bg-slate-50">
                                    <td className="py-2.5 px-3 text-slate-500 text-[10px]">
                                      {formatExactDateTime(l.created_at)}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                        l.direction === "credit" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                      }`}>
                                        {l.entry_type}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-800 max-w-xs truncate" title={l.description}>
                                      {l.description}
                                    </td>
                                    <td className={`py-2.5 px-3 text-right font-bold ${
                                      l.direction === "credit" ? "text-emerald-700" : "text-amber-700"
                                    }`}>
                                      {l.direction === "credit" ? "+" : "-"}{formatCurrency(l.amount)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                                      {formatCurrency(l.available_balance_after)}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="py-8 text-center text-slate-400">
                                    No ledger records for this seller.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab: Settlements */}
                    {sellerDetailTab === "settlements" && (
                      <div className="space-y-2">
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                          <table className="w-full text-left text-xs border-collapse min-w-[560px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                                <th className="py-2.5 px-3">Order #</th>
                                <th className="py-2.5 px-3">Product</th>
                                <th className="py-2.5 px-3">Method</th>
                                <th className="py-2.5 px-3 text-right">Gross</th>
                                <th className="py-2.5 px-3 text-right">Net Payable</th>
                                <th className="py-2.5 px-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sellerDetailData?.settlements && sellerDetailData.settlements.length > 0 ? (
                                sellerDetailData.settlements.map((s) => (
                                  <tr key={s.id} className="hover:bg-slate-50">
                                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                                      {s.order_number}
                                      <div className="text-[9px] text-slate-400">{formatExactDateTime(s.created_at)}</div>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-800 max-w-xs truncate" title={s.product_title}>
                                      {s.product_title} (x{s.quantity})
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600">{s.payment_method}</td>
                                    <td className="py-2.5 px-3 text-right text-slate-800">{formatCurrency(s.gross_amount)}</td>
                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{formatCurrency(s.net_seller_payable)}</td>
                                    <td className="py-2.5 px-3">
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-100 text-slate-700 border border-slate-300">
                                        {s.settlement_status}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={6} className="py-8 text-center text-slate-400">
                                    No settlements found for this seller.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab: Payouts */}
                    {sellerDetailTab === "payouts" && (
                      <div className="space-y-2">
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                          <table className="w-full text-left text-xs border-collapse min-w-[580px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                                <th className="py-2.5 px-3">Payout #</th>
                                <th className="py-2.5 px-3">Requested</th>
                                <th className="py-2.5 px-3 text-right">Amount</th>
                                <th className="py-2.5 px-3">Destination</th>
                                <th className="py-2.5 px-3">Status</th>
                                <th className="py-2.5 px-3">UTR / Ref</th>
                                <th className="py-2.5 px-3 text-right">Statement</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sellerDetailData?.payouts && sellerDetailData.payouts.length > 0 ? (
                                sellerDetailData.payouts.map((p) => (
                                  <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{p.payout_number}</td>
                                    <td className="py-2.5 px-3 text-slate-500">{formatExactDateTime(p.requested_at)}</td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(p.amount)}</td>
                                    <td className="py-2.5 px-3 text-slate-600">{p.destination_type}</td>
                                    <td className="py-2.5 px-3">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                        p.status === "paid" ? "bg-emerald-100 text-emerald-800" :
                                        p.status === "rejected" ? "bg-rose-100 text-rose-800" :
                                        p.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                                      }`}>
                                        {p.status}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                                      {p.transfer?.utr_reference || "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenDetailModal(p as any)}
                                        title="View Statement & Full Bank Details"
                                        className="p-1 rounded-md bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer inline-flex items-center"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={7} className="py-8 text-center text-slate-400">
                                    No payout requests submitted by this seller.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab: Accounts */}
                    {sellerDetailTab === "accounts" && (
                      <div className="space-y-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                          <h4 className="font-bold text-slate-900 text-sm">Bank Accounts & UPI Status</h4>
                          {sellerDetailData?.bank_accounts && sellerDetailData.bank_accounts.length > 0 ? (
                            <div className="space-y-3">
                              {sellerDetailData.bank_accounts.map((b) => (
                                <div key={b.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-slate-900">{b.bank_name} {b.is_primary ? "(Primary)" : ""}</div>
                                    <div className="text-xs text-slate-600 mt-0.5">Holder: {b.account_holder_name}</div>
                                    <div className="text-xs font-mono text-slate-500">IFSC: {b.ifsc_code} • Masked: ••••••••{b.account_number_last4}</div>
                                  </div>
                                  <Link
                                    href="/admin/finance/bank-accounts"
                                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    Manage in Approvals
                                  </Link>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">No bank accounts registered.</p>
                          )}

                          <div className="pt-3 border-t border-slate-100">
                            <span className="text-xs font-semibold text-slate-700 block mb-1">Registered UPI ID</span>
                            <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl font-mono text-xs text-purple-900">
                              {sellerDetailData?.seller.upi_id || "No UPI ID registered"}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
