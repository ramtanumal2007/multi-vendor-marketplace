"use client";

import React, { useState, useEffect } from "react";
import { Landmark, AlertCircle, Clock, Plus, CheckCircle2, Loader2, Lock } from "lucide-react";

export interface BankAccountRecord {
  id: string;
  account_holder_name: string;
  bank_name: string;
  branch_name: string;
  ifsc_code: string;
  account_number_last4: string;
  account_type: "SAVINGS" | "CURRENT";
  is_primary: boolean;
  status: "pending" | "verified" | "rejected" | "archived" | "correction_required";
  rejection_reason?: string | null;
  correction_reason?: string | null;
  admin_notes?: string | null;
  verified_at?: string | null;
  created_at: string;
}

export default function BankAccountManagementClient() {
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Form states
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"CURRENT" | "SAVINGS">("CURRENT");

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/seller/bank-account");
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error("Error fetching bank accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleOpenNew = () => {
    setError(null);
    setIsResubmitting(false);
    setAccountHolderName("");
    setBankName("");
    setBranchName("");
    setIfscCode("");
    setAccountNumber("");
    setConfirmAccountNumber("");
    setShowAddModal(true);
  };

  const handleOpenCorrection = (acc: BankAccountRecord) => {
    setError(null);
    setIsResubmitting(true);
    setAccountHolderName(acc.account_holder_name);
    setBankName(acc.bank_name);
    setBranchName(acc.branch_name || "");
    setIfscCode(acc.ifsc_code);
    setAccountType(acc.account_type);
    setAccountNumber("");
    setConfirmAccountNumber("");
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validations
    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setError("Invalid IFSC code format (Expected 11 characters, 5th character must be zero).");
      return;
    }

    const cleanAcc = accountNumber.replace(/[^0-9]/g, "");
    const cleanConfirm = confirmAccountNumber.replace(/[^0-9]/g, "");

    if (cleanAcc.length < 9 || cleanAcc.length > 18) {
      setError("Bank account number must be between 9 and 18 digits.");
      return;
    }

    if (cleanAcc !== cleanConfirm) {
      setError("Account numbers do not match. Please verify carefully.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/seller/bank-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHolderName: accountHolderName.trim(),
          bankName: bankName.trim(),
          branchName: branchName.trim(),
          ifscCode: cleanIfsc,
          accountNumber: cleanAcc,
          accountType,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit bank account.");
      }

      setSuccess("Bank account submitted for verification! Marketplace administrators will review your account.");
      setShowAddModal(false);
      // Reset form
      setAccountHolderName("");
      setBankName("");
      setBranchName("");
      setIfscCode("");
      setAccountNumber("");
      setConfirmAccountNumber("");
      setIsResubmitting(false);
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting bank account.");
    } finally {
      setSubmitting(false);
    }
  };

  const primaryAccount = accounts.find((a) => a.is_primary && a.status === "verified");
  const correctionAccount = accounts.find((a) => a.status === "correction_required");
  const pendingAccount = accounts.find((a) => a.status === "pending");
  const otherAccounts = accounts.filter(
    (a) => a.id !== primaryAccount?.id && a.id !== pendingAccount?.id && a.id !== correctionAccount?.id
  );

  return (
    <div className="max-w-4xl mx-auto py-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <span className="text-xs font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
            Settlement &amp; Payout Security
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Seller Bank Accounts</h1>
          <p className="text-slate-500 text-xs mt-1">
            Manage your verified bank account for marketplace sales earnings and payouts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNew}
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          {primaryAccount ? "Replace Bank Account" : "Add Bank Account"}
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Bank Account Correction Required Banner */}
      {correctionAccount && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-amber-950 text-base">
                    BANK ACCOUNT CORRECTION REQUIRED
                  </h3>
                  <span className="bg-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Action Required
                  </span>
                </div>
                <div className="mt-2 text-xs text-amber-900 space-y-1">
                  <p>
                    <strong>Reason:</strong> {correctionAccount.correction_reason || correctionAccount.rejection_reason || "Details mismatch"}
                  </p>
                  {correctionAccount.admin_notes && (
                    <p>
                      <strong>Admin Note:</strong> {correctionAccount.admin_notes}
                    </p>
                  )}
                  <p className="text-[11px] text-amber-800">
                    Submitted: {new Date(correctionAccount.created_at).toLocaleDateString("en-IN")} • Masked Account: <span className="font-mono font-bold">•••• •••• {correctionAccount.account_number_last4}</span> ({correctionAccount.bank_name}, {correctionAccount.ifsc_code})
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenCorrection(correctionAccount)}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Update &amp; Resubmit
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
          <p className="text-xs">Loading verified bank details...</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Landmark className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">No Bank Account Registered</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
            To receive marketplace payout disbursements once your customer orders are fulfilled, please add a verified bank account.
          </p>
          <button
            onClick={handleOpenNew}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs inline-flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Primary Bank Account
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Primary Account */}
          {primaryAccount && (
            <div className="bg-white border-2 border-emerald-500/40 rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Active Primary Payout Account
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
                  <Landmark className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900">{primaryAccount.bank_name}</h3>
                  <p className="text-xs text-slate-500">{primaryAccount.branch_name || "Main Branch"}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Account Holder</span>
                      <p className="text-xs font-semibold text-slate-800 mt-0.5">{primaryAccount.account_holder_name}</p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Account Number</span>
                      <p className="text-xs font-mono font-bold text-slate-900 mt-0.5 tracking-wide flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-slate-400" />
                        •••• •••• •••• {primaryAccount.account_number_last4}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">IFSC / Type</span>
                      <p className="text-xs font-mono font-semibold text-slate-800 mt-0.5">
                        {primaryAccount.ifsc_code} <span className="text-[11px] font-sans text-slate-500">({primaryAccount.account_type})</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Account Notice */}
          {pendingAccount && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-xs">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">{pendingAccount.bank_name}</h4>
                    <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Under Review
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-1">
                    Submitted on {new Date(pendingAccount.created_at).toLocaleDateString("en-IN")}. 
                    Account Holder: <strong>{pendingAccount.account_holder_name}</strong> | A/C: ••••{pendingAccount.account_number_last4} | IFSC: {pendingAccount.ifsc_code}.
                  </p>
                  <p className="text-[11px] text-amber-700 mt-2">
                    Our compliance team is verifying these bank details. Once verified, this account will automatically become your primary payout account.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Historical / Archived Accounts */}
          {otherAccounts.length > 0 && (
            <div className="mt-8">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Account History</h4>
              <div className="space-y-3">
                {otherAccounts.map((acc) => (
                  <div key={acc.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">{acc.bank_name}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">
                        ••••{acc.account_number_last4} | {acc.ifsc_code} | {acc.account_holder_name}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                        acc.status === "archived"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {acc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Replace Bank Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900">
                {isResubmitting
                  ? "Update & Resubmit Bank Account"
                  : primaryAccount
                  ? "Replace Primary Bank Account"
                  : "Add Bank Account"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {isResubmitting ? (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
                <strong>Correction Notice:</strong> Submitting will securely encrypt your account number and create a new pending verification request. Your previous record will be preserved in account history.
              </div>
            ) : primaryAccount ? (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                <strong>Notice:</strong> Submitting a new account will create a pending verification request. 
                Your existing primary account will remain active for payouts until the new account is verified by administrators.
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Holder Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="As registered with your bank"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MG Road Branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    IFSC Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    placeholder="HDFC0001234"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    className="w-full text-xs font-mono uppercase px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as "CURRENT" | "SAVINGS")}
                    className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="CURRENT">Current Account</option>
                    <option value="SAVINGS">Savings Account</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter 9 to 18 digit account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full text-xs font-mono px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Re-enter bank account number"
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value)}
                  className="w-full text-xs font-mono px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...
                    </>
                  ) : isResubmitting ? (
                    "Resubmit for Verification"
                  ) : (
                    "Submit for Verification"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
