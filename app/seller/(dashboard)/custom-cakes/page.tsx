"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  Cake,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface SellerCustomCakeRequest {
  id: string;
  request_number: string;
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
  signed_reference_images?: { path: string; signedUrl: string }[];
}

export default function SellerCustomCakesPage() {
  const { addToast } = useToast();
  const [requests, setRequests] = useState<SellerCustomCakeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Inspector & Modal States
  const [activeRequest, setActiveRequest] = useState<SellerCustomCakeRequest | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Quote Modal State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [cakePrice, setCakePrice] = useState("");
  const [customizationCharge, setCustomizationCharge] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [sellerNote, setSellerNote] = useState("");
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // Clarify & Decline States
  const [isClarifyModalOpen, setIsClarifyModalOpen] = useState(false);
  const [clarifyNotes, setClarifyNotes] = useState("");
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const fetchSellerRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/seller/custom-cakes");
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    } catch (err) {
      console.error("Failed to load seller custom cakes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSellerRequests();
  }, []);

  const handleOpenInspector = async (req: SellerCustomCakeRequest) => {
    setActiveRequest(req);
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/seller/custom-cakes/${req.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_details" }),
      });
      const data = await res.json();
      if (data.success && data.request) {
        setActiveRequest(data.request);
      }
    } catch (err) {
      console.error("Failed to load details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Accept Request
  const handleAcceptRequest = async () => {
    if (!activeRequest) return;
    try {
      const res = await fetch(`/api/seller/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_request" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);

      addToast({ title: "Request Accepted", description: "You can now submit your quote.", type: "success" });
      await handleOpenInspector(activeRequest);
      fetchSellerRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error accepting request.";
      addToast({ title: "Action Failed", description: msg, type: "error" });
    }
  };

  // Submit Quote (Server-side calculation)
  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequest) return;

    const numBase = Number(cakePrice);
    if (!cakePrice || isNaN(numBase) || numBase <= 0) {
      addToast({ title: "Price Required", description: "Please enter a valid base cake price.", type: "error" });
      return;
    }

    setIsSubmittingQuote(true);
    try {
      const res = await fetch(`/api/seller/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_quote",
          cake_price: numBase,
          customization_charge: Number(customizationCharge || 0),
          delivery_charge: Number(deliveryCharge || 0),
          discount: Number(discount || 0),
          seller_note: sellerNote,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);

      addToast({
        title: "Quote Sent Successfully! 🎂",
        description: `Customer has been notified of quote: ${formatCurrency(data.quote?.final_amount || 0)}.`,
        type: "success",
      });

      setIsQuoteModalOpen(false);
      await handleOpenInspector(activeRequest);
      fetchSellerRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error sending quote.";
      addToast({ title: "Quote Failed", description: msg, type: "error" });
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // Decline Request
  const handleDecline = async () => {
    if (!activeRequest) return;
    try {
      const res = await fetch(`/api/seller/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decline_request",
          notes: declineReason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);

      addToast({ title: "Request Declined", description: "Admin notified to reassign.", type: "success" });
      setIsDeclineModalOpen(false);
      setDeclineReason("");
      await handleOpenInspector(activeRequest);
      fetchSellerRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error declining.";
      addToast({ title: "Decline Failed", description: msg, type: "error" });
    }
  };

  // Request Clarification
  const handleClarify = async () => {
    if (!activeRequest || !clarifyNotes.trim()) {
      addToast({ title: "Note Required", description: "Please enter your question for the customer.", type: "error" });
      return;
    }

    try {
      const res = await fetch(`/api/seller/custom-cakes/${activeRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_clarification",
          notes: clarifyNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);

      addToast({ title: "Question Sent to Customer", type: "success" });
      setIsClarifyModalOpen(false);
      setClarifyNotes("");
      await handleOpenInspector(activeRequest);
      fetchSellerRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send.";
      addToast({ title: "Clarify Failed", description: msg, type: "error" });
    }
  };

  // Live Quote Total Calculation
  const calculatedTotal = Math.max(
    0,
    Number(cakePrice || 0) +
      Number(customizationCharge || 0) +
      Number(deliveryCharge || 0) -
      Number(discount || 0)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Cake className="w-7 h-7 text-rose-600" />
            <span>Custom Cake Requests</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review assigned bespoke cake orders, submit itemized quotations, and communicate with customers.
          </p>
        </div>

        <Button
          onClick={() => fetchSellerRequests()}
          variant="outline"
          className="text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16">
            <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading custom cake requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Cake className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No Custom Cake Requests Assigned Yet</p>
            <p className="text-xs text-slate-400 mt-1">
              When an administrator forwards a customer design request to your bakery, it will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Request #</th>
                  <th className="py-3 px-4">Cake Type &amp; Flavor</th>
                  <th className="py-3 px-4">Weight / Size</th>
                  <th className="py-3 px-4">Customer Budget</th>
                  <th className="py-3 px-4">Delivery Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {requests.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => handleOpenInspector(r)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      #{r.request_number || r.id.slice(0, 8)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900">{r.cake_type}</span>
                      <span className="text-slate-400 block text-[11px]">{r.flavor}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold">{r.weight}</td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">
                      Up to {formatCurrency(r.budget_max)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold">{r.preferred_delivery_date}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[120px]">
                        {r.preferred_delivery_time}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border bg-slate-100 text-slate-800 border-slate-200">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenInspector(r);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] transition-colors"
                      >
                        Inspect &amp; Quote →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INSPECTOR MODAL */}
      {activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            {/* Top Bar */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Request #{activeRequest.request_number || activeRequest.id.slice(0, 8)}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                    {activeRequest.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Requested on {formatExactDateTime(activeRequest.created_at)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isLoadingDetails && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                <button
                  onClick={() => setActiveRequest(null)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* SELLER ACTION BAR */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                onClick={() => {
                  setCakePrice(String(activeRequest.seller_quote?.cake_price || ""));
                  setCustomizationCharge(String(activeRequest.seller_quote?.customization_charge || ""));
                  setDeliveryCharge(String(activeRequest.seller_quote?.delivery_charge || "0"));
                  setDiscount(String(activeRequest.seller_quote?.discount || "0"));
                  setSellerNote(activeRequest.seller_quote?.seller_note || "");
                  setIsQuoteModalOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <Sparkles className="w-4 h-4" />
                <span>{activeRequest.seller_quote ? "Edit / Re-submit Quote" : "Send Quote to Customer"}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setIsClarifyModalOpen(true)}
                className="text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Ask Question</span>
              </Button>

              {activeRequest.status === "FORWARDED_TO_SELLER" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAcceptRequest}
                  className="text-xs font-bold px-4 py-2.5 rounded-xl text-blue-600 border-blue-200 hover:bg-blue-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Accept to Prepare</span>
                </Button>
              )}

              {activeRequest.status !== "DECLINED" && !activeRequest.converted_order_id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeclineModalOpen(true)}
                  className="text-xs font-bold px-4 py-2.5 rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Decline Request</span>
                </Button>
              )}
            </div>

            {/* Cake Specifications */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-slate-400 block text-[11px]">Occasion</span>
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
                <span className="font-extrabold text-emerald-700">
                  Up to {formatCurrency(activeRequest.budget_max)}
                </span>
              </div>
            </div>

            {/* Inscription & Theme Description */}
            <div className="space-y-3 text-xs">
              {activeRequest.message_on_cake && (
                <div className="p-3.5 rounded-xl bg-rose-50 text-rose-900 border border-rose-100">
                  <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                    Customer Inscription / Name:
                  </span>
                  <p className="font-extrabold text-sm">&ldquo;{activeRequest.message_on_cake}&rdquo;</p>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-1">
                  Design Specifications &amp; Requirements:
                </span>
                <p className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-line">
                  {activeRequest.theme_description}
                </p>
              </div>

              {activeRequest.dietary_notes && (
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200">
                  <span className="font-bold block text-[11px]">Dietary Requirement:</span>
                  <span>{activeRequest.dietary_notes}</span>
                </div>
              )}
            </div>

            {/* Reference Images via Private Signed URLs */}
            {activeRequest.signed_reference_images && activeRequest.signed_reference_images.length > 0 && (
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-2">
                  Customer Reference Design Images ({activeRequest.signed_reference_images.length})
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
                        alt={`Ref design ${idx + 1}`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-bold">
                        Inspect
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Date & Location */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-1">
                Fulfillment &amp; Delivery Window:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Target Date:</span>{" "}
                  <span className="font-bold text-slate-800">{activeRequest.preferred_delivery_date}</span>
                </div>
                <div>
                  <span className="text-slate-400">Time Window:</span>{" "}
                  <span className="font-bold text-slate-800">{activeRequest.preferred_delivery_time}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-400">Delivery City / Area:</span>{" "}
                  <span className="font-bold text-slate-800">
                    {activeRequest.delivery_address?.city}, {activeRequest.delivery_address?.state} (
                    {activeRequest.delivery_address?.postal_code})
                  </span>
                </div>
              </div>
            </div>

            {/* Current Active Quote Summary if Quoted */}
            {activeRequest.seller_quote && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-1.5">
                <span className="font-bold text-emerald-800 uppercase text-[10px] tracking-wider block">
                  Current Active Quote:
                </span>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Base Cake Price:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.cake_price)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Customization Charge:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.customization_charge)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Delivery Charge:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.delivery_charge)}</span>
                </div>
                {activeRequest.seller_quote.discount > 0 && (
                  <div className="flex justify-between font-bold text-emerald-700">
                    <span>Discount:</span>
                    <span>-{formatCurrency(activeRequest.seller_quote.discount)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-emerald-200 flex justify-between font-extrabold text-sm text-emerald-800">
                  <span>Final Quoted Total:</span>
                  <span>{formatCurrency(activeRequest.seller_quote.final_amount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SEND QUOTE MODAL (SECTION I: SELLER QUOTE WITH SERVER CALCULATION) */}
      {isQuoteModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>Submit Custom Cake Quote</span>
            </div>
            <p className="text-xs text-slate-500">
              Customer budget is up to {formatCurrency(activeRequest.budget_max)}. Breakdown charges accurately.
            </p>

            <form onSubmit={handleSubmitQuote} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Base Cake Price (₹) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  min="50"
                  step="10"
                  required
                  placeholder="e.g. 800"
                  value={cakePrice}
                  onChange={(e) => setCakePrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Customization &amp; Decor Charge (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="e.g. 200 (fondant, hand sculpting, toppers)"
                  value={customizationCharge}
                  onChange={(e) => setCustomizationCharge(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Delivery Charge (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    placeholder="0"
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Discount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    placeholder="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bakery Note to Customer</label>
                <textarea
                  rows={3}
                  placeholder="e.g. We will use premium Belgian dark chocolate ganache and handcraft the roses..."
                  value={sellerNote}
                  onChange={(e) => setSellerNote(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
                />
              </div>

              {/* Calculated Total Live Preview */}
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-900">Total Payable Amount:</span>
                <span className="text-base font-black text-emerald-700">
                  {formatCurrency(calculatedTotal)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsQuoteModalOpen(false)}
                  className="text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingQuote || calculatedTotal <= 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {isSubmittingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Quote"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLARIFY MODAL */}
      {isClarifyModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Ask Customer for Clarification</h3>
            <textarea
              rows={3}
              placeholder="e.g. Which specific shade of pink would you prefer for the roses?..."
              value={clarifyNotes}
              onChange={(e) => setClarifyNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsClarifyModalOpen(false)} className="text-xs font-bold">
                Cancel
              </Button>
              <Button type="button" onClick={handleClarify} className="bg-blue-600 text-white text-xs font-bold">
                Send Question
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DECLINE MODAL */}
      {isDeclineModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Decline Request</h3>
            <p className="text-xs text-slate-500">
              State why you cannot take this order. The admin will reassign the customer to another bakery.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Kitchen fully booked for this date..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDeclineModalOpen(false)} className="text-xs font-bold">
                Cancel
              </Button>
              <Button type="button" onClick={handleDecline} className="bg-rose-600 text-white text-xs font-bold">
                Confirm Decline
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
