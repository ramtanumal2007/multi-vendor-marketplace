"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatExactDateTime, formatRelativeTime } from "@/lib/utils";
import { SellerDetailsModal } from "@/components/admin/SellerDetailsModal";
import { CustomerDetailsModal } from "@/components/admin/CustomerDetailsModal";

interface EnrichedSeller {
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

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<EnrichedSeller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Action Dialog state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionTargetSeller, setActionTargetSeller] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject" | "return_for_correction" | "suspend">("approve");
  const [adminComment, setAdminComment] = useState("");

  // Interconnected Modal states
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchSellers = async () => {
    setIsLoading(true);

    try {
      // 1. Fetch Seller Profiles & Stores
      let query = supabase
        .from("seller_profiles")
        .select("*, stores(id, name, status, slug)")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("verification_status", filter);
      }

      const { data: sellerData, error: sellerErr } = await query;
      if (sellerErr) throw sellerErr;

      if (sellerData && sellerData.length > 0) {
        const storeIds = sellerData
          .map((s) => (Array.isArray(s.stores) ? s.stores[0]?.id : s.stores?.id))
          .filter(Boolean);

        // 2. Fetch Product Counts per Store
        let productCountMap = new Map<string, number>();
        if (storeIds.length > 0) {
          const { data: prodData } = await supabase
            .from("products")
            .select("store_id");

          (prodData || []).forEach((p) => {
            if (p.store_id) {
              productCountMap.set(p.store_id, (productCountMap.get(p.store_id) || 0) + 1);
            }
          });
        }

        // 3. Fetch Order Stats per Store
        let orderStatsMap = new Map<
          string,
          { total_orders: Set<string>; total_sales: number; last_order_at: string | null }
        >();

        if (storeIds.length > 0) {
          const { data: itemData } = await supabase
            .from("order_items")
            .select("store_id, order_id, line_total, orders(created_at)")
            .in("store_id", storeIds);

          (itemData || []).forEach((item: any) => {
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

        const enriched: EnrichedSeller[] = sellerData.map((s) => {
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
    } catch (err: any) {
      addToast({ title: "Error", description: err.message || "Failed to fetch sellers.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, [filter]);

  const handleActionClick = (seller: any, action: "approve" | "reject" | "return_for_correction" | "suspend") => {
    setActionTargetSeller(seller);
    setDialogAction(action);
    setAdminComment("");
    setDialogOpen(true);
  };

  const executeAction = async () => {
    if (!actionTargetSeller) return;
    setActionLoading(true);

    try {
      if (dialogAction === "approve") {
        const { error } = await supabase.rpc("approve_seller", { p_seller_id: actionTargetSeller.id });
        if (error) throw error;
        addToast({ title: "Approved", description: "Seller and store have been approved.", type: "success" });
      } else if (dialogAction === "reject") {
        const { error } = await supabase.rpc("reject_seller", { p_seller_id: actionTargetSeller.id });
        if (error) throw error;
        addToast({ title: "Rejected", description: "Seller has been rejected.", type: "success" });
      } else if (dialogAction === "suspend") {
        const { error } = await supabase.rpc("suspend_seller", { p_seller_id: actionTargetSeller.id });
        if (error) throw error;
        addToast({ title: "Suspended", description: "Seller has been suspended.", type: "success" });
      } else if (dialogAction === "return_for_correction") {
        if (!adminComment.trim()) throw new Error("A comment is required.");
        const { error } = await supabase.rpc("return_for_correction", {
          p_seller_id: actionTargetSeller.id,
          p_comment: adminComment,
        });
        if (error) throw error;
        addToast({ title: "Returned", description: "Seller returned for correction.", type: "success" });
      }

      setDialogOpen(false);
      fetchSellers();
    } catch (err: any) {
      addToast({ title: "Error", description: err.message || "Failed to process action.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">APPROVED</span>;
      case "pending":
      case "under_review":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">PENDING</span>;
      case "correction_required":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">CORRECTION REQUIRED</span>;
      case "rejected":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">REJECTED</span>;
      case "suspended":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">SUSPENDED</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800">{status.toUpperCase()}</span>;
    }
  };

  const filters = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "under_review", label: "Under Review" },
    { id: "correction_required", label: "Correction Required" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "suspended", label: "Suspended" },
  ];

  // Filter sellers by search term
  const filteredSellers = sellers.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      (s.business_name && s.business_name.toLowerCase().includes(term)) ||
      (s.contact_name && s.contact_name.toLowerCase().includes(term)) ||
      (s.business_email && s.business_email.toLowerCase().includes(term)) ||
      (s.store?.name && s.store.name.toLowerCase().includes(term)) ||
      s.id.toLowerCase().includes(term) ||
      (s.seller_id_code && s.seller_id_code.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Seller Management</h1>
          <p className="text-sm text-slate-500 mt-1">Review vendor applications, store performance, and incoming order metrics.</p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchSellers} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Main Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar & Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4 bg-slate-50/50">
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

          <div className="flex bg-white rounded-lg border border-slate-200 p-1 flex-wrap gap-1 w-full lg:w-auto">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f.id ? "bg-indigo-50 text-indigo-700 font-bold shadow-xs" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sellers Table */}
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-12 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredSellers.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-4">Seller & ID</th>
                  <th className="p-4">Store & Status</th>
                  <th className="p-4">Contact Details</th>
                  <th className="p-4">Products & Sales</th>
                  <th className="p-4">Verification</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredSellers.map((seller) => {
                  return (
                    <tr key={seller.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-bold text-slate-900 mb-0.5">{seller.business_name || seller.contact_name}</div>
                        <div className="font-mono text-[10px] text-slate-400 font-medium">ID: {seller.id}</div>
                        <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          {seller.membership_plan || "BASIC"}
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <div className="font-semibold text-slate-800">{seller.store?.name || "No Store Registered"}</div>
                        {seller.store ? (
                          <div className="mt-1">{getStatusBadge(seller.store.status)}</div>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
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

                      <td className="p-4 align-top">{getStatusBadge(seller.verification_status)}</td>

                      <td className="p-4 align-top text-right space-y-2">
                        <button
                          onClick={() => setSelectedSellerId(seller.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Details
                        </button>

                        {seller.verification_status === "pending" || seller.verification_status === "under_review" ? (
                          <div className="flex gap-1 justify-end pt-1">
                            <button
                              onClick={() => handleActionClick(seller, "approve")}
                              className="px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-0.5"
                            >
                              <CheckCircle className="w-3 h-3" /> Approve
                            </button>
                            <button
                              onClick={() => handleActionClick(seller, "reject")}
                              className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-0.5"
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        ) : seller.verification_status === "approved" ? (
                          <div className="pt-1">
                            <button
                              onClick={() => handleActionClick(seller, "suspend")}
                              className="px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700 border border-slate-200 rounded text-[11px] font-semibold transition-colors"
                            >
                              Suspend Seller
                            </button>
                          </div>
                        ) : null}
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
              <p className="text-xs text-slate-500">There are no seller applications matching this search or filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* Moderation Action Modal */}
      {dialogOpen && actionTargetSeller && (
        <Modal
          isOpen={dialogOpen}
          onClose={() => !actionLoading && setDialogOpen(false)}
          title={
            dialogAction === "approve"
              ? "Approve Seller"
              : dialogAction === "reject"
              ? "Reject Seller"
              : dialogAction === "suspend"
              ? "Suspend Seller"
              : "Return for Correction"
          }
        >
          <div>
            <div className="flex items-start gap-4 mb-6">
              <div
                className={`p-3 rounded-full ${
                  dialogAction === "approve"
                    ? "bg-green-100 text-green-600"
                    : dialogAction === "reject"
                    ? "bg-red-100 text-red-600"
                    : "bg-purple-100 text-purple-600"
                }`}
              >
                {dialogAction === "approve" ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <p className="text-slate-600 text-sm mt-1">
                  Are you sure you want to {dialogAction.replace(/_/g, " ")} the application for{" "}
                  <strong>{actionTargetSeller.business_name || actionTargetSeller.contact_name}</strong>?
                </p>

                {dialogAction === "return_for_correction" && (
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for correction (required)</label>
                    <textarea
                      className="w-full border border-slate-300 rounded-md shadow-xs p-2 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                      rows={4}
                      value={adminComment}
                      onChange={(e) => setAdminComment(e.target.value)}
                      placeholder="Please explain what the seller needs to correct..."
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className={
                  dialogAction === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : dialogAction === "reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }
                onClick={executeAction}
                isLoading={actionLoading}
                disabled={dialogAction === "return_for_correction" && !adminComment.trim()}
              >
                Confirm
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

      {/* Customer Details Modal (Opened from incoming orders customer link) */}
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
