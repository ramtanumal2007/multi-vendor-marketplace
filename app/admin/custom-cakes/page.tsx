"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  Cake,
  Search,
  XCircle,
  Loader2,
  Store,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface SellerOption {
  id: string;
  business_name: string;
  seller_id_code?: string;
  verification_status: string;
  store?: { id: string; name: string } | null;
}

interface CustomCakeAdminRow {
  id: string;
  request_number: string;
  user_id: string;
  cake_type: string;
  flavor: string;
  weight: string;
  budget_max: number;
  budget_min?: number;
  preferred_delivery_date: string;
  preferred_delivery_time: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: {
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    landmark?: string;
  };
  theme_description: string;
  message_on_cake?: string;
  dietary_notes?: string;
  additional_instructions?: string;
  status: string;
  assigned_seller_id?: string;
  assigned_store_id?: string;
  seller_quote?: {
    cake_price: number;
    customization_charge: number;
    delivery_charge: number;
    discount: number;
    final_amount: number;
    seller_note?: string;
    quoted_at?: string;
  } | null;
  converted_order_id?: string;
  created_at: string;
  stores?: { id: string; name: string } | null;
  seller_profiles?: { id: string; business_name: string; seller_id_code?: string } | null;
  signed_reference_images?: { path: string; signedUrl: string }[];
}

const STATUS_FILTERS = [
  { id: "ALL", label: "All Requests" },
  { id: "SUBMITTED", label: "Submitted" },
  { id: "FORWARDED_TO_SELLER", label: "At Bakery" },
  { id: "QUOTED", label: "Quoted" },
  { id: "CONVERTED_TO_ORDER", label: "Converted to Order" },
  { id: "CLARIFICATION_REQUESTED", label: "Clarification" },
  { id: "REJECTED", label: "Rejected" },
];

