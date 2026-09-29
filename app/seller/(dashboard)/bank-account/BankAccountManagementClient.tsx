"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Landmark,
  AlertCircle,
  Clock,
  Plus,
  CheckCircle2,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  QrCode,
  Upload,
  Trash2,
  Check,
  Star,
  Copy,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";

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

  // Primary switching state
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);

  // Secure full account number reveal state (in-memory only, wiped on hide or reload)
  const [revealedNumbers, setRevealedNumbers] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  // UPI State
  const [upiId, setUpiId] = useState<string>("");
  const [upiQrUrl, setUpiQrUrl] = useState<string | null>(null);
  const [isEditingUpi, setIsEditingUpi] = useState(false);
  const [tempUpiInput, setTempUpiInput] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [previewQrModal, setPreviewQrModal] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bank Form states
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

  const fetchUpiDetails = async () => {
    try {
      const res = await fetch("/api/seller/payment-details");
      const data = await res.json();
      if (data.success) {
        setUpiId(data.upiId || "");
        setUpiQrUrl(data.upiQrUrl || null);
        setTempUpiInput(data.upiId || "");
      }
    } catch (err) {
      console.error("Error fetching UPI details:", err);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchUpiDetails();
  }, []);

  // Securely toggle full account number visibility
  const handleToggleReveal = async (accountId: string) => {
    if (revealedNumbers[accountId]) {
      setRevealedNumbers((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
      return;
    }

    try {
      setRevealingId(accountId);
      setError(null);
      const res = await fetch("/api/seller/bank-account/reveal", {
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
      setError(err instanceof Error ? err.message : "Error revealing account number.");
    } finally {
      setRevealingId(null);
    }
  };

  // Switch Primary Bank Account
  const handleSetPrimary = async (accountId: string) => {
    try {
      setSettingPrimaryId(accountId);
      setError(null);
      setSuccess(null);

      const res = await fetch("/api/seller/bank-account/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to set primary bank account.");
      }

      // Optimistically update accounts list
      setAccounts((prev) =>
        prev.map((acc) => ({
          ...acc,
          is_primary: acc.id === accountId,
        }))
      );

      setSuccess("Primary payout account updated successfully! All future disbursements will route to this account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error switching primary account.");
    } finally {
      setSettingPrimaryId(null);
    }
  };

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

  const handleSubmitBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

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

  // UPI Handlers
  const handleSaveUpiId = async () => {
    const clean = tempUpiInput.trim();
    if (clean && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(clean)) {
      setError("Invalid UPI ID format. Expected: username@bank (e.g. store@okaxis).");
      return;
    }

    try {
      setSavingUpi(true);
      setError(null);
      const res = await fetch("/api/seller/payment-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upiId: clean }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save UPI ID.");
      }

      setUpiId(clean);
      setIsEditingUpi(false);
      setSuccess("UPI ID saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving UPI ID.");
    } finally {
      setSavingUpi(false);
    }
  };

  const handleRemoveUpiId = async () => {
    if (!confirm("Are you sure you want to remove your UPI ID?")) return;
    try {
      setSavingUpi(true);
      setError(null);
      const res = await fetch("/api/seller/payment-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upiId: "" }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to remove UPI ID.");
      }

      setUpiId("");
      setTempUpiInput("");
      setIsEditingUpi(false);
      setSuccess("UPI ID removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error removing UPI ID.");
    } finally {
      setSavingUpi(false);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please select a valid image file (JPEG, PNG, or WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds 5MB size limit. Please upload a smaller QR image.");
      return;
    }

    try {
      setUploadingQr(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/seller/payment-details/upload-qr", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to upload UPI QR image.");
      }

      setUpiQrUrl(data.qrUrl);
      setSuccess("UPI QR code uploaded and verified successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error uploading UPI QR.");
    } finally {
      setUploadingQr(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveQr = async () => {
    if (!confirm("Are you sure you want to remove your UPI QR code?")) return;
    try {
      setUploadingQr(true);
      setError(null);
      const res = await fetch("/api/seller/payment-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeQr: true }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to remove QR code.");
      }

      setUpiQrUrl(null);
      setSuccess("UPI QR code removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error removing QR.");
    } finally {
      setUploadingQr(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  // Group accounts
  const verifiedAccounts = accounts.filter((a) => a.status === "verified");
  const correctionAccount = accounts.find((a) => a.status === "correction_required");
  const pendingAccounts = accounts.filter((a) => a.status === "pending");
  const archivedOrRejected = accounts.filter((a) => a.status === "rejected" || a.status === "archived");

  return (
    <div className="max-w-4xl mx-auto py-2 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-xs font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
            Settlement &amp; Payout Security
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Payment &amp; Bank Accounts</h1>
          <p className="text-slate-500 text-xs mt-1">
            Manage your payout bank accounts and UPI receiving credentials. Encrypted with AES-256-GCM.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNew}
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Bank Account
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center justify-between animate-in fade-in">
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
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Correction Required Banner */}
      {correctionAccount && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl p-6 shadow-sm">
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
                    Submitted: {new Date(correctionAccount.created_at).toLocaleDateString("en-IN")} • Masked Account: <span className="font-mono font-bold">•••• {correctionAccount.account_number_last4}</span> ({correctionAccount.bank_name}, {correctionAccount.ifsc_code})
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

      {/* SECTION 1: VERIFIED BANK ACCOUNTS */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-blue-600" />
              Verified Bank Accounts ({verifiedAccounts.length})
            </h2>
            <p className="text-xs text-slate-500">
              Approved payout accounts. Only one account can be selected as your active primary destination.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
            <p className="text-xs">Loading verified bank details...</p>
          </div>
        ) : verifiedAccounts.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
            <Landmark className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
            <h3 className="font-bold text-slate-800 text-sm">No Verified Bank Account Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Add a bank account to receive automated payout disbursements. Submitted accounts are verified by compliance administrators.
            </p>
            <button
              onClick={handleOpenNew}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl text-xs inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add Bank Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {verifiedAccounts.map((acc) => {
              const isPrimary = acc.is_primary;
              const isSwitching = settingPrimaryId === acc.id;
              const isRevealed = Boolean(revealedNumbers[acc.id]);
              const isRevealing = revealingId === acc.id;

              return (
                <div
                  key={acc.id}
                  className={`bg-white rounded-2xl p-6 transition-all border relative overflow-hidden ${
                    isPrimary
                      ? "border-2 border-emerald-500 shadow-sm ring-2 ring-emerald-500/10"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Primary Badge or Indicator */}
                  {isPrimary ? (
                    <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-xs">
                      <Star className="w-3 h-3 fill-white" /> Primary Payout Destination
                    </div>
                  ) : (
                    <div className="absolute top-3 right-4">
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(acc.id)}
                        disabled={isSwitching}
                        className="bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 font-bold py-1.5 px-3 rounded-xl text-[11px] flex items-center gap-1.5 transition-colors border border-slate-200 hover:border-blue-600 disabled:opacity-50 cursor-pointer shadow-2xs"
                      >
                        {isSwitching ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" /> Setting...
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3" /> Set as Primary
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isPrimary
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Landmark className="w-6 h-6" />
                    </div>

                    <div className="flex-1 pr-16 sm:pr-24">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{acc.bank_name}</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                          Verified
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{acc.branch_name || "Main Branch"}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Account Holder</span>
                          <p className="text-xs font-semibold text-slate-800 mt-0.5">{acc.account_holder_name}</p>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Account Number</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs font-mono font-bold text-slate-900 tracking-wide flex items-center gap-1.5">
                              <Lock className="w-3 h-3 text-slate-400" />
                              {isRevealed
                                ? revealedNumbers[acc.id]
                                : `•••• •••• •••• ${acc.account_number_last4}`}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleToggleReveal(acc.id)}
                              disabled={isRevealing}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-0.5 disabled:opacity-50"
                              title="Show / Hide Full Account Number (Audit Logged)"
                            >
                              {isRevealing ? (
                                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                              ) : isRevealed ? (
                                <>
                                  <EyeOff className="w-3 h-3" /> Hide
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" /> Reveal
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">IFSC / Type</span>
                          <p className="text-xs font-mono font-semibold text-slate-800 mt-0.5">
                            {acc.ifsc_code} <span className="text-[11px] font-sans text-slate-500">({acc.account_type})</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: PENDING / UNDER REVIEW BANK ACCOUNTS */}
      {pendingAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-600" />
            Accounts Under Compliance Review ({pendingAccounts.length})
          </h3>

          <div className="space-y-3">
            {pendingAccounts.map((acc) => {
              const isRevealed = Boolean(revealedNumbers[acc.id]);
              const isRevealing = revealingId === acc.id;

              return (
                <div key={acc.id} className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 shadow-2xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{acc.bank_name}</h4>
                          <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                            Pending Review
                          </span>
                        </div>
                        <div className="text-xs text-amber-900 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>Holder: <strong>{acc.account_holder_name}</strong></span>
                          <span>•</span>
                          <span className="font-mono">
                            A/C: {isRevealed ? revealedNumbers[acc.id] : `•••• ${acc.account_number_last4}`}
                            <button
                              type="button"
                              onClick={() => handleToggleReveal(acc.id)}
                              disabled={isRevealing}
                              className="text-[10px] font-bold text-blue-700 hover:underline ml-1"
                            >
                              {isRevealing ? "..." : isRevealed ? "Hide" : "Show"}
                            </button>
                          </span>
                          <span>•</span>
                          <span className="font-mono">{acc.ifsc_code} ({acc.account_type})</span>
                        </div>
                        <p className="text-[11px] text-amber-700 mt-1.5">
                          Submitted on {new Date(acc.created_at).toLocaleDateString("en-IN")}. Once approved, this account will be verified and eligible to be set as your primary payout destination.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: UPI & DIGITAL PAYMENT DETAILS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              UPI &amp; Digital Payment Receiving Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Additional settlement options for merchant payouts and disbursements.
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Seller Payout Details
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sub-card: UPI ID */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Virtual Payment Address (VPA)
                </span>
                {upiId && (
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-slate-900">UPI ID</h3>

              {isEditingUpi ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={tempUpiInput}
                    onChange={(e) => setTempUpiInput(e.target.value)}
                    placeholder="e.g. storename@okaxis"
                    className="w-full text-xs font-mono px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveUpiId}
                      disabled={savingUpi}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs disabled:opacity-50"
                    >
                      {savingUpi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Save UPI ID
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempUpiInput(upiId);
                        setIsEditingUpi(false);
                      }}
                      className="px-3 py-1.5 border border-slate-300 bg-white rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : upiId ? (
                <div className="mt-3 bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900 text-sm">{upiId}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(upiId)}
                      title="Copy UPI ID"
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      {copiedUpi ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempUpiInput(upiId);
                        setIsEditingUpi(true);
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline px-2"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveUpiId}
                      disabled={savingUpi}
                      title="Remove UPI ID"
                      className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 p-3 bg-white/70 border border-dashed border-slate-300 rounded-xl text-center">
                  <p className="text-xs text-slate-500 mb-2">No UPI ID currently linked to your store.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setTempUpiInput("");
                      setIsEditingUpi(true);
                    }}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add UPI ID
                  </button>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              Verified payout identity used for instant settlement receipts.
            </div>
          </div>

          {/* Sub-card: UPI QR Code */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Visual Settlement Code
                </span>
                {upiQrUrl && (
                  <span className="text-[10px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                    QR LINKED
                  </span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-slate-900">UPI QR Code</h3>

              <div className="mt-3">
                {upiQrUrl ? (
                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div
                      onClick={() => setPreviewQrModal(upiQrUrl)}
                      className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden cursor-pointer hover:opacity-90 relative flex-shrink-0 group"
                      title="Click to preview full QR"
                    >
                      <img
                        src={upiQrUrl}
                        alt="Seller UPI QR Code"
                        className="w-full h-full object-contain p-1"
                      />
                      <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <ExternalLink className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <p className="text-xs font-bold text-slate-800">Payment QR Uploaded</p>
                      <p className="text-[11px] text-slate-500">
                        Admin verified image on file.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setPreviewQrModal(upiQrUrl)}
                          className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          <Eye className="w-3 h-3" /> Preview
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingQr}
                          className="text-[11px] font-bold text-slate-600 hover:text-slate-900"
                        >
                          Replace
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={handleRemoveQr}
                          disabled={uploadingQr}
                          className="text-[11px] font-bold text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-white/70 border border-dashed border-slate-300 rounded-xl text-center">
                    <QrCode className="w-8 h-8 text-slate-400 mx-auto mb-1.5 opacity-60" />
                    <p className="text-xs text-slate-600 font-semibold mb-1">No QR Code Uploaded</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto mb-3">
                      Upload your bank&apos;s UPI QR code (JPEG, PNG, WebP up to 5MB).
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingQr}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                    >
                      {uploadingQr ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" /> Upload UPI QR Image
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleQrUpload}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              Stored in secure storage with restricted seller access control.
            </div>
          </div>
        </div>

        {/* Informational Callout */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Disbursement Policy:</strong> Payouts and balance withdrawals will be routed to your designated <strong>Primary Bank Account</strong>. Your UPI credentials serve as backup identification for verified settlement audits and direct marketplace admin transfers. UPI details are not directly presented to buyers on standard shopping cart checkouts.
          </span>
        </div>
      </div>

      {/* SECTION 4: HISTORICAL / ARCHIVED / REJECTED ACCOUNTS */}
      {archivedOrRejected.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Account History &amp; Archived Entries ({archivedOrRejected.length})
          </h4>
          <div className="space-y-2">
            {archivedOrRejected.map((acc) => (
              <div
                key={acc.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800">{acc.bank_name}</div>
                  <div className="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1.5 font-mono">
                    <span>•••• {acc.account_number_last4}</span>
                    <span>|</span>
                    <span>{acc.ifsc_code}</span>
                    <span>|</span>
                    <span className="font-sans">{acc.account_holder_name}</span>
                  </div>
                  {acc.rejection_reason && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      Reason: {acc.rejection_reason}
                    </p>
                  )}
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

      {/* Add Bank Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900">
                {isResubmitting ? "Update & Resubmit Bank Account" : "Add Bank Account"}
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
                <strong>Correction Notice:</strong> Submitting will securely encrypt your account number and create a new pending verification request.
              </div>
            ) : (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                <strong>Notice:</strong> You can add multiple bank accounts. Newly submitted accounts require administrator verification before being eligible to be designated as your Primary payout destination.
              </div>
            )}

            <form onSubmit={handleSubmitBank} className="space-y-4">
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

      {/* QR Code Enlarged Preview Modal */}
      {previewQrModal && (
        <div
          onClick={() => setPreviewQrModal(null)}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-extrabold text-slate-900">UPI QR Code Preview</span>
              <button
                type="button"
                onClick={() => setPreviewQrModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <img
                src={previewQrModal}
                alt="Enlarged UPI QR Code"
                className="w-full max-h-72 object-contain mx-auto"
              />
            </div>
            {upiId && (
              <p className="mt-3 text-xs font-mono font-bold text-slate-800">
                UPI ID: {upiId}
              </p>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              Scan with any UPI application (GPay, PhonePe, Paytm, BHIM)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
