"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import {
  Briefcase,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Eye,
  RefreshCw,
  Package,
  ShoppingBag,
  Zap,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatRelativeTime, formatSequentialSellerId } from "@/lib/utils";
import { SellerDetailsModal } from "@/components/admin/SellerDetailsModal";
import { CustomerDetailsModal } from "@/components/admin/CustomerDetailsModal";

export interface EnrichedSeller {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  business_email: string | null;
  business_type: string | null;
  verification_status: string;
  membership_plan: string | null;
  created_at: string;
  seller_id_code?: string;
  rejection_reason?: string | null;
  rejection_note?: string | null;
  correction_reason?: string | null;
  correction_note?: string | null;
  reviewed_at?: string | null;
  resubmitted_at?: string | null;
  store?: {
    id: string;
    name: string;
    status: string;
    slug: string;
  } | null;
  product_count?: number;
  total_orders?: number;
  total_sales?: number;
  last_order_at?: string | null;
}

type DialogActionType =
  | "approve"
  | "reject"
  | "return_for_correction"
  | "reconsider"
  | "suspend"
  | "unsuspend";

const CORRECTION_REASON_PRESETS = [
  "Identity / Document Verification Incomplete",
  "Invalid Business Registration / Tax Information",
  "Store Profile & Description Non-compliant",
  "Contact Phone / Email Verification Needed",
  "Product Catalog / Pricing Compliance Check",
  "Bank Account & Payment Document Discrepancy",
  "Custom Reason (Enter below)",
];

