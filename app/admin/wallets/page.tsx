"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  Search,
  User,
  Store,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronRight,
  X,
  CreditCard,
  DollarSign,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface RecipientSearchResult {
  id: string;
  customerIdCode?: string | null;
  recipientType: "customer" | "seller";
  displayName: string;
  secondaryInfo: string;
  email: string | null;
  phone: string | null;
  currentBalance: number;
  currency: string;
}

interface RecentAdjustment {
  id: string;
  walletId: string;
  recipientId: string;
  recipientType: "customer" | "seller";
  recipientName: string;
  recipientEmail?: string | null;
  amount: number;
  direction: "credit" | "debit";
  balanceAfter: number;
  description: string;
  idempotencyKey?: string | null;
  createdAt: string;
  referenceId: string;
}

export default function AdminWalletManagementPage() {
  const { addToast } = useToast();

  // Tab: Customer vs Seller
  const [recipientType, setRecipientType] = useState<"customer" | "seller">("customer");

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RecipientSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected Recipient
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientSearchResult | null>(null);

  // Form State
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  // Transaction Result State
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    transactionId: string;
    recipientName: string;
    recipientType: string;
    amount: number;
    previousBalance: number;
    newBalance: number;
    isDuplicate: boolean;
    timestamp: string;
  } | null>(null);

  // Recent Adjustments
  const [recentTxs, setRecentTxs] = useState<RecentAdjustment[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Load Recent Transactions
  const loadRecentTransactions = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const res = await fetch("/api/admin/wallets/credit");
      const data = await res.json();
      if (data.success && Array.isArray(data.transactions)) {
        setRecentTxs(data.transactions);
      }
    } catch (err) {
      console.error("Failed to load recent adjustments:", err);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecentTransactions();
  }, [loadRecentTransactions]);

  // Handle Search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setHasSearched(true);
    setFormError(null);
    try {
      const params = new URLSearchParams();
      params.set("type", recipientType);
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      const res = await fetch(`/api/admin/wallets/search?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
      } else {
        setSearchResults([]);
        if (data.message) {
          addToast({ title: "Search Error", description: data.message, type: "error" });
        }
      }
    } catch {
      setSearchResults([]);
      addToast({ title: "Network Error", description: "Failed to search recipients.", type: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  // Reset recipient when type changes
  const handleTypeChange = (newType: "customer" | "seller") => {
    setRecipientType(newType);
    setSelectedRecipient(null);
    setSearchResults([]);
    setHasSearched(false);
    setFormError(null);
    setLastResult(null);
  };

  // Select Recipient
  const handleSelectRecipient = (recipient: RecipientSearchResult) => {
    setSelectedRecipient(recipient);
    setFormError(null);
    setLastResult(null);
  };

  // Open Confirmation
  const handleOpenConfirmation = () => {
    setFormError(null);
    if (!selectedRecipient) {
      setFormError("Please select a verified recipient first.");
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      setFormError("Please enter a valid credit amount greater than ₹0.");
      return;
    }

    if (numAmount > 50000) {
      setFormError("Credit amount exceeds the maximum single adjustment limit of ₹50,000.00.");
      return;
    }

    if (amount.includes(".") && amount.split(".")[1].length > 2) {
      setFormError("Credit amount can have at most 2 decimal places.");
      return;
    }

    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setFormError("Please provide a mandatory audit reason (at least 5 characters).");
      return;
    }

    // Generate unique client idempotency key for this confirmation session
    const idKey = `ADMIN_CREDIT_${selectedRecipient.id}_${Date.now()}`;
    setIdempotencyKey(idKey);
    setIsConfirmModalOpen(true);
  };

  // Execute Credit
  const handleExecuteCredit = async () => {
    if (!selectedRecipient) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/admin/wallets/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: selectedRecipient.recipientType,
          recipientId: selectedRecipient.id,
          amount: Number(amount),
          reason: reason.trim(),
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to credit wallet.");
      }

      setLastResult({
        success: true,
        transactionId: data.transactionId,
        recipientName: data.recipientName || selectedRecipient.displayName,
        recipientType: selectedRecipient.recipientType,
        amount: data.amount,
        previousBalance: data.previousBalance,
        newBalance: data.newBalance,
        isDuplicate: Boolean(data.isDuplicate),
        timestamp: new Date().toISOString(),
      });

      // Update selected recipient's local balance
      setSelectedRecipient((prev) =>
        prev ? { ...prev, currentBalance: data.newBalance } : null
      );

      // Reset input fields
      setAmount("");
      setReason("");
      setIsConfirmModalOpen(false);

      addToast({
        title: data.isDuplicate ? "Adjustment Verified (Duplicate)" : "Wallet Credited Successfully",
        description: `₹${data.amount?.toFixed(2)} credited to ${selectedRecipient.displayName}. New balance: ₹${data.newBalance?.toFixed(2)}`,
        type: "success",
      });

      // Refresh recent adjustments list
      loadRecentTransactions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing wallet credit.";
      setFormError(msg);
      addToast({ title: "Operation Failed", description: msg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Wallet Management</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Issue verified manual wallet credits and audit adjustments for Customers and Sellers.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadRecentTransactions}
            disabled={isLoadingRecent}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecent ? "animate-spin" : ""}`} />
            <span>Refresh Ledger</span>
          </Button>
        </div>
      </div>

      {/* Success Result Banner */}
      {lastResult && (
        <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-emerald-900">
                  {lastResult.isDuplicate ? "Idempotent Transaction Confirmed" : "Manual Wallet Credit Completed"}
                </h3>
                <p className="text-xs text-emerald-800 mt-1">
                  Credited <strong>{formatCurrency(lastResult.amount)}</strong> to{" "}
                  <strong>{lastResult.recipientName}</strong> ({lastResult.recipientType.toUpperCase()}).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-emerald-200/60 text-xs">
                  <div>
                    <span className="text-[11px] text-emerald-700 block">Transaction Reference:</span>
                    <span className="font-mono font-bold text-[11px] text-emerald-950 break-all">
                      {lastResult.transactionId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-700 block">Previous Balance:</span>
                    <span className="font-semibold text-emerald-950">
                      {formatCurrency(lastResult.previousBalance)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-700 block">New Balance:</span>
                    <span className="font-bold text-emerald-950 text-sm">
                      {formatCurrency(lastResult.newBalance)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-700 block">Timestamp:</span>
                    <span className="text-emerald-900 text-[11px]">
                      {formatExactDateTime(lastResult.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setLastResult(null)}
              className="text-emerald-500 hover:text-emerald-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Search & Recipient Selection (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-base text-slate-900">1. Select Recipient</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose recipient category and search by identity credentials.
                </p>
              </div>

              {/* Type Switcher */}
              <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => handleTypeChange("customer")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    recipientType === "customer"
                      ? "bg-white text-indigo-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Customer</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange("seller")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    recipientType === "seller"
                      ? "bg-white text-indigo-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Seller</span>
                </button>
              </div>
            </div>

            {/* Search Input Bar */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    recipientType === "customer"
                      ? "Search customer by name, email, phone, or customer ID..."
                      : "Search seller by business name, contact, email, or seller ID..."
                  }
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              <Button type="submit" disabled={isSearching} className="text-xs h-10 px-4 font-bold shrink-0">
                {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Search"}
              </Button>
            </form>

            {/* Search Results List */}
            <div className="space-y-2.5 pt-2">
              {isSearching ? (
                <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                  <span>Querying persistent database records...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Found {searchResults.length} {recipientType} accounts
                  </p>
                  {searchResults.map((r) => {
                    const isSelected = selectedRecipient?.id === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => handleSelectRecipient(r)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? "bg-indigo-50/60 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs"
                            : "bg-slate-50/50 hover:bg-slate-100/80 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-200/80 text-slate-700"
                            }`}
                          >
                            {r.recipientType === "customer" ? (
                              <User className="w-4 h-4" />
                            ) : (
                              <Store className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-xs text-slate-900 truncate">
                                {r.displayName}
                              </p>
                              {isSelected && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-600 text-white">
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {r.email || r.phone || r.secondaryInfo}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono truncate">
                              ID: {r.id}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Current Balance
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {formatCurrency(r.currentBalance)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : hasSearched ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No matching {recipientType} accounts found.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try searching with another name, email address, phone number, or UUID.
                  </p>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Enter a search term above or click search to view candidate {recipientType} accounts.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Verified Identity & Credit Form (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="pb-4 border-b border-slate-100">
              <h2 className="font-bold text-base text-slate-900">2. Issue Wallet Credit</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify recipient ownership before submitting atomic balance credit.
              </p>
            </div>

            {selectedRecipient ? (
              <div className="space-y-5">
                {/* Verified Recipient Card */}
                <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Verified Recipient Identity</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {selectedRecipient.recipientType}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{selectedRecipient.displayName}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {selectedRecipient.email || selectedRecipient.phone || selectedRecipient.secondaryInfo}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">
                      Account ID: {selectedRecipient.id}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-indigo-200/60 flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium">Verified Current Balance:</span>
                    <span className="font-mono font-black text-sm text-indigo-950">
                      {formatCurrency(selectedRecipient.currentBalance)}
                    </span>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Credit Amount in INR (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="50000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-4 py-2.5 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[50, 100, 250, 500, 1000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(preset.toString())}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      >
                        +₹{preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Mandatory Audit Reason / Note <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide detailed justification (e.g., Replacement price adjustment, Customer goodwill compensation, Seller bonus reward)..."
                    className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Mandatory compliance record. Will appear in recipient&apos;s transaction history.
                  </p>
                </div>

                {/* Form Error Banner */}
                {formError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="button"
                  onClick={handleOpenConfirmation}
                  className="w-full text-xs font-bold h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
                >
                  Review &amp; Credit Wallet
                </Button>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-medium text-slate-600">No recipient currently selected.</p>
                <p className="text-[11px] text-slate-400">
                  Search and pick a verified recipient on the left to activate credit options.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && selectedRecipient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Confirm Wallet Credit</h3>
                  <p className="text-xs text-slate-500">
                    Please review transaction specifications before confirming.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Recipient Details Table */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Name:</span>
                  <span className="font-bold text-slate-900">{selectedRecipient.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Type:</span>
                  <span className="font-semibold uppercase text-slate-800">
                    {selectedRecipient.recipientType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Account ID:</span>
                  <span className="font-mono text-[11px] text-slate-700">{selectedRecipient.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Balance:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatCurrency(selectedRecipient.currentBalance)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-emerald-700">
                  <span>Adjustment Amount to Credit:</span>
                  <span className="text-sm font-mono">+ {formatCurrency(Number(amount))}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 text-sm pt-1">
                  <span>Projected New Balance:</span>
                  <span className="font-mono text-indigo-700">
                    {formatCurrency(selectedRecipient.currentBalance + Number(amount))}
                  </span>
                </div>
              </div>

              {/* Reason Box */}
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-900 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                  Mandatory Audit Justification
                </span>
                <p className="text-xs">&quot;{reason.trim()}&quot;</p>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-900 text-[11px] flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
                <span>
                  This operation writes an atomic ledger record with an immutable idempotency key. Balance
                  updates will be immediately available in the recipient&apos;s account.
                </span>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="text-xs h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteCredit}
                disabled={isSubmitting}
                className="text-xs font-bold h-9 px-5 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Credit...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Credit Wallet</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log / Recent Manual Adjustments Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div>
            <h2 className="font-bold text-base text-slate-900">Recent Admin Manual Adjustments</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Persistent immutable wallet audit ledger records created by administrative staff.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-700">
            {recentTxs.length} logged
          </span>
        </div>

        {recentTxs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Recipient</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5 text-right">Credit Amount</th>
                  <th className="px-6 py-3.5 text-right">Balance After</th>
                  <th className="px-6 py-3.5">Audit Reason</th>
                  <th className="px-6 py-3.5">Reference ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-500">
                      {formatExactDateTime(tx.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{tx.recipientName}</p>
                      <p className="text-[11px] text-slate-500">{tx.recipientEmail || tx.recipientId}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          tx.recipientType === "seller"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {tx.recipientType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-700">
                      +{formatCurrency(tx.amount)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(tx.balanceAfter)}
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-slate-600" title={tx.description}>
                      {tx.description}
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400">
                      {tx.id.slice(0, 8)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            No admin manual adjustments recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
