"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Percent,
  Receipt,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  TrendingUp,
  Clock,
  History,
  Info,
  DollarSign,
  Plus,
  Minus,
  Sparkles,
  Lock,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { DbFeeRule } from "@/lib/membership";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";

interface AuditLogRow {
  id: string;
  actor_id: string;
  action_type: string;
  target_entity: string;
  target_id: string | null;
  old_values: any;
  new_values: any;
  notes: string | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

interface AdminFinancialSettingsClientProps {
  initialPlans: DbFeeRule[];
  initialAuditLogs: AuditLogRow[];
}

export function AdminFinancialSettingsClient({
  initialPlans,
  initialAuditLogs,
}: AdminFinancialSettingsClientProps) {
  const [plans, setPlans] = useState<DbFeeRule[]>(initialPlans);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>(initialAuditLogs);
  const [activeTab, setActiveTab] = useState<"commissions" | "charges" | "audit">("commissions");

  // Status banners
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Commission Edit Modal State
  const [selectedPlanForComm, setSelectedPlanForComm] = useState<DbFeeRule | null>(null);
  const [newCommissionPct, setNewCommissionPct] = useState<number>(0);
  const [commChangeReason, setCommChangeReason] = useState<string>("");
  const [showCommConfirmModal, setShowCommConfirmModal] = useState(false);

  // Tax & Platform Charges State (applied per plan or globally)
  const [selectedPlanForCharges, setSelectedPlanForCharges] = useState<string>("ALL");
  const [chargesState, setChargesState] = useState({
    gstEnabled: true,
    gstRatePct: 18.0,
    tcsEnabled: true,
    tcsRatePct: 0.5,
    tdsEnabled: true,
    tdsRatePct: 0.1,
    fixedFeeEnabled: false,
    fixedFeeRupees: 0,
    changeReason: "",
  });
  const [showChargesConfirmModal, setShowChargesConfirmModal] = useState(false);

  // Initialize charge state when tab opens
  const activePlanRule = plans[0] || ({} as DbFeeRule);

  // Handle Quick Commission Modal Open
  const handleOpenCommissionModal = (plan: DbFeeRule) => {
    setSelectedPlanForComm(plan);
    setNewCommissionPct(Number((Number(plan.commission_rate || 0) * 100).toFixed(2)));
    setCommChangeReason("");
    setShowCommConfirmModal(false);
    setErrorMsg(null);
  };

  // Quick increment/decrement commission
  const adjustCommission = (delta: number) => {
    setNewCommissionPct((prev) => {
      const updated = Math.min(100, Math.max(0, Number((prev + delta).toFixed(2))));
      return updated;
    });
  };

  // Submit Commission Update
  const handleSaveCommission = async () => {
    if (!selectedPlanForComm) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/membership-plans/${selectedPlanForComm.membership_plan}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionRate: newCommissionPct / 100,
          changeReason: commChangeReason.trim() || `Admin updated ${selectedPlanForComm.membership_plan} commission rate from ${(Number(selectedPlanForComm.commission_rate) * 100).toFixed(1)}% to ${newCommissionPct}%`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update commission rate.");
      }

      // Update local state
      setPlans((prev) =>
        prev.map((p) =>
          p.membership_plan === selectedPlanForComm.membership_plan
            ? { ...p, commission_rate: newCommissionPct / 100, updated_at: new Date().toISOString() }
            : p
        )
      );

      // Prepend audit entry
      setAuditLogs((prev) => [
        {
          id: `local-${Date.now()}`,
          actor_id: "current-admin",
          action_type: "MEMBERSHIP_PLAN_UPDATED",
          target_entity: "marketplace_fee_rules",
          target_id: selectedPlanForComm.id,
          old_values: { commission_rate: selectedPlanForComm.commission_rate },
          new_values: { commission_rate: newCommissionPct / 100 },
          notes: commChangeReason.trim() || `Updated ${selectedPlanForComm.membership_plan} commission rate to ${newCommissionPct}%`,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Admin User", email: "admin@vendosmith.com" },
        },
        ...prev,
      ]);

      setSuccessMsg(
        `Successfully updated ${selectedPlanForComm.membership_plan} commission rate to ${newCommissionPct}%. New orders and estimates will use this rate immediately.`
      );
      setSelectedPlanForComm(null);
      setShowCommConfirmModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Tax & Charges Form Submit
  const handleSaveCharges = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: Record<string, any> = {
        plan: selectedPlanForCharges === "ALL" ? null : selectedPlanForCharges,
        gstEnabled: chargesState.gstEnabled,
        gstRate: chargesState.gstRatePct / 100,
        tcsEnabled: chargesState.tcsEnabled,
        tcsRate: chargesState.tcsRatePct / 100,
        tdsEnabled: chargesState.tdsEnabled,
        tdsRate: chargesState.tdsRatePct / 100,
        fixedPlatformFeePaise: Math.round(chargesState.fixedFeeRupees * 100),
        fixedPlatformFeeEnabled: chargesState.fixedFeeEnabled,
        changeReason: chargesState.changeReason.trim() || `Admin updated tax and platform charges for ${selectedPlanForCharges}`,
      };

      const res = await fetch("/api/admin/finance/charges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update tax and platform charges.");
      }