const REJECTION_REASON_PRESETS = [
  "Prohibited Product Category or Marketplace Policy Violation",
  "Failed Business / Identity Background Verification",
  "Ineligible Business Entity / Unsupported Jurisdiction",
  "Duplicate Seller Account Detected",
  "Risk Assessment / Compliance Disqualification",
  "Custom Reason (Enter below)",
];

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<EnrichedSeller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Action Dialog state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionTargetSeller, setActionTargetSeller] = useState<EnrichedSeller | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<DialogActionType>("approve");
  const [actionReason, setActionReason] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");

  // Interconnected Modal states
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchSellers = useCallback(async () => {
    setIsLoading(true);

    try {
      // 1. Fetch Seller Profiles & Stores
      const { data: sellerData, error: sellerErr } = await supabase
        .from("seller_profiles")
        .select("*, stores(id, name, status, slug)")
        .order("created_at", { ascending: false });

      if (sellerErr) throw sellerErr;

      if (sellerData && sellerData.length > 0) {
        const storeIds = sellerData
          .map((s: { stores?: { id?: string } | { id?: string }[] | null }) =>
            Array.isArray(s.stores) ? s.stores[0]?.id : s.stores?.id
          )
          .filter(Boolean) as string[];

        // 2. Fetch Product Counts per Store
        const productCountMap = new Map<string, number>();
        if (storeIds.length > 0) {
          const { data: prodData } = await supabase
            .from("products")
            .select("store_id");

          (prodData || []).forEach((p: { store_id?: string | null }) => {
            if (p.store_id) {
              productCountMap.set(p.store_id, (productCountMap.get(p.store_id) || 0) + 1);
            }
          });
        }

        // 3. Fetch Order Stats per Store
        const orderStatsMap = new Map<
          string,
          { total_orders: Set<string>; total_sales: number; last_order_at: string | null }
        >();

        if (storeIds.length > 0) {
          const { data: itemData } = await supabase
            .from("order_items")
            .select("store_id, order_id, line_total, orders(created_at)")
            .in("store_id", storeIds);

          (itemData || []).forEach((item: {
            store_id?: string | null;
            order_id?: string | null;
            line_total?: number | string | null;
            orders?: { created_at?: string } | { created_at?: string }[] | null;
          }) => {
            if (!item.store_id) return;
            const current = orderStatsMap.get(item.store_id) || {
              total_orders: new Set<string>(),
              total_sales: 0,
              last_order_at: null,
            };

            if (item.order_id) current.total_orders.add(item.order_id);
            current.total_sales += Number(item.line_total || 0);

            const ordDate = Array.isArray(item.orders) ? item.orders[0]?.created_at : item.orders?.created_at;
            if (ordDate) {
              if (!current.last_order_at || new Date(ordDate) > new Date(current.last_order_at)) {
                current.last_order_at = ordDate;
              }
            }

            orderStatsMap.set(item.store_id, current);
          });
        }

        const enriched: EnrichedSeller[] = sellerData.map((s: EnrichedSeller & {
          stores?: { id: string; name: string; status: string; slug: string } | { id: string; name: string; status: string; slug: string }[] | null;
        }) => {
          const storeObj = Array.isArray(s.stores) ? s.stores[0] : s.stores;
          const storeId = storeObj?.id;
          const pCount = storeId ? productCountMap.get(storeId) || 0 : 0;
          const oStats = storeId ? orderStatsMap.get(storeId) : null;

          return {
            ...s,
            store: storeObj || null,
            product_count: pCount,
            total_orders: oStats ? oStats.total_orders.size : 0,
            total_sales: oStats ? oStats.total_sales : 0,
            last_order_at: oStats ? oStats.last_order_at : null,
          };
        });

        setSellers(enriched);
      } else {
        setSellers([]);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to fetch sellers.";
      addToast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, addToast]);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  const handleActionClick = (
    seller: EnrichedSeller,
    action: DialogActionType
  ) => {
    setActionTargetSeller(seller);
    setDialogAction(action);
    setActionReason("");
    setActionNote("");
    setSelectedPreset("");
    setDialogOpen(true);
  };

  const handlePresetSelect = (val: string) => {
    setSelectedPreset(val);
    if (val && !val.startsWith("Custom")) {
      setActionReason(val);
    } else {
      setActionReason("");
    }
  };

  const executeAction = async () => {
    if (!actionTargetSeller) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/admin/sellers/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: actionTargetSeller.id,
          action: dialogAction,
          reason: actionReason.trim(),
          note: actionNote.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process seller action.");
      }

      addToast({
        title: "Success",
        description: data.message || "Action completed successfully.",
        type: "success",
      });

      setDialogOpen(false);
      await fetchSellers();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "An unexpected error occurred.";

      addToast({
        title: "Action Failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="w-3 h-3" /> APPROVED
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3 h-3" /> PENDING
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <RotateCcw className="w-3 h-3" /> UNDER REVIEW
          </span>
        );
      case "correction_required":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <AlertCircle className="w-3 h-3" /> CORRECTION REQUIRED
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3" /> REJECTED
          </span>
        );
      case "suspended":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
            <ShieldAlert className="w-3 h-3" /> SUSPENDED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800">
            {status?.toUpperCase()}
          </span>
        );
    }
  };

  // Status counts for tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: sellers.length,
      pending: 0,
      under_review: 0,
      correction_required: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
    };
    sellers.forEach((s) => {
      if (counts[s.verification_status] !== undefined) {
        counts[s.verification_status]++;
      }
    });
    return counts;
  }, [sellers]);

  const filters = [
    { id: "all", label: "All", count: statusCounts.all },
    { id: "pending", label: "Pending", count: statusCounts.pending },
    { id: "under_review", label: "Under Review", count: statusCounts.under_review },
    { id: "correction_required", label: "Correction Required", count: statusCounts.correction_required },
    { id: "approved", label: "Approved", count: statusCounts.approved },
    { id: "rejected", label: "Rejected", count: statusCounts.rejected },
    { id: "suspended", label: "Suspended", count: statusCounts.suspended },
  ];

  // Filter sellers by tab & search term
  const filteredSellers = useMemo(() => {
    return sellers.filter((s) => {
      // Status filter
      if (filter !== "all" && s.verification_status !== filter) {
        return false;
      }
      // Search filter
      const term = searchTerm.toLowerCase();
      if (!term) return true;
      return (
        (s.business_name && s.business_name.toLowerCase().includes(term)) ||
        (s.contact_name && s.contact_name.toLowerCase().includes(term)) ||
        (s.business_email && s.business_email.toLowerCase().includes(term)) ||
        (s.store?.name && s.store.name.toLowerCase().includes(term)) ||
        s.id.toLowerCase().includes(term) ||
        (s.seller_id_code && s.seller_id_code.toLowerCase().includes(term))
      );
    });
  }, [sellers, filter, searchTerm]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col p-4 md:p-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Seller Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review vendor applications, manage moderation workflows, and track performance.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchSellers} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Main Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col flex-1 overflow-hidden">
        {/* Toolbar & Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by seller ID, owner, store or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="flex bg-slate-100/80 rounded-xl p-1 overflow-x-auto gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  filter === f.id
                    ? "bg-white text-indigo-700 font-bold shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                    filter === f.id ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Sellers Table */}
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-16 flex flex-col justify-center items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading applications...</p>
            </div>
          ) : filteredSellers.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-4">Seller & ID</th>
                  <th className="p-4">Store & Status</th>
                  <th className="p-4">Contact Details</th>
                  <th className="p-4">Products & Sales</th>
                  <th className="p-4">Verification</th>
                  <th className="p-4 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredSellers.map((seller, index) => {
                  return (
                    <tr key={seller.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-bold text-slate-900 mb-0.5">
                          {seller.business_name || seller.contact_name}
                        </div>
                        <div className="font-mono text-[11px] font-semibold text-indigo-600">
                          ID: {formatSequentialSellerId(index, seller.seller_id_code)}
                        </div>
                        <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          {seller.membership_plan || "BASIC"}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Applied: {new Date(seller.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <div className="font-semibold text-slate-800">
                          {seller.store?.name || "No Store Registered"}
                        </div>
                        {seller.store ? (
                          <div className="mt-1">{getStatusBadge(seller.store.status)}</div>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                        {seller.store?.slug && (
                          <div className="text-[11px] text-slate-400 font-mono mt-1">
                            slug: {seller.store.slug}
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="font-medium text-slate-800">{seller.contact_name}</div>
                        <div className="text-slate-500 mt-0.5">{seller.business_email}</div>
                        <div className="text-slate-500">{seller.phone || "No Phone"}</div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          {seller.product_count || 0} products
                        </div>
                        <div className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                          {seller.total_orders || 0} orders ({formatCurrency(seller.total_sales || 0)})
                        </div>
                        {seller.last_order_at && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Last: {formatRelativeTime(seller.last_order_at)}
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top">
                        <div>{getStatusBadge(seller.verification_status)}</div>

                        {/* Reason snapshots if present */}
                        {seller.verification_status === "correction_required" && seller.correction_reason && (
                          <div className="mt-1.5 p-1.5 bg-purple-50 text-purple-900 border border-purple-200 rounded text-[11px] max-w-[200px] truncate" title={seller.correction_reason}>
                            <strong>Reason:</strong> {seller.correction_reason}
                          </div>
                        )}
                        {seller.verification_status === "rejected" && seller.rejection_reason && (
                          <div className="mt-1.5 p-1.5 bg-rose-50 text-rose-900 border border-rose-200 rounded text-[11px] max-w-[200px] truncate" title={seller.rejection_reason}>
                            <strong>Reason:</strong> {seller.rejection_reason}
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            onClick={() => setSelectedSellerId(seller.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-md text-xs font-semibold transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Details
                          </button>

                          {/* Action Buttons Matching Lifecycle Rules */}
                          {(seller.verification_status === "pending" ||
                            seller.verification_status === "under_review") && (
                            <div className="flex flex-wrap gap-1 justify-end pt-1">
                              <button
                                onClick={() => handleActionClick(seller, "approve")}
                                className="px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Approve application & store"
                              >
                                <CheckCircle className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleActionClick(seller, "return_for_correction")}
                                className="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Return to applicant for revisions"
                              >
                                <AlertCircle className="w-3 h-3" /> Return for Correction
                              </button>
                              <button
                                onClick={() => handleActionClick(seller, "reject")}
                                className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Reject application"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </div>
                          )}

                          {seller.verification_status === "correction_required" && (
                            <div className="flex flex-wrap gap-1 justify-end pt-1">
                              <button
                                onClick={() => handleActionClick(seller, "approve")}
                                className="px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleActionClick(seller, "return_for_correction")}
                                className="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <AlertCircle className="w-3 h-3" /> Update Correction
                              </button>
                              <button
                                onClick={() => handleActionClick(seller, "reject")}
                                className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </div>
                          )}

                          {seller.verification_status === "rejected" && (
                            <div className="flex flex-wrap gap-1 justify-end pt-1">
                              <button
                                onClick={() => handleActionClick(seller, "reconsider")}
                                className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Reconsider & move back to Under Review"
                              >
                                <RotateCcw className="w-3 h-3" /> Reconsider
                              </button>
                              <button
                                onClick={() => handleActionClick(seller, "approve")}
                                className="px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleActionClick(seller, "return_for_correction")}
                                className="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <AlertCircle className="w-3 h-3" /> Correction
                              </button>
                            </div>
                          )}

                          {seller.verification_status === "approved" && (
                            <div className="pt-1">
                              <button
                                onClick={() => handleActionClick(seller, "suspend")}
                                className="px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 rounded text-[11px] font-semibold transition-colors"
                              >
                                Suspend Seller
                              </button>
                            </div>
                          )}

                          {seller.verification_status === "suspended" && (
                            <div className="pt-1">
                              <button
                                onClick={() => handleActionClick(seller, "unsuspend")}
                                className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Unsuspend / Reactivate
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center text-slate-500">
              <Briefcase className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No seller applications found</h3>
              <p className="text-xs text-slate-500">
                There are no seller applications matching this search or status filter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Structured Moderation Action Modal */}
      {dialogOpen && actionTargetSeller && (
        <Modal
          isOpen={dialogOpen}
          onClose={() => !actionLoading && setDialogOpen(false)}
          title={
            dialogAction === "approve"
              ? "Approve Seller Application"
              : dialogAction === "reject"
              ? "Reject Seller Application"
              : dialogAction === "return_for_correction"
              ? "Return Application for Correction"
              : dialogAction === "reconsider"
              ? "Reconsider Seller Application"
              : dialogAction === "suspend"
              ? "Suspend Seller Account"
              : "Unsuspend & Reactivate Seller"
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div
                className={`p-2.5 rounded-full flex-shrink-0 ${
                  dialogAction === "approve" || dialogAction === "unsuspend"
                    ? "bg-green-100 text-green-700"
                    : dialogAction === "reject" || dialogAction === "suspend"
                    ? "bg-rose-100 text-rose-700"
                    : dialogAction === "return_for_correction"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {dialogAction === "approve" || dialogAction === "unsuspend" ? (
                  <CheckCircle className="w-5 h-5" />
                ) : dialogAction === "reject" || dialogAction === "suspend" ? (
                  <XCircle className="w-5 h-5" />
                ) : dialogAction === "return_for_correction" ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <RotateCcw className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 text-xs">
                <p className="text-slate-800 font-semibold text-sm">
                  {actionTargetSeller.business_name || actionTargetSeller.contact_name}
                </p>
                <p className="text-slate-500 mt-0.5">
                  Current Status:{" "}
                  <span className="font-bold uppercase text-slate-700">
                    {actionTargetSeller.verification_status}
                  </span>{" "}
                  • Email: {actionTargetSeller.business_email}
                </p>
              </div>
            </div>

            {/* Approval Info */}
            {dialogAction === "approve" && (
              <div className="text-xs text-slate-600 bg-emerald-50/70 p-3 rounded-lg border border-emerald-100 space-y-1">
                <p className="font-semibold text-emerald-900">What happens on approval:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-emerald-800">
                  <li>Seller profile and marketplace store are marked as <strong>Approved</strong>.</li>
                  <li>User account role upgraded to <strong>Seller</strong>.</li>
                  <li>Official verified seller code and certificate registry recorded.</li>
                  <li>Seller receives welcome notification with dashboard link.</li>
                </ul>
              </div>
            )}

            {/* Reconsideration Info */}
            {dialogAction === "reconsider" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Reconsidering will move this seller from <strong>{actionTargetSeller.verification_status}</strong> to{" "}
                  <strong>Under Review</strong>, allowing full moderation (Approve, Request Correction, or Reject again).
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reconsideration Note (Optional message for seller history):
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g., Documents verified via appeal; reopening application for review..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Return for Correction Inputs */}
            {dialogAction === "return_for_correction" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correction Reason Template:
                  </label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    value={selectedPreset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                  >
                    <option value="">Select a reason template or enter custom...</option>
                    {CORRECTION_REASON_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correction Reason <span className="text-rose-500">* (Required)</span>:
                  </label>
                  <textarea
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="Explain clearly what corrections the applicant must make..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Admin Custom Message / Instructions (Optional):
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="Provide additional guidance, contact details, or specific file requirements..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Rejection Inputs */}
            {dialogAction === "reject" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rejection Reason Template:
                  </label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    value={selectedPreset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                  >
                    <option value="">Select a rejection reason template...</option>
                    {REJECTION_REASON_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rejection Reason <span className="text-rose-500">* (Required)</span>:
                  </label>
                  <textarea
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    placeholder="Explain the specific reason for rejecting this application..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Admin Custom Message (Optional):
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    placeholder="Optional details or instructions regarding support appeal..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Suspend / Unsuspend */}
            {(dialogAction === "suspend" || dialogAction === "unsuspend") && (
              <p className="text-xs text-slate-600">
                Are you sure you want to{" "}
                <strong>{dialogAction === "suspend" ? "suspend" : "unsuspend and reactivate"}</strong> this seller?
              </p>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className={
                  dialogAction === "approve" || dialogAction === "unsuspend"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : dialogAction === "reject" || dialogAction === "suspend"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : dialogAction === "return_for_correction"
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }
                onClick={executeAction}
                isLoading={actionLoading}
                disabled={
                  (dialogAction === "return_for_correction" || dialogAction === "reject") &&
                  !actionReason.trim()
                }
              >
                Confirm {dialogAction.replace(/_/g, " ").toUpperCase()}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Seller Details Modal */}
      {selectedSellerId && (
        <SellerDetailsModal
          sellerId={selectedSellerId}
          isOpen={!!selectedSellerId}
          onClose={() => setSelectedSellerId(null)}
          onRefresh={fetchSellers}
          onSelectCustomer={(custUserId) => {
            setSelectedSellerId(null);
            setSelectedCustomerId(custUserId);
          }}
        />
      )}

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
    </div>
  );
}
