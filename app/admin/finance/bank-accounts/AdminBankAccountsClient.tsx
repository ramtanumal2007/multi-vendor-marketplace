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
  EyeOff,
  Check, 
  X, 
  Loader2, 
  Lock, 
  Building2, 
  AlertTriangle,
  RotateCcw,
  ArrowUpDown,
  Pencil,
  ShieldAlert,
  Info,
  QrCode,
  ExternalLink
} from "lucide-react";

export interface AdminBankAccountItem {
  id: string;
  seller_id: string;
  seller_business_name: string;
  seller_contact_name: string;
  seller_email: string;
  seller_upi_id?: string | null;
  seller_upi_qr_url?: string | null;
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

  // Secure full account number reveal state (never persistent, wiped on hide or reload)
  const [revealedNumbers, setRevealedNumbers] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [previewQrUrl, setPreviewQrUrl] = useState<string | null>(null);

  // Modals state
  const [selectedAccount, setSelectedAccount] = useState<AdminBankAccountItem | null>(null);
  const [actionType, setActionType] = useState<"VIEW" | "APPROVE" | "CORRECTION" | "REJECT" | "EDIT" | null>(null);
  const [reason, setReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [presetReason, setPresetReason] = useState(PRESET_CORRECTION_REASONS[0]);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit form state
  const [editHolderName, setEditHolderName] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editBranchName, setEditBranchName] = useState("");
  const [editIfsc, setEditIfsc] = useState("");
  const [editAccountType, setEditAccountType] = useState<"SAVINGS" | "CURRENT">("CURRENT");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editConfirmAccountNumber, setEditConfirmAccountNumber] = useState("");
  const [editAdminNote, setEditAdminNote] = useState("");
  const [showEditVerifiedConfirm, setShowEditVerifiedConfirm] = useState(false);

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

  // Secure reveal full account number
  const handleToggleReveal = async (accountId: string) => {
    if (revealedNumbers[accountId]) {
      // Hide
      setRevealedNumbers((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
      return;
    }

    try {
      setRevealingId(accountId);
      setErrorMsg(null);

      const res = await fetch("/api/admin/bank-accounts/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to reveal full account number.");
      }

      setRevealedNumbers((prev) => ({
        ...prev,
        [accountId]: data.fullAccountNumber,
      }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error revealing account number.");
    } finally {
      setRevealingId(null);
    }
  };

  const handleOpenAction = (
    account: AdminBankAccountItem,
    action: "VIEW" | "APPROVE" | "CORRECTION" | "REJECT" | "EDIT"
  ) => {
    setSelectedAccount(account);
    setActionType(action);
    setReason("");
    setAdminNote(account.admin_notes || "");
    setErrorMsg(null);
    setShowEditVerifiedConfirm(false);

    if (action === "CORRECTION") {
      setPresetReason(PRESET_CORRECTION_REASONS[0]);
      setReason(PRESET_CORRECTION_REASONS[0]);
    } else if (action === "REJECT") {
      setReason("Verification failed due to invalid bank details or failed compliance check.");
    } else if (action === "EDIT") {
      setEditHolderName(account.account_holder_name);
      setEditBankName(account.bank_name);
      setEditBranchName(account.branch_name || "");
      setEditIfsc(account.ifsc_code);
      setEditAccountType(account.account_type);
      setEditAccountNumber("");
      setEditConfirmAccountNumber("");
      setEditAdminNote(account.admin_notes || "");
    }
  };

  // Verify / Correction / Reject Execution
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

      setSuccessMsg(
        `Bank account (${selectedAccount.bank_name} ••••${selectedAccount.account_number_last4}) ${actionType.toLowerCase()}d successfully.`
      );
      setActionType(null);
      setSelectedAccount(null);
      await fetchUpdatedAccounts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error processing action.");
    } finally {
      setProcessing(false);
    }
  };

  // Edit Bank Details Execution
  const handleExecuteEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setErrorMsg(null);

    // Validation
    const cleanIfsc = editIfsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setErrorMsg("Invalid IFSC format. Expected 11 characters (5th character must be zero).");
      return;
    }

    if (editAccountNumber.trim()) {
      const cleanAcc = editAccountNumber.replace(/[^0-9]/g, "");
      const cleanConfirm = editConfirmAccountNumber.replace(/[^0-9]/g, "");

      if (cleanAcc.length < 9 || cleanAcc.length > 18) {
        setErrorMsg("Bank account number must be between 9 and 18 digits.");
        return;
      }

      if (cleanAcc !== cleanConfirm) {
        setErrorMsg("Entered account numbers do not match. Please verify carefully.");
        return;
      }
    }

    // Critical security confirmation if editing a VERIFIED account
    if (selectedAccount.status === "verified" && !showEditVerifiedConfirm) {
      setShowEditVerifiedConfirm(true);
      return;
    }

    setProcessing(true);

    try {
      const res = await fetch("/api/admin/bank-accounts/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          accountHolderName: editHolderName.trim(),
          bankName: editBankName.trim(),
          branchName: editBranchName.trim(),
          ifscCode: cleanIfsc,
          accountType: editAccountType,
          accountNumber: editAccountNumber.trim() ? editAccountNumber.replace(/[^0-9]/g, "") : null,
          adminNote: editAdminNote.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update bank details.");
      }

      setSuccessMsg(data.message || "Bank details updated successfully.");
      setActionType(null);
      setSelectedAccount(null);
      setShowEditVerifiedConfirm(false);
      await fetchUpdatedAccounts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error editing bank details.");
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
              <Landmark className="w-3.5 h-3.5" /> Finance &amp; Compliance Center
            </span>
            <span className="text-xs font-semibold text-slate-500">AES-256-GCM Secured</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-2">Seller Bank Accounts Management</h1>
          <p className="text-slate-500 text-xs mt-1 max-w-2xl">
            Review, verify, edit, return for correction, or reject seller payout bank destinations. 
            All modifications and reveal actions are protected with AES-256-GCM and logged in compliance audit records.
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
                    <th className="py-3 px-4">Account Number</th>
                    <th className="py-3 px-4">IFSC / Type</th>
                    <th className="py-3 px-4">Submitted Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((acc) => {
                    const isRevealed = Boolean(revealedNumbers[acc.id]);
                    const isRevealing = revealingId === acc.id;

                    return (
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

                        {/* Account Number with Secure Reveal Toggle */}
                        <td className="py-3.5 px-4">
                          {isRevealed ? (
                            <div className="flex items-center gap-1.5 bg-blue-50 text-blue-900 px-2 py-1 rounded-lg border border-blue-200 w-fit font-mono font-bold text-xs">
                              <Lock className="w-3 h-3 text-blue-600 flex-shrink-0" />
                              <span>{revealedNumbers[acc.id]}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleReveal(acc.id)}
                                className="ml-1 text-[10px] font-bold text-blue-700 hover:text-blue-900 uppercase flex items-center gap-0.5"
                                title="Hide account number"
                              >
                                <EyeOff className="w-3 h-3" />
                                Hide
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 w-fit font-mono font-bold text-slate-800">
                              <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span>•••• •••• •••• {acc.account_number_last4}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleReveal(acc.id)}
                                disabled={isRevealing}
                                className="ml-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-0.5 disabled:opacity-50"
                                title="Show full account number (Audit Logged)"
                              >
                                {isRevealing ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                                Show
                              </button>
                            </div>
                          )}
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

                        {/* Complete Actions for All Statuses */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Details */}
                            <button
                              type="button"
                              onClick={() => handleOpenAction(acc, "VIEW")}
                              title="View Full Details"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit Bank Details (Available for ALL statuses) */}
                            <button
                              type="button"
                              onClick={() => handleOpenAction(acc, "EDIT")}
                              title="Edit Bank Details"
                              className="p-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Approve (For Pending and Correction Required) */}
                            {(acc.status === "pending" || acc.status === "correction_required") && (
                              <button
                                type="button"
                                onClick={() => handleOpenAction(acc, "APPROVE")}
                                title="Approve & Set as Primary"
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Approve
                              </button>
                            )}

                            {/* Return for Correction (Available for Pending, Correction, Verified, Rejected) */}
                            {acc.status !== "archived" && (
                              <button
                                type="button"
                                onClick={() => handleOpenAction(acc, "CORRECTION")}
                                title={acc.status === "verified" ? "Return Verified Account for Correction" : "Return for Correction"}
                                className="p-1.5 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Reject (Available for Pending, Correction, Verified) */}
                            {acc.status !== "rejected" && acc.status !== "archived" && (
                              <button
                                type="button"
                                onClick={() => handleOpenAction(acc, "REJECT")}
                                title={acc.status === "verified" ? "Reject Verified Account" : "Reject Account"}
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAccounts.map((acc) => {
                const isRevealed = Boolean(revealedNumbers[acc.id]);
                const isRevealing = revealingId === acc.id;

                return (
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
                        {acc.is_primary && " (PRIMARY)"}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Bank:</span>
                        <span className="font-semibold">{acc.bank_name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">A/C:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-slate-900">
                            {isRevealed ? revealedNumbers[acc.id] : `•••• ${acc.account_number_last4}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleReveal(acc.id)}
                            className="text-[10px] font-bold text-blue-600 ml-1 underline"
                          >
                            {isRevealing ? "..." : isRevealed ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">IFSC:</span>
                        <span className="font-mono font-semibold">{acc.ifsc_code} ({acc.account_type})</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Holder:</span>
                        <span className="font-semibold">{acc.account_holder_name}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAction(acc, "VIEW")}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenAction(acc, "EDIT")}
                        className="px-2.5 py-1.5 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 bg-blue-50/50"
                      >
                        Edit
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

                      {acc.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => handleOpenAction(acc, "CORRECTION")}
                          className="px-2.5 py-1.5 border border-orange-200 text-orange-700 rounded-lg text-xs font-bold"
                        >
                          Correction
                        </button>
                      )}

                      {acc.status !== "rejected" && acc.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => handleOpenAction(acc, "REJECT")}
                          className="px-2.5 py-1.5 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal: View Details (with Secure Reveal) */}
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Bank Account Number</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {revealedNumbers[selectedAccount.id] || `•••• •••• •••• ${selectedAccount.account_number_last4}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleReveal(selectedAccount.id)}
                      disabled={revealingId === selectedAccount.id}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 ml-1 underline flex items-center gap-0.5"
                    >
                      {revealingId === selectedAccount.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : revealedNumbers[selectedAccount.id] ? (
                        <>
                          <EyeOff className="w-3 h-3" /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" /> Show Full
                        </>
                      )}
                    </button>
                  </div>
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                  <span className="font-extrabold uppercase text-slate-900">
                    {selectedAccount.status} {selectedAccount.is_primary && "(PRIMARY)"}
                  </span>
                </div>
              </div>

              {/* Seller UPI Receiving Details */}
              <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-indigo-700" />
                  Seller UPI Receiving Details
                </span>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">UPI ID / VPA</span>
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {selectedAccount.seller_upi_id || "Not Provided by Seller"}
                    </span>
                  </div>

                  {selectedAccount.seller_upi_qr_url ? (
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => setPreviewQrUrl(selectedAccount.seller_upi_qr_url || null)}
                        className="w-10 h-10 rounded-lg border border-indigo-200 bg-white p-0.5 overflow-hidden cursor-pointer hover:shadow-xs transition-shadow"
                        title="Click to view full QR Code"
                      >
                        <img
                          src={selectedAccount.seller_upi_qr_url}
                          alt="Seller QR"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewQrUrl(selectedAccount.seller_upi_qr_url || null)}
                        className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" /> View QR Code
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No QR Code Uploaded</span>
                  )}
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

            <div className="flex justify-between items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleOpenAction(selectedAccount, "EDIT")}
                className="px-3.5 py-2 border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Bank Details
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActionType(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

                {(selectedAccount.status === "pending" || selectedAccount.status === "correction_required") && (
                  <button
                    type="button"
                    onClick={() => setActionType("APPROVE")}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Bank Details */}
      {actionType === "EDIT" && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Admin Management
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  Edit Seller Bank Details
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

            {/* Critical Security Warning if account was VERIFIED */}
            {selectedAccount.status === "verified" && (
              <div className="mt-4 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs text-amber-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-extrabold text-amber-900 uppercase text-[11px]">
                  <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  Critical Verification Invalidation Notice
                </div>
                <p className="text-[11px] leading-relaxed text-amber-900">
                  This account is currently <strong>VERIFIED</strong> and active as primary payout destination.
                  Editing any bank details will <strong>immediately invalidate verification</strong>, remove primary designation,
                  and set status to <strong>PENDING</strong> review. Re-approval will be required before payouts resume.
                </p>
              </div>
            )}

            {/* Confirmation Interstitial if user clicked submit on verified account */}
            {showEditVerifiedConfirm ? (
              <div className="my-6 p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl text-xs space-y-3">
                <h4 className="font-extrabold text-rose-950 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  Confirm Verification Reset
                </h4>
                <p className="text-rose-900 leading-relaxed">
                  Are you sure you want to commit these edits? The seller&apos;s verified bank account will be moved to <strong>PENDING</strong> review,
                  and automated disbursements will be paused until re-approved.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditVerifiedConfirm(false)}
                    className="px-3.5 py-2 border border-slate-300 bg-white rounded-xl text-xs font-semibold text-slate-700"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteEdit}
                    disabled={processing}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Confirm &amp; Reset to Pending
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteEdit} className="space-y-4 my-5 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Holder Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editHolderName}
                    onChange={(e) => setEditHolderName(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bank Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      value={editBranchName}
                      onChange={(e) => setEditBranchName(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      IFSC Code *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      value={editIfsc}
                      onChange={(e) => setEditIfsc(e.target.value.toUpperCase())}
                      className="w-full text-xs font-mono uppercase px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Account Type *
                    </label>
                    <select
                      value={editAccountType}
                      onChange={(e) => setEditAccountType(e.target.value as "SAVINGS" | "CURRENT")}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="CURRENT">Current Account</option>
                      <option value="SAVINGS">Savings Account</option>
                    </select>
                  </div>
                </div>

                {/* Account Number Fields */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold uppercase text-slate-700">Account Number Update</span>
                    <span className="text-[10px] text-slate-500">
                      Currently ending in: <strong>••••{selectedAccount.account_number_last4}</strong>
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      New Account Number (Leave empty to keep existing)
                    </label>
                    <input
                      type="password"
                      placeholder="Enter new 9 to 18 digit account number"
                      value={editAccountNumber}
                      onChange={(e) => setEditAccountNumber(e.target.value)}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    />
                  </div>

                  {editAccountNumber.trim().length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Confirm New Account Number *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Re-enter new account number"
                        value={editConfirmAccountNumber}
                        onChange={(e) => setEditConfirmAccountNumber(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Internal Admin Note / Change Reason
                  </label>
                  <input
                    type="text"
                    value={editAdminNote}
                    onChange={(e) => setEditAdminNote(e.target.value)}
                    placeholder="e.g. Corrected IFSC branch spelling per seller request"
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setActionType(null)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processing}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    Save Changes
                  </button>
                </div>
              </form>
            )}
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
                Approving this account verifies <strong>{selectedAccount.bank_name} (••••{selectedAccount.account_number_last4})</strong> for seller <strong>{selectedAccount.seller_business_name}</strong>.
              </p>
              <p className="text-[11px] text-emerald-800">
                If the seller already has an active verified primary account, it will remain primary. If no primary exists yet, this account will serve as the initial primary payout destination. No other accounts are demoted or archived.
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

            {selectedAccount.status === "verified" && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <span>
                  Notice: This account is currently <strong>VERIFIED</strong>. Returning it for correction will remove it from active primary status until corrected and re-verified.
                </span>
              </div>
            )}

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
              {selectedAccount.status === "verified"
                ? "Warning: Rejecting this verified account will immediately terminate its primary payout assignment. Payouts to this bank destination will cease."
                : "Rejecting will preserve this record for compliance audit. Any existing verified primary account for this seller remains untouched."}
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
      {/* Full QR Code Preview Modal */}
      {previewQrUrl && (
        <div
          onClick={() => setPreviewQrUrl(null)}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-extrabold text-slate-900">Seller UPI QR Code Preview</span>
              <button
                type="button"
                onClick={() => setPreviewQrUrl(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <img
                src={previewQrUrl}
                alt="Seller UPI QR Code"
                className="w-full max-h-72 object-contain mx-auto"
              />
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Admin Compliance View • Stored securely in storage bucket
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