export default function AdminCustomCakesPage() {
  const { addToast } = useToast();
  const [requests, setRequests] = useState<CustomCakeAdminRow[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Inspector Modal State
  const [activeRequest, setActiveRequest] = useState<CustomCakeAdminRow | null>(null);
  const [activeActivityLogs, setActiveActivityLogs] = useState<unknown[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Forward Modal State
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [isSubmittingForward, setIsSubmittingForward] = useState(false);

  // Reject / Clarify States
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [clarifyText, setClarifyText] = useState("");
  const [isClarifyModalOpen, setIsClarifyModalOpen] = useState(false);

  // Fetch Requests
  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (searchQuery.trim()) params.set("query", searchQuery.trim());

      const res = await fetch(`/api/admin/custom-cakes?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    } catch (err) {
      console.error("Failed to load admin custom cakes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Eligible Approved Sellers (Section P)
  const fetchEligibleSellers = async () => {
    try {
      const res = await fetch("/api/admin/custom-cakes/sellers");
      const data = await res.json();
      if (data.success && Array.isArray(data.sellers)) {
        setSellers(data.sellers);
      }
    } catch (err) {
      console.error("Failed to load eligible sellers:", err);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchRequests();
    fetchEligibleSellers();
  }, [selectedStatus]);

  // Open Detailed Inspector
  const handleOpenInspector = async (req: CustomCakeAdminRow) => {
    setActiveRequest(req);
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/admin/custom-cakes/${req.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_details" }),
      });
      const data = await res.json();
      if (data.success && data.request) {
        setActiveRequest(data.request);
        setActiveActivityLogs(data.activity_logs || []);
      }
    } catch (err) {
      console.error("Failed to load detailed inspector:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle Forward to Seller
  const handleForwardToSeller = async () => {
    if (!activeRequest || !selectedSellerId) {
      addToast({ title: "Select Seller", description: "Please select an approved seller.", type: "error" });
      return;
    }

    setIsSubmittingForward(true);
    try {
      const selectedSeller = sellers.find((s) => s.id === selectedSellerId);
      const res = await fetch(`/api/admin/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forward_to_seller",
          seller_id: selectedSellerId,
          store_id: selectedSeller?.store?.id || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to forward request.");
      }

      addToast({
        title: "Request Forwarded! 🎂",
        description: `Custom cake request assigned to ${selectedSeller?.business_name}.`,
        type: "success",
      });

      setIsForwardModalOpen(false);
      setSelectedSellerId("");
      await handleOpenInspector(activeRequest);
      fetchRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error forwarding request.";
      addToast({ title: "Forward Failed", description: msg, type: "error" });
    } finally {
      setIsSubmittingForward(false);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!activeRequest || !rejectReason.trim()) {
      addToast({ title: "Reason Required", description: "Please provide a rejection reason.", type: "error" });
      return;
    }

    try {
      const res = await fetch(`/api/admin/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_request",
          notes: rejectReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);

      addToast({ title: "Request Rejected", type: "success" });
      setIsRejectModalOpen(false);
      setRejectReason("");
      await handleOpenInspector(activeRequest);
      fetchRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject.";
      addToast({ title: "Error", description: msg, type: "error" });
    }
  };

  // Handle Request Clarification
  const handleClarify = async () => {
    if (!activeRequest || !clarifyText.trim()) {
      addToast({ title: "Note Required", description: "Please specify clarification note.", type: "error" });
      return;
    }

    try {
      const res = await fetch(`/api/admin/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_clarification",
          notes: clarifyText,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);

      addToast({ title: "Clarification Sent", type: "success" });
      setIsClarifyModalOpen(false);
      setClarifyText("");
      await handleOpenInspector(activeRequest);
      fetchRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clarify.";
      addToast({ title: "Error", description: msg, type: "error" });
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Cake className="w-7 h-7 text-rose-600" />
            <span>Custom Cake Requests</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review customer bespoke cake design requests, inspect reference images, and forward to certified bakery partners.
          </p>
        </div>

        <Button
          onClick={() => fetchRequests()}
          variant="outline"
          className="text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedStatus(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                selectedStatus === f.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search request #, customer, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchRequests()}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16">
            <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading custom cake requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Cake className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No custom cake requests found.</p>
            <p className="text-xs text-slate-400 mt-1">Submitted customer requests will appear here for forwarding.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Request #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Type &amp; Flavor</th>
                  <th className="py-3 px-4">Weight</th>
                  <th className="py-3 px-4">Budget Up To</th>
                  <th className="py-3 px-4">Delivery Date</th>
                  <th className="py-3 px-4">Assigned Bakery</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {requests.map((r) => {
                  return (
                    <tr
                      key={r.id}
                      onClick={() => handleOpenInspector(r)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        #{r.request_number || r.id.slice(0, 8)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{r.contact_name}</div>
                        <div className="text-[11px] text-slate-400">{r.contact_phone}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800">{r.cake_type}</span>
                        <span className="text-slate-400 block text-[11px]">{r.flavor}</span>
                      </td>
                      <td className="py-3.5 px-4 font-bold">{r.weight}</td>
                      <td className="py-3.5 px-4 font-extrabold text-slate-900">
                        {formatCurrency(r.budget_max)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div>{r.preferred_delivery_date}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                          {r.preferred_delivery_time}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {r.seller_profiles?.business_name ? (
                          <div className="flex items-center gap-1.5 font-bold text-indigo-700">
                            <Store className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{r.seller_profiles.business_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold border bg-slate-100 text-slate-800 border-slate-200">
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenInspector(r);
                          }}
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors"
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAILED INSPECTOR MODAL */}
      {activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Custom Cake Request #{activeRequest.request_number || activeRequest.id.slice(0, 8)}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                    {activeRequest.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submitted {formatExactDateTime(activeRequest.created_at)}
                </p>
              </div>

              <button
                onClick={() => setActiveRequest(null)}
                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Row */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                onClick={() => setIsForwardModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <Store className="w-4 h-4" />
                <span>{activeRequest.assigned_seller_id ? "Change Seller" : "Forward to Seller"}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setIsClarifyModalOpen(true)}
                className="text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Request Clarification</span>
              </Button>

              {activeRequest.status !== "REJECTED" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRejectModalOpen(true)}
                  className="text-xs font-bold px-4 py-2 rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Request</span>
                </Button>
              )}
            </div>

            {/* Specifications Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-slate-400 block text-[11px]">Cake Type</span>
                <span className="font-bold text-slate-900">{activeRequest.cake_type}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-slate-400 block text-[11px]">Flavor</span>
                <span className="font-bold text-slate-900">{activeRequest.flavor}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-slate-400 block text-[11px]">Weight</span>
                <span className="font-bold text-slate-900">{activeRequest.weight}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-slate-400 block text-[11px]">Customer Budget</span>
                <span className="font-bold text-slate-900">{formatCurrency(activeRequest.budget_max)}</span>
              </div>
            </div>

            {/* Inscription & Design */}
            <div className="space-y-3 text-xs">
              {activeRequest.message_on_cake && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-900 border border-rose-100">
                  <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                    Inscription on Cake:
                  </span>
                  <p className="font-extrabold text-sm">&ldquo;{activeRequest.message_on_cake}&rdquo;</p>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-1">
                  Design &amp; Theme Description:
                </span>
                <p className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-line">
                  {activeRequest.theme_description}
                </p>
              </div>

              {activeRequest.dietary_notes && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-0.5">
                    Dietary Preference:
                  </span>
                  <p className="font-semibold text-slate-700">{activeRequest.dietary_notes}</p>
                </div>
              )}
            </div>

            {/* Reference Images with Signed URLs */}
            {activeRequest.signed_reference_images && activeRequest.signed_reference_images.length > 0 && (
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-2">
                  Customer Reference Images ({activeRequest.signed_reference_images.length})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {activeRequest.signed_reference_images.map((img, idx) => (
                    <a
                      key={idx}
                      href={img.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 block shadow-xs"
                    >
                      <Image
                        src={img.signedUrl}
                        alt={`Ref ${idx + 1}`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-bold">
                        Inspect Image
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery & Contact */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block">
                Delivery &amp; Customer Information:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Recipient:</span>{" "}
                  <span className="font-bold text-slate-800">
                    {activeRequest.contact_name} ({activeRequest.contact_phone})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Delivery Window:</span>{" "}
                  <span className="font-bold text-slate-800">
                    {activeRequest.preferred_delivery_date} ({activeRequest.preferred_delivery_time})
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-400">Address:</span>{" "}
                  <span className="font-bold text-slate-800">
                    {activeRequest.delivery_address?.address_line1}, {activeRequest.delivery_address?.city},{" "}
                    {activeRequest.delivery_address?.state} — {activeRequest.delivery_address?.postal_code}
                  </span>
                </div>
              </div>
            </div>

            {/* Seller Quote if Present */}
            {activeRequest.seller_quote && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-1.5">
                <span className="font-bold text-emerald-800 uppercase text-[10px] tracking-wider block">
                  Bakery Partner Quote:
                </span>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Base Cake Price:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.cake_price)}</span>
                </div>
                {activeRequest.seller_quote.customization_charge > 0 && (
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Customization Charge:</span>
                    <span>{formatCurrency(activeRequest.seller_quote.customization_charge)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Delivery Charge:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.delivery_charge)}</span>
                </div>
                <div className="pt-2 border-t border-emerald-200 flex justify-between font-extrabold text-sm text-emerald-800">
                  <span>Final Quoted Amount:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.final_amount)}</span>
                </div>
              </div>
            )}

            {/* Activity & Audit Trail (Section M) */}
            <div className="pt-2 border-t border-slate-100">
              <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-2">
                Activity &amp; Audit Trail
              </span>
              {isLoadingDetails ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading audit history...
                </div>
              ) : activeActivityLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No activity logs recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {(activeActivityLogs as Array<{ action: string; notes?: string; performed_by_role?: string; created_at: string }>).map((log, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800">{log.action}</span>
                        {log.notes && <span className="text-slate-500 block text-[11px]">{log.notes}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">{log.performed_by_role}</span>
                        <span className="text-slate-400 text-[10px]">{formatExactDateTime(log.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FORWARD TO SELLER MODAL (RULE P: APPROVED SELLERS ONLY) */}
      {isForwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Store className="w-5 h-5 text-blue-600" />
              <span>Forward Request to Approved Seller</span>
            </div>
            <p className="text-xs text-slate-500">
              Only verified and approved bakery merchants are eligible for custom cake assignments.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Select Approved Bakery Merchant
              </label>
              <select
                value={selectedSellerId}
                onChange={(e) => setSelectedSellerId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">-- Choose Approved Seller --</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.business_name} {s.store?.name ? `(${s.store.name})` : ""} — {s.verification_status}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsForwardModalOpen(false)}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmittingForward || !selectedSellerId}
                onClick={handleForwardToSeller}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
              >
                {isSubmittingForward ? <Loader2 className="w-4 h-4 animate-spin" /> : "Forward Request"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Reject Custom Cake Request</h3>
            <textarea
              rows={3}
              placeholder="State reason for rejection (e.g. date unavailable, unable to fulfill theme)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRejectModalOpen(false)} className="text-xs font-bold">
                Cancel
              </Button>
              <Button type="button" onClick={handleReject} className="bg-rose-600 text-white text-xs font-bold">
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CLARIFY MODAL */}
      {isClarifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Request Clarification from Customer</h3>
            <textarea
              rows={3}
              placeholder="What details are needed from the customer?..."
              value={clarifyText}
              onChange={(e) => setClarifyText(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsClarifyModalOpen(false)} className="text-xs font-bold">
                Cancel
              </Button>
              <Button type="button" onClick={handleClarify} className="bg-blue-600 text-white text-xs font-bold">
                Send Note
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