      // Update local plans state
      setPlans((prev) =>
        prev.map((p) => {
          if (selectedPlanForCharges === "ALL" || p.membership_plan === selectedPlanForCharges) {
            return {
              ...p,
              gst_enabled: chargesState.gstEnabled,
              gst_rate: chargesState.gstRatePct / 100,
              tcs_enabled: chargesState.tcsEnabled,
              tcs_rate: chargesState.tcsRatePct / 100,
              tds_enabled: chargesState.tdsEnabled,
              tds_rate: chargesState.tdsRatePct / 100,
              fixed_platform_fee_paise: Math.round(chargesState.fixedFeeRupees * 100),
              fixed_platform_fee_enabled: chargesState.fixedFeeEnabled,
              updated_at: new Date().toISOString(),
            };
          }
          return p;
        })
      );

      setSuccessMsg(
        `Successfully updated tax and platform charge rules (${selectedPlanForCharges}). Changes are active in the database and applied to all subsequent settlement calculations.`
      );
      setShowChargesConfirmModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while saving charges.");
    } finally {
      setSaving(false);
    }
  };

  // Interactive Simulation for a sample ₹1,000 product
  const simPrice = 1000;
  const simCommRate = selectedPlanForComm ? newCommissionPct / 100 : (activePlanRule.commission_rate || 0.12);
  const simComm = Math.round(simPrice * simCommRate);
  const simGst = chargesState.gstEnabled ? Math.round(simComm * (chargesState.gstRatePct / 100)) : 0;
  const simTcs = chargesState.tcsEnabled ? Math.round(simPrice * (chargesState.tcsRatePct / 100)) : 0;
  const simTds = chargesState.tdsEnabled ? Math.round(simPrice * (chargesState.tdsRatePct / 100)) : 0;
  const simFixed = chargesState.fixedFeeEnabled ? chargesState.fixedFeeRupees : 0;
  const simTotalDeductions = simComm + simGst + simTcs + simTds + simFixed;
  const simNetSeller = Math.max(0, simPrice - simTotalDeductions);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <Settings2 className="w-4 h-4" /> Financial Configuration Hub
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Financial Settings & Platform Charges
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Live authoritative control over membership commission tiers, statutory taxes (GST, TCS, TDS), and platform fee rules. All updates persist directly to PostgreSQL with immutable historical order snapshots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/membership-plans"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-xs"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Plan Features & Limits
          </Link>
          <Link
            href="/admin/finance"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-xs"
          >
            <Receipt className="w-4 h-4 text-emerald-600" /> Payouts Hub
          </Link>
        </div>
      </div>

      {/* Global Alerts */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3 shadow-xs">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">Configuration Updated Successfully</p>
            <p className="text-xs text-emerald-700 mt-0.5">{successMsg}</p>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">Update Failed</p>
            <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 hover:text-red-800 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("commissions")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "commissions"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Percent className="w-4 h-4" /> Membership Commission
        </button>

        <button
          onClick={() => setActiveTab("charges")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "charges"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="w-4 h-4" /> Tax & Platform Charges
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "audit"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <History className="w-4 h-4" /> Audit History ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: MEMBERSHIP COMMISSION MANAGEMENT */}
      {activeTab === "commissions" && (
        <div className="space-y-6">
          <div className="bg-blue-50/60 border border-blue-200/80 p-4 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <strong className="font-bold">Live Database Control:</strong> Increasing or decreasing a plan&apos;s commission percentage instantly updates the authoritative <code className="font-mono bg-blue-100 px-1 py-0.5 rounded">marketplace_fee_rules</code> table in Supabase. Existing sellers on that tier will automatically use the updated rate for all new orders and earnings estimates without needing to re-register or repurchase membership. Historical orders retain their original snapshot rate.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const commPct = Number((Number(plan.commission_rate || 0) * 100).toFixed(2));
              const isBasic = plan.membership_plan === "BASIC";
              const isPro = plan.membership_plan === "PRO";
              const isBusiness = plan.membership_plan === "BUSINESS";

              return (
                <div
                  key={plan.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                          isBasic
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : isPro
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-purple-100 text-purple-800 border-purple-200"
                        }`}
                      >
                        {plan.membership_plan}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {plan.active ? "Active Rule" : "Inactive"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{plan.display_name}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1">{plan.description}</p>
                    </div>

                    {/* Commission Display Box */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                        Platform Commission
                      </span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-extrabold text-slate-900">{commPct}%</span>
                        <span className="text-xs text-slate-500 font-medium">of product sale price</span>
                      </div>
                    </div>

                    {/* Plan Specs */}
                    <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Monthly Price:</span>
                        <span className="font-semibold text-slate-800">
                          {plan.monthly_price > 0 ? `₹${Number(plan.monthly_price).toLocaleString("en-IN")}/mo` : "Free"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Product Limit:</span>
                        <span className="font-semibold text-slate-800">
                          {plan.max_products ? `${plan.max_products} items` : "Unlimited"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Escrow Hold:</span>
                        <span className="font-semibold text-slate-800">{plan.escrow_hold_days || 7} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Updated:</span>
                        <span className="font-semibold text-slate-800">
                          {plan.updated_at ? formatExactDateTime(plan.updated_at) : "System Default"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenCommissionModal(plan)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center justify-center gap-2 transition-all"
                    >
                      <Percent className="w-4 h-4" /> Edit Commission Rate
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: TAX & PLATFORM CHARGES CONTROL */}
      {activeTab === "charges" && (
        <div className="space-y-6">
          <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
            <HelpCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-bold">Statutory & Configurable Platform Deductions:</strong> Each charge below can be independently toggled ON or OFF. When toggled OFF, its applicable deduction is strictly ₹0.00 and displayed as <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">OFF — ₹0.00</code> across Seller previews and backend order settlements. When toggled ON, the configured percentage or fixed fee applies automatically.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Charges Configuration Cards */}
            <div className="lg:col-span-2 space-y-5">
              {/* Charge 1: GST on Commission */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
                      GST
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">GST on Platform Commission</h4>
                      <p className="text-xs text-slate-500">Statutory Goods & Services Tax (default 18.00%)</p>
                    </div>
                  </div>

                  {/* ON/OFF Switch */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {chargesState.gstEnabled ? "STATUS: ON" : "STATUS: OFF"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChargesState((prev) => ({ ...prev, gstEnabled: !prev.gstEnabled }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        chargesState.gstEnabled ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          chargesState.gstEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Applicable Percentage (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={!chargesState.gstEnabled}
                      value={chargesState.gstRatePct}
                      onChange={(e) => setChargesState((prev) => ({ ...prev, gstRatePct: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Calculation Base</label>
                    <div className="p-2 rounded-xl bg-slate-100 text-xs text-slate-700 font-medium">
                      Platform Commission Amount (NOT gross product price)
                    </div>
                  </div>
                </div>
              </div>

              {/* Charge 2: TDS */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 font-bold text-sm">
                      TDS
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Tax Deducted at Source (TDS Section 194-O)</h4>
                      <p className="text-xs text-slate-500">Statutory eCommerce operator TDS (default 0.10%)</p>
                    </div>
                  </div>

                  {/* ON/OFF Switch */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {chargesState.tdsEnabled ? "STATUS: ON" : "STATUS: OFF"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChargesState((prev) => ({ ...prev, tdsEnabled: !prev.tdsEnabled }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        chargesState.tdsEnabled ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          chargesState.tdsEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Applicable Percentage (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={!chargesState.tdsEnabled}
                      value={chargesState.tdsRatePct}
                      onChange={(e) => setChargesState((prev) => ({ ...prev, tdsRatePct: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Calculation Base</label>
                    <div className="p-2 rounded-xl bg-slate-100 text-xs text-slate-700 font-medium">
                      Gross Product Sale Amount
                    </div>
                  </div>
                </div>
              </div>

              {/* Charge 3: GST TCS */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-sm">
                      TCS
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">GST Tax Collected at Source (TCS Section 52)</h4>
                      <p className="text-xs text-slate-500">Statutory eCommerce GST TCS (default 0.50% / 0.5% CGST+SGST or 1% IGST)</p>
                    </div>
                  </div>

                  {/* ON/OFF Switch */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {chargesState.tcsEnabled ? "STATUS: ON" : "STATUS: OFF"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChargesState((prev) => ({ ...prev, tcsEnabled: !prev.tcsEnabled }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        chargesState.tcsEnabled ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          chargesState.tcsEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Applicable Percentage (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={!chargesState.tcsEnabled}
                      value={chargesState.tcsRatePct}
                      onChange={(e) => setChargesState((prev) => ({ ...prev, tcsRatePct: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Calculation Base</label>
                    <div className="p-2 rounded-xl bg-slate-100 text-xs text-slate-700 font-medium">
                      Net Taxable Supplies Turnover
                    </div>
                  </div>
                </div>
              </div>

              {/* Charge 4: Fixed Platform Charge */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm">
                      ₹
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Fixed Platform Charge (Per Item)</h4>
                      <p className="text-xs text-slate-500">Optional fixed fee deducted per settled item</p>
                    </div>
                  </div>

                  {/* ON/OFF Switch */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {chargesState.fixedFeeEnabled ? "STATUS: ON" : "STATUS: OFF"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChargesState((prev) => ({ ...prev, fixedFeeEnabled: !prev.fixedFeeEnabled }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        chargesState.fixedFeeEnabled ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          chargesState.fixedFeeEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Fixed Fee Amount (₹)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      disabled={!chargesState.fixedFeeEnabled}
                      value={chargesState.fixedFeeRupees}
                      onChange={(e) => setChargesState((prev) => ({ ...prev, fixedFeeRupees: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Calculation Base</label>
                    <div className="p-2 rounded-xl bg-slate-100 text-xs text-slate-700 font-medium">
                      Fixed deduction per order item line
                    </div>
                  </div>
                </div>
              </div>

              {/* Target Plan Scope & Change Reason */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Apply Charges To</label>
                    <select
                      value={selectedPlanForCharges}
                      onChange={(e) => setSelectedPlanForCharges(e.target.value)}
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-xl py-2.5 px-3"
                    >
                      <option value="ALL">All Membership Plans (Global Default)</option>
                      <option value="BASIC">BASIC Only</option>
                      <option value="PRO">PRO Only</option>
                      <option value="BUSINESS">BUSINESS Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Reason for Audit Log *</label>
                    <input
                      type="text"
                      placeholder="e.g. Statutory GST rate verification or promotional fee waiver"
                      value={chargesState.changeReason}
                      onChange={(e) => setChargesState((prev) => ({ ...prev, changeReason: e.target.value }))}
                      className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-xl py-2 px-3"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowChargesConfirmModal(true)}
                  disabled={saving}
                  className="w-full py-3 px-5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> Save Tax & Platform Charges Configuration
                </button>
              </div>
            </div>

            {/* Live Interactive Calculation Simulation Preview */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-5 h-fit">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                <Sparkles className="w-4 h-4" /> Live Calculation Simulator
              </div>
              <div>
                <h4 className="text-lg font-extrabold text-white">Settlement Projection</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulated breakdown for a ₹1,000 product with currently configured toggles:
                </p>
              </div>

              <div className="space-y-3 text-xs border-t border-slate-800 pt-4">
                <div className="flex justify-between text-slate-300">
                  <span>Customer Paying Price:</span>
                  <span className="font-mono font-bold text-white">₹{simPrice.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>Platform Commission ({((activePlanRule.commission_rate || 0.12) * 100).toFixed(1)}%):</span>
                  <span className="font-mono text-red-400">-₹{simComm.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>GST on Commission ({chargesState.gstEnabled ? `${chargesState.gstRatePct}%` : "OFF"}):</span>
                  <span className="font-mono text-slate-200">
                    {chargesState.gstEnabled ? `-₹${simGst.toFixed(2)}` : "OFF — ₹0.00"}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>GST TCS ({chargesState.tcsEnabled ? `${chargesState.tcsRatePct}%` : "OFF"}):</span>
                  <span className="font-mono text-slate-200">
                    {chargesState.tcsEnabled ? `-₹${simTcs.toFixed(2)}` : "OFF — ₹0.00"}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>TDS ({chargesState.tdsEnabled ? `${chargesState.tdsRatePct}%` : "OFF"}):</span>
                  <span className="font-mono text-slate-200">
                    {chargesState.tdsEnabled ? `-₹${simTds.toFixed(2)}` : "OFF — ₹0.00"}
                  </span>
                </div>

                {chargesState.fixedFeeEnabled && (
                  <div className="flex justify-between text-slate-300">
                    <span>Fixed Platform Fee:</span>
                    <span className="font-mono text-red-400">-₹{simFixed.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-3 flex justify-between text-sm font-bold text-emerald-400">
                  <span>Estimated Seller Payout:</span>
                  <span className="font-mono text-base text-emerald-400">₹{simNetSeller.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-400 leading-relaxed">
                <Lock className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                This mathematical formula matches backend integer paise rounding: <code className="text-slate-300 font-mono">gross - comm - gst - tcs - tds - fixed</code>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT HISTORY LOG */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Financial Audit Logs</h3>
              <p className="text-xs text-slate-500">Immutable ledger of all Admin commission and tax rate modifications</p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200">
              {auditLogs.length} Records Loaded
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Notes / Reason</th>
                    <th className="py-3 px-4">Details Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No financial audit logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono whitespace-nowrap text-slate-500">
                          {formatExactDateTime(log.created_at)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {log.action_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                          {log.profiles?.email || log.profiles?.full_name || log.actor_id}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-xs truncate">
                          {log.notes || "No notes"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-[11px] font-mono text-slate-500 truncate max-w-sm">
                            {log.old_values?.commission_rate !== undefined && log.new_values?.commission_rate !== undefined
                              ? `Commission: ${(log.old_values.commission_rate * 100).toFixed(1)}% -> ${(log.new_values.commission_rate * 100).toFixed(1)}%`
                              : JSON.stringify(log.new_values || {})}
                          </div>
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

      {/* MODAL 1: EDIT COMMISSION WITH DIFF & CONFIRMATION */}
      {selectedPlanForComm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Update Commission: {selectedPlanForComm.membership_plan}
                </h3>
                <p className="text-xs text-slate-500">
                  Current rate: {(Number(selectedPlanForComm.commission_rate || 0) * 100).toFixed(2)}%
                </p>
              </div>
              <button
                onClick={() => setSelectedPlanForComm(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Quick Adjustment Controls */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-700 block">
                New Commission Percentage (%)
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => adjustCommission(-0.5)}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-sm"
                  title="Decrease by 0.5%"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={newCommissionPct}
                    onChange={(e) => setNewCommissionPct(parseFloat(e.target.value) || 0)}
                    className="w-full text-center text-2xl font-extrabold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl py-2 px-3"
                  />
                  <span className="absolute right-3 top-3 text-slate-400 font-bold text-sm">%</span>
                </div>

                <button
                  type="button"
                  onClick={() => adjustCommission(0.5)}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-sm"
                  title="Increase by 0.5%"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2 pt-1">
                {[5, 6, 7, 8, 10, 12].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewCommissionPct(preset)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all ${
                      newCommissionPct === preset
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {/* Change Diff Preview */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-700 block">Rate Modification Diff:</span>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">
                  Previous: {(Number(selectedPlanForComm.commission_rate || 0) * 100).toFixed(2)}%
                </span>
                <ArrowRight className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-blue-700 text-sm">New: {newCommissionPct}%</span>
              </div>
            </div>

            {/* Change Reason Input */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Reason for Change (Audit Log Note) *
              </label>
              <input
                type="text"
                placeholder="e.g. Q4 promotional incentive or seasonal platform adjustment"
                value={commChangeReason}
                onChange={(e) => setCommChangeReason(e.target.value)}
                className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-xl py-2 px-3"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedPlanForComm(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveCommission}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? "Saving to Database..." : "Confirm & Save Live Rate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM TAX & CHARGES UPDATE */}
      {showChargesConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Confirm Tax & Charge Updates</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              You are updating statutory/platform charges for <strong className="text-slate-900 font-bold">{selectedPlanForCharges}</strong> plans.
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono text-slate-700">
              <div>GST on Commission: {chargesState.gstEnabled ? `${chargesState.gstRatePct}%` : "OFF (₹0.00)"}</div>
              <div>TDS: {chargesState.tdsEnabled ? `${chargesState.tdsRatePct}%` : "OFF (₹0.00)"}</div>
              <div>GST TCS: {chargesState.tcsEnabled ? `${chargesState.tcsRatePct}%` : "OFF (₹0.00)"}</div>
              <div>Fixed Platform Fee: {chargesState.fixedFeeEnabled ? `₹${chargesState.fixedFeeRupees}` : "OFF (₹0.00)"}</div>
            </div>

            <p className="text-[11px] text-slate-500 leading-normal">
              This action writes to the authoritative database immediately and records an immutable audit log entry.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowChargesConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveCharges}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Confirm & Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
