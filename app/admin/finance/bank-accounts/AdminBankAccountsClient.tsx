"use client";

import React, { useState, useMemo } from "react";
import { 
  Landmark, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Eye, 
  Check, 
  X, 
  Loader2, 
  Lock, 
  Building2, 
  AlertTriangle,
  RotateCcw,
  ArrowUpDown
} from "lucide-react";

export interface AdminBankAccountItem {
  id: string;
  seller_id: string;
  seller_business_name: string;
  seller_contact_name: string;
  seller_email: string;
  store_id?: string | null;
  store_name?: string | null;
  store_slug?: string | null;
  account_holder_name: string;
  bank_name: string;
  branch_name?: string | null;
  ifsc_code: string;
  account_number_last4: string;
  account_type: "SAVINGS" | "CURRENT";
  is_primary: boolean;
  status: "pending" | "correction_required" | "verified" | "rejected" | "archived";
  rejection_reason?: string | null;
  correction_reason?: string | null;
  admin_notes?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface AdminBankAccountsClientProps {
  initialAccounts: AdminBankAccountItem[];
  initialMetrics: {
    total: number;
    pending: number;
    correction_required: number;
    verified: number;
    rejected: number;
    archived: number;
  };
}

const PRESET_CORRECTION_REASONS = [
  "Account holder name mismatch with registered seller entity",
  "IFSC code does not match branch or bank name",
  "Bank account details incomplete or illegible",
  "Invalid bank account number length or format",
  "GSTIN / KYC documents mismatch with bank account name",
  "Other (Custom Reason)",
];

export function AdminBankAccountsClient({
  initialAccounts,
  initialMetrics,
}: AdminBankAccountsClientProps) {
  const [accounts, setAccounts] = useState<AdminBankAccountItem[]>(initialAccounts);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  // Modals state
  const [selectedAccount, setSelectedAccount] = useState<AdminBankAccountItem | null>(null);
  const [actionType, setActionType] = useState<"VIEW" | "APPROVE" | "CORRECTION" | "REJECT" | null>(null);
  const [reason, setReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [presetReason, setPresetReason] = useState(PRESET_CORRECTION_REASONS[0]);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchUpdatedAccounts = async () => {
    try {
      const res = await fetch("/api/admin/bank-accounts");
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Error refreshing accounts:", err);
    }
  };

  const handleOpenAction = (account: AdminBankAccountItem, action: "VIEW" | "APPROVE" | "CORRECTION" | "REJECT") => {
    setSelectedAccount(account);
    setActionType(action);
    setReason("");
    setAdminNote(account.admin_notes || "");
    setErrorMsg(null);

    if (action === "CORRECTION") {
      setPresetReason(PRESET_CORRECTION_REASONS[0]);
      setReason(PRESET_CORRECTION_REASONS[0]);
    } else if (action === "REJECT") {
      setReason("Verification failed due to invalid bank details or failed compliance check.");
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedAccount || !actionType) return;
    setErrorMsg(null);
    setProcessing(true);

    try {
      let finalAction = "";
      if (actionType === "APPROVE") finalAction = "APPROVE";
      else if (actionType === "CORRECTION") finalAction = "RETURN_FOR_CORRECTION";
      else if (actionType === "REJECT") finalAction = "REJECT";

      const finalReason = actionType === "CORRECTION"
        ? (presetReason === "Other (Custom Reason)" ? reason.trim() : presetReason)
        : reason.trim();

      if ((actionType === "CORRECTION" || actionType === "REJECT") && !finalReason) {
        setErrorMsg("Please specify a reason for this decision.");
        setProcessing(false);
        return;
      }

      const res = await fetch("/api/admin/bank-accounts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          action: finalAction,
          reason: finalReason || null,
          adminNote: adminNote.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to process bank account action.");
      }

      setSuccessMsg(`Bank account (${selectedAccount.bank_name} ••••${selectedAccount.account_number_last4}) ${actionType.toLowerCase()}d successfully.`);
      setActionType(null);
      setSelectedAccount(null);
      await fetchUpdatedAccounts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error processing action.");
    } finally {
      setProcessing(false);
    }
  };

  // Filtered and sorted accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      // Status Filter
      if (statusFilter !== "ALL" && acc.status !== statusFilter) {
        return false;
      }

      // Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesSeller = acc.seller_business_name?.toLowerCase().includes(q) ||
          acc.seller_contact_name?.toLowerCase().includes(q) ||
          acc.seller_id?.toLowerCase().includes(q);
        const matchesStore = acc.store_name?.toLowerCase().includes(q);
        const matchesBank = acc.bank_name?.toLowerCase().includes(q) ||
          acc.account_holder_name?.toLowerCase().includes(q);
        const matchesIfsc = acc.ifsc_code?.toLowerCase().includes(q);
        const matchesLast4 = acc.account_number_last4?.includes(q);

        if (!matchesSeller && !matchesStore && !matchesBank && !matchesIfsc && !matchesLast4) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortBy === "newest" ? dateB - dateA : dateA - dateB;
    });
  }, [accounts, statusFilter, searchTerm, sortBy]);

  // History for selected seller (for verification context)
  const sellerHistory = useMemo(() => {
    if (!selectedAccount) return [];
    return accounts.filter(
      (a) => a.seller_id === selectedAccount.seller_id && a.id !== selectedAccount.id
    );
  }, [accounts, selectedAccount]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" /> Finance &amp; Compliance
            </span>
            <span className="text-xs font-semibold text-slate-500">AES-256-GCM Secured</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-2">Seller Bank Accounts Verification</h1>
          <p className="text-slate-500 text-xs mt-1 max-w-2xl">
            Review and verify seller payout bank destinations. Approving an account atomically archives previous primary accounts and unlocks automated marketplace payouts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchUpdatedAccounts}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div 
          onClick={() => setStatusFilter("ALL")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "ALL" ? "bg-blue-50/50 border-blue-400 ring-2 ring-blue-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-bold uppercase text-slate-500 block">Total</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{metrics.total}</span>
        </div>

        <div 
          onClick={() => setStatusFilter("pending")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "pending" ? "bg-amber-50/60 border-amber-400 ring-2 ring-amber-500/20" : "bg-white border-slate-200 hover:border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-amber-800">Pending</span>
            {metrics.pending > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </div>
          <span className="text-2xl font-black text-amber-900 mt-1 block">{metrics.pending}</span>
        </div>

        <div 
          onClick={() => setStatusFilter("correction_required")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "correction_required" ? "bg-orange-50/60 border-orange-400 ring-2 ring-orange-500/20" : "bg-white border-slate-200 hover:border-orange-200"
          }`}
        >
          <span className="text-[11px] font-bold uppercase text-orange-800 block">Correction</span>
          <span className="text-2xl font-black text-orange-900 mt-1 block">{metrics.correction_required}</span>
        </div>

        <div 
          onClick={() => setStatusFilter("verified")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "verified" ? "bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-500/20" : "bg-white border-slate-200 hover:border-emerald-200"
          }`}
        >
          <span className="text-[11px] font-bold uppercase text-emerald-800 block">Verified</span>
          <span className="text-2xl font-black text-emerald-900 mt-1 block">{metrics.verified}</span>
        </div>

        <div 
          onClick={() => setStatusFilter("rejected")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "rejected" ? "bg-rose-50/60 border-rose-400 ring-2 ring-rose-500/20" : "bg-white border-slate-200 hover:border-rose-200"
          }`}
        >
          <span className="text-[11px] font-bold uppercase text-rose-800 block">Rejected</span>
          <span className="text-2xl font-black text-rose-900 mt-1 block">{metrics.rejected}</span>
        </div>

        <div 
          onClick={() => setStatusFilter("archived")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "archived" ? "bg-slate-100 border-slate-400 ring-2 ring-slate-400/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-bold uppercase text-slate-500 block">Archived</span>
          <span className="text-2xl font-black text-slate-700 mt-1 block">{metrics.archived}</span>
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search seller, store, IFSC, last 4..."
            className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="correction_required">Correction Required</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
              className="text-xs py-1.5 px-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table (Desktop) / Cards (Mobile) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredAccounts.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Landmark className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="text-sm font-semibold text-slate-600">No bank accounts match your filters</p>
            <p className="text-xs mt-1">Try resetting the status filter or search query.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Seller &amp; Store</th>
                    <th className="py-3 px-4">Account Holder</th>
                    <th className="py-3 px-4">Bank Name</th>
                    <th className="py-3 px-4">Account Last 4</th>
                    <th className="py-3 px-4">IFSC / Type</th>
                    <th className="py-3 px-4">Submitted Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{acc.seller_business_name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{acc.store_name || "Main Store"}</span>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {acc.seller_id.substring(0, 8)}...
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {acc.account_holder_name}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{acc.bank_name}</div>
                        <div className="text-[11px] text-slate-400">{acc.branch_name || "Main Branch"}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 w-fit">
                          <Lock className="w-3 h-3 text-slate-400" />
                          •••• {acc.account_number_last4}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                        <div>{acc.ifsc_code}</div>
                        <div className="text-[10px] text-slate-400 font-sans font-normal uppercase">
                          {acc.account_type}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(acc.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                            acc.status === "verified"
                              ? "bg-emerald-100 text-emerald-800"
                              : acc.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : acc.status === "correction_required"
                              ? "bg-orange-100 text-orange-800"
                              : acc.status === "rejected"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {acc.status === "correction_required" ? "CORRECTION" : acc.status}
                          {acc.is_primary && " (PRIMARY)"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAction(acc, "VIEW")}
                            title="View Full Details"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {(acc.status === "pending" || acc.status === "correction_required") && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenAction(acc, "APPROVE")}
                                title="Approve & Set as Primary"
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Approve
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenAction(acc, "CORRECTION")}
                                title="Return for Correction"
                                className="p-1.5 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenAction(acc, "REJECT")}
                                title="Reject Account"
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAccounts.map((acc) => (
                <div key={acc.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">{acc.seller_business_name}</h4>
                      <p className="text-[11px] text-slate-500">{acc.store_name || "Store"}</p>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        acc.status === "verified"
                          ? "bg-emerald-100 text-emerald-800"
                          : acc.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : acc.status === "correction_required"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {acc.status}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Bank:</span>
                      <span className="font-semibold">{acc.bank_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">A/C:</span>
                      <span className="font-mono font-bold">•••• {acc.account_number_last4}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">IFSC:</span>
                      <span className="font-mono font-semibold">{acc.ifsc_code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Holder:</span>
                      <span className="font-semibold">{acc.account_holder_name}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenAction(acc, "VIEW")}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                    >
                      View Details
                    </button>

                    {(acc.status === "pending" || acc.status === "correction_required") && (
                      <button
                        type="button"
                        onClick={() => handleOpenAction(acc, "APPROVE")}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal: View Details */}
      {actionType === "VIEW" && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Bank Account Compliance Details
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  {selectedAccount.bank_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Seller: <strong>{selectedAccount.seller_business_name}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActionType(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 my-6 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Account Holder</span>
                  <span className="font-semibold text-slate-900 text-sm">{selectedAccount.account_holder_name}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Masked Account</span>
                  <span className="font-mono font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    •••• •••• •••• {selectedAccount.account_number_last4}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">IFSC Code</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedAccount.ifsc_code}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Account Type</span>
                  <span className="font-semibold text-slate-900">{selectedAccount.account_type}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Branch</span>
                  <span className="font-semibold text-slate-900">{selectedAccount.branch_name || "Main Branch"}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Submitted At</span>
                  <span className="text-slate-700">
                    {new Date(selectedAccount.created_at).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* Status & Notes */}
              {selectedAccount.correction_reason && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-900">
                  <strong className="block text-[11px] uppercase">Correction Reason:</strong>
                  <span>{selectedAccount.correction_reason}</span>
                </div>
              )}

              {selectedAccount.rejection_reason && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900">
                  <strong className="block text-[11px] uppercase">Rejection Reason:</strong>
                  <span>{selectedAccount.rejection_reason}</span>
                </div>
              )}

              {selectedAccount.admin_notes && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                  <strong className="block text-[11px] uppercase">Admin Internal Note:</strong>
                  <span>{selectedAccount.admin_notes}</span>
                </div>
              )}

              {/* Seller History */}
              {sellerHistory.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-bold uppercase text-slate-400 block mb-2">
                    Other Accounts for This Seller
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {sellerHistory.map((h) => (
                      <div key={h.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-semibold text-slate-800">{h.bank_name}</span>
                          <span className="text-slate-500 ml-1">••••{h.account_number_last4}</span>
                        </div>
                        <span className="font-bold uppercase text-[9px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {h.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>

              {(selectedAccount.status === "pending" || selectedAccount.status === "correction_required") && (
                <>
                  <button
                    type="button"
                    onClick={() => setActionType("CORRECTION")}
                    className="px-4 py-2 border border-orange-300 text-orange-700 rounded-xl text-xs font-bold hover:bg-orange-50"
                  >
                    Return for Correction
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType("APPROVE")}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve Account */}
      {actionType === "APPROVE" && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Approve Bank Account</h3>
                <p className="text-xs text-slate-500">Atomic verification and primary assignment</p>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-2 mb-4">
              <p>
                Approving this account will set <strong>{selectedAccount.bank_name} (••••{selectedAccount.account_number_last4})</strong> as the <strong>active primary payout account</strong> for seller <strong>{selectedAccount.seller_business_name}</strong>.
              </p>
              <p className="text-[11px] text-emerald-800">
                Any previous verified primary account will be automatically archived. Exactly one verified primary account is enforced.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Optional Admin Note / Compliance Reference
              </label>
              <input
                type="text"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="e.g. Bank proof verified against GSTIN / PAN"
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={processing}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Confirm &amp; Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Return for Correction */}
      {actionType === "CORRECTION" && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Return for Correction</h3>
                <p className="text-xs text-slate-500">Request seller to review and resubmit</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Select or enter the specific reason why this bank submission cannot be verified. The seller will see this guidance on their dashboard.
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Correction Reason Preset *
                </label>
                <select
                  value={presetReason}
                  onChange={(e) => {
                    setPresetReason(e.target.value);
                    if (e.target.value !== "Other (Custom Reason)") {
                      setReason(e.target.value);
                    } else {
                      setReason("");
                    }
                  }}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white font-medium"
                >
                  {PRESET_CORRECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {presetReason === "Other (Custom Reason)" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Correction Reason *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Specify the exact issue for the seller..."
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Internal Note (Optional)
                </label>
                <input
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Internal compliance commentary"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={processing}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                Return for Correction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Account */}
      {actionType === "REJECT" && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Reject Bank Account</h3>
                <p className="text-xs text-slate-500">Record verification failure in audit log</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 mb-4">
              Rejecting will preserve this record for compliance audit. Any existing verified primary account for this seller remains untouched.
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Internal Note (Optional)
                </label>
                <input
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Internal audit reference"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={processing}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
