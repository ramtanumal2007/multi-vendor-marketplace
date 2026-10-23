"use client";

import React, { useState } from "react";
import { 
  ShieldCheck, 
  Crown, 
  Sparkles, 
  Edit3, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  DollarSign, 
  Package, 
  Database, 
  Users, 
  Tag, 
  FileSpreadsheet, 
  TrendingUp, 
  Clock, 
  Lock,
  RotateCcw
} from "lucide-react";
import { AnimatedPerimeterCard, PerimeterTheme } from "@/components/ui/AnimatedPerimeterCard";
import { DbFeeRule } from "@/lib/membership";

interface MembershipPlansAdminClientProps {
  initialPlans: DbFeeRule[];
}

export function MembershipPlansAdminClient({ initialPlans }: MembershipPlansAdminClientProps) {
  const [plans, setPlans] = useState<DbFeeRule[]>(initialPlans);
  const [selectedPlan, setSelectedPlan] = useState<DbFeeRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showConfirmDiff, setShowConfirmDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [formState, setFormState] = useState({
    displayName: "",
    description: "",
    active: true,
    monthlyPrice: 0,
    yearlyPrice: 0,
    maxProducts: "" as string | number, // empty string = unlimited (null)
    storageLimitMB: 500,
    adminUsersLimit: "" as string | number, // empty string = unlimited (null)
    sellerCouponsEnabled: false,
    bulkCsvEnabled: false,
    rankingBoostLevel: "Standard",
    commissionRatePct: 8, // entered as 8.00% -> stored as 0.08
    billingDuration: "Monthly / Yearly",
    gracePeriodDays: 7,
    minPayoutAmount: 1000,
    escrowHoldDays: 7,
    gstRatePct: 18, // 18.00% -> 0.18
    tcsRatePct: 0.5, // 0.50% -> 0.005
    tdsRatePct: 0.1, // 0.10% -> 0.001
    originalMonthlyPrice: "" as string | number,
    offerMonthlyPrice: "" as string | number,
    originalYearlyPrice: "" as string | number,
    offerYearlyPrice: "" as string | number,
    offerEnabled: false,
    offerLabel: "Special Offer",
    offerBadge: "Limited Time",
    offerValidUntil: "",
  });

  const handleOpenEdit = (plan: DbFeeRule) => {
    setSelectedPlan(plan);
    setFormState({
      displayName: plan.display_name || plan.membership_plan,
      description: plan.description || "",
      active: plan.active ?? true,
      monthlyPrice: Number(plan.monthly_price) || 0,
      yearlyPrice: Number(plan.yearly_price) || 0,
      maxProducts: plan.max_products === null || plan.max_products === undefined ? "" : plan.max_products,
      storageLimitMB: Number(plan.storage_limit_mb) || 500,
      adminUsersLimit: plan.admin_users_limit === null || plan.admin_users_limit === undefined ? "" : plan.admin_users_limit,
      sellerCouponsEnabled: Boolean(plan.seller_coupons_enabled),
      bulkCsvEnabled: Boolean(plan.bulk_csv_enabled),
      rankingBoostLevel: plan.ranking_boost_level || "Standard",
      commissionRatePct: Number((Number(plan.commission_rate || 0) * 100).toFixed(2)),
      billingDuration: plan.billing_duration || "Monthly / Yearly",
      gracePeriodDays: Number(plan.grace_period_days) || 7,
      minPayoutAmount: Number(plan.min_payout_amount) || 1000,
      escrowHoldDays: Number(plan.escrow_hold_days) || 7,
      gstRatePct: Number((Number(plan.gst_rate || 0.18) * 100).toFixed(2)),
      tcsRatePct: Number((Number(plan.tcs_rate || 0.005) * 100).toFixed(2)),
      tdsRatePct: Number((Number(plan.tds_rate || 0.001) * 100).toFixed(2)),
      originalMonthlyPrice: plan.original_monthly_price ?? "",
      offerMonthlyPrice: plan.offer_monthly_price ?? "",
      originalYearlyPrice: plan.original_yearly_price ?? "",
      offerYearlyPrice: plan.offer_yearly_price ?? "",
      offerEnabled: Boolean(plan.offer_enabled),
      offerLabel: plan.offer_label || "Special Offer",
      offerBadge: plan.offer_badge || "Limited Time",
      offerValidUntil: plan.offer_valid_until ? plan.offer_valid_until.split("T")[0] : "",
    });
    setShowConfirmDiff(false);
    setErrorMsg(null);
    setIsEditOpen(true);
  };

  const handleResetForm = () => {
    if (selectedPlan) {
      handleOpenEdit(selectedPlan);
    }
  };

  // Detect sensitive financial changes
  const getSensitiveDiffs = () => {
    if (!selectedPlan) return [];
    const diffs: { field: string; oldVal: string; newVal: string }[] = [];

    const oldComm = Number((Number(selectedPlan.commission_rate || 0) * 100).toFixed(2));
    if (oldComm !== Number(formState.commissionRatePct)) {
      diffs.push({ field: "Commission Rate", oldVal: `${oldComm}%`, newVal: `${formState.commissionRatePct}%` });
    }

    const oldMonthly = Number(selectedPlan.monthly_price || 0);
    if (oldMonthly !== Number(formState.monthlyPrice)) {
      diffs.push({ field: "Monthly Price", oldVal: `₹${oldMonthly.toLocaleString("en-IN")}`, newVal: `₹${Number(formState.monthlyPrice).toLocaleString("en-IN")}` });
    }

    const oldYearly = Number(selectedPlan.yearly_price || 0);
    if (oldYearly !== Number(formState.yearlyPrice)) {
      diffs.push({ field: "Yearly Price", oldVal: `₹${oldYearly.toLocaleString("en-IN")}`, newVal: `₹${Number(formState.yearlyPrice).toLocaleString("en-IN")}` });
    }

    const oldMinPayout = Number(selectedPlan.min_payout_amount || 1000);
    if (oldMinPayout !== Number(formState.minPayoutAmount)) {
      diffs.push({ field: "Minimum Payout", oldVal: `₹${oldMinPayout.toLocaleString("en-IN")}`, newVal: `₹${Number(formState.minPayoutAmount).toLocaleString("en-IN")}` });
    }

    const oldEscrow = Number(selectedPlan.escrow_hold_days || 7);
    if (oldEscrow !== Number(formState.escrowHoldDays)) {
      diffs.push({ field: "Escrow Hold", oldVal: `${oldEscrow} days`, newVal: `${formState.escrowHoldDays} days` });
    }

    const oldGst = Number((Number(selectedPlan.gst_rate || 0.18) * 100).toFixed(2));
    if (oldGst !== Number(formState.gstRatePct)) {
      diffs.push({ field: "GST Rate", oldVal: `${oldGst}%`, newVal: `${formState.gstRatePct}%` });
    }

    const oldTcs = Number((Number(selectedPlan.tcs_rate || 0.005) * 100).toFixed(2));
    if (oldTcs !== Number(formState.tcsRatePct)) {
      diffs.push({ field: "TCS Rate", oldVal: `${oldTcs}%`, newVal: `${formState.tcsRatePct}%` });
    }

    const oldTds = Number((Number(selectedPlan.tds_rate || 0.001) * 100).toFixed(2));
    if (oldTds !== Number(formState.tdsRatePct)) {
      diffs.push({ field: "TDS Rate", oldVal: `${oldTds}%`, newVal: `${formState.tdsRatePct}%` });
    }

    return diffs;
  };

  const handlePreSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Form validations
    if (formState.monthlyPrice < 0 || formState.yearlyPrice < 0) {
      setErrorMsg("Plan prices cannot be negative.");
      return;
    }
    if (formState.commissionRatePct < 0 || formState.commissionRatePct > 100) {
      setErrorMsg("Commission rate must be between 0% and 100%.");
      return;
    }
    if (formState.minPayoutAmount < 0 || formState.escrowHoldDays < 0 || formState.gracePeriodDays < 0) {
      setErrorMsg("Payout and grace period values cannot be negative.");
      return;
    }

    const diffs = getSensitiveDiffs();
    if (diffs.length > 0 && !showConfirmDiff) {
      setShowConfirmDiff(true);
      return;
    }

    handleCommitSave();
  };

  const handleCommitSave = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const payload = {
        displayName: formState.displayName.trim(),
        description: formState.description.trim(),
        active: formState.active,
        monthlyPrice: Number(formState.monthlyPrice),
        yearlyPrice: Number(formState.yearlyPrice),
        maxProducts: formState.maxProducts === "" || formState.maxProducts === null ? null : Number(formState.maxProducts),
        storageLimitMB: Number(formState.storageLimitMB),
        adminUsersLimit: formState.adminUsersLimit === "" || formState.adminUsersLimit === null ? null : Number(formState.adminUsersLimit),
        sellerCouponsEnabled: formState.sellerCouponsEnabled,
        bulkCsvEnabled: formState.bulkCsvEnabled,
        rankingBoostLevel: formState.rankingBoostLevel,
        commissionRate: Number((formState.commissionRatePct / 100).toFixed(4)),
        billingDuration: formState.billingDuration.trim(),
        gracePeriodDays: Number(formState.gracePeriodDays),
        minPayoutAmount: Number(formState.minPayoutAmount),
        escrowHoldDays: Number(formState.escrowHoldDays),
        gstRate: Number((formState.gstRatePct / 100).toFixed(4)),
        tcsRate: Number((formState.tcsRatePct / 100).toFixed(4)),
        tdsRate: Number((formState.tdsRatePct / 100).toFixed(4)),
        originalMonthlyPrice: formState.originalMonthlyPrice === "" ? null : Number(formState.originalMonthlyPrice),
        offerMonthlyPrice: formState.offerMonthlyPrice === "" ? null : Number(formState.offerMonthlyPrice),
        originalYearlyPrice: formState.originalYearlyPrice === "" ? null : Number(formState.originalYearlyPrice),
        offerYearlyPrice: formState.offerYearlyPrice === "" ? null : Number(formState.offerYearlyPrice),
        offerEnabled: formState.offerEnabled,
        offerLabel: formState.offerLabel.trim(),
        offerBadge: formState.offerBadge.trim(),
        offerValidUntil: formState.offerValidUntil ? new Date(formState.offerValidUntil).toISOString() : null,
      };

      const res = await fetch(`/api/admin/membership-plans/${selectedPlan.membership_plan}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update membership plan.");
      }

      setSuccessMsg(`Successfully updated ${selectedPlan.membership_plan} plan rules. All future subscriptions and settlements will reflect these authoritative values.`);
      setIsEditOpen(false);

      // Refresh list
      const refRes = await fetch("/api/admin/membership-plans");
      const refData = await refRes.json();
      if (refData.success && refData.plans) {
        setPlans(refData.plans);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving plan.");
    } finally {
      setSaving(false);
    }
  };

  const getTheme = (planKey: string): PerimeterTheme => {
    if (planKey === "BUSINESS") return "purple";
    if (planKey === "PRO") return "blue";
    return "slate";
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Platform Governance
            </span>
            <span className="text-xs font-semibold text-slate-500">Authoritative Database Control</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-2">Membership Plans Manager</h1>
          <p className="text-slate-500 text-xs mt-1 max-w-2xl">
            Configure subscription pricing, platform commission rates, payout thresholds, statutory tax parameters, and tier privileges. 
            All modifications are recorded in immutable audit logs. Historical transactions remain permanently protected.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Active Tiers</span>
            <span className="text-lg font-extrabold text-slate-900">{plans.filter(p => p.active).length} / {plans.length} Live</span>
          </div>
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

      {/* 3-Column Plan Cards Grid with Animated Perimeter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {plans.map((plan) => {
          const theme = getTheme(plan.membership_plan);
          const isBusiness = plan.membership_plan === "BUSINESS";
          const isPro = plan.membership_plan === "PRO";
          const isBasic = plan.membership_plan === "BASIC";

          return (
            <AnimatedPerimeterCard
              key={plan.id || plan.membership_plan}
              theme={theme}
              isCurrent={isPro}
              className="h-full flex flex-col"
            >
              <div className="p-6 md:p-8 flex flex-col justify-between h-full space-y-6">
                {/* Header & Badges */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider border ${
                        isBusiness
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : isPro
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {plan.membership_plan} TIER
                    </span>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        plan.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {plan.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    {plan.display_name || plan.membership_plan}
                    {isBusiness && <Crown className="w-4 h-4 text-amber-500 fill-amber-400" />}
                    {isPro && <Sparkles className="w-4 h-4 text-blue-600" />}
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 line-clamp-2 min-h-[32px]">
                    {plan.description || "Authoritative seller tier configuration."}
                  </p>

                  {/* Pricing Display */}
                  <div className="mt-5 pb-5 border-b border-slate-100">
                    {isBasic ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black text-slate-900">Free</span>
                        <span className="text-xs font-semibold text-slate-400">/ forever</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {plan.offer_enabled && (
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-bold text-slate-400 line-through">
                              ₹{Number(plan.original_monthly_price || plan.monthly_price).toLocaleString("en-IN")}
                            </span>
                            <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                              {plan.offer_badge || "SPECIAL OFFER"}
                            </span>
                          </div>
                        )}
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-black text-slate-900">
                            ₹{Number(plan.offer_enabled && plan.offer_monthly_price != null ? plan.offer_monthly_price : plan.monthly_price).toLocaleString("en-IN")}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">/ month</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          Annual:{" "}
                          <strong>
                            ₹{Number(plan.offer_enabled && plan.offer_yearly_price != null ? plan.offer_yearly_price : plan.yearly_price).toLocaleString("en-IN")}/yr
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Spec Grid */}
                <div className="space-y-4 flex-1 text-xs">
                  {/* Financial & Commission */}
                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 border border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-blue-600" /> Commission Rate:
                      </span>
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                        {(Number(plan.commission_rate) * 100).toFixed(2)}%
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> Escrow Hold:
                      </span>
                      <span className="font-semibold text-slate-800">{plan.escrow_hold_days} Days</span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" /> Min Payout:
                      </span>
                      <span className="font-semibold text-slate-800">
                        ₹{Number(plan.min_payout_amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Limits */}
                  <div className="space-y-2 text-slate-700 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400" /> Product Limit:
                      </span>
                      <span className="font-bold text-slate-900">
                        {plan.max_products === null ? "Unlimited" : `${plan.max_products} Items`}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-slate-400" /> Storage Capacity:
                      </span>
                      <span className="font-bold text-slate-900">
                        {plan.storage_limit_mb >= 1024 ? `${plan.storage_limit_mb / 1024} GB` : `${plan.storage_limit_mb} MB`}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" /> Store Admin Users:
                      </span>
                      <span className="font-bold text-slate-900">
                        {plan.admin_users_limit === null ? "Unlimited" : `${plan.admin_users_limit} Users`}
                      </span>
                    </div>
                  </div>

                  {/* Seller Features */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-400" /> Seller Coupons:
                      </span>
                      <span className={`font-bold ${plan.seller_coupons_enabled ? "text-emerald-600" : "text-slate-400"}`}>
                        {plan.seller_coupons_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <FileSpreadsheet className="w-3 h-3 text-slate-400" /> Bulk CSV Tools:
                      </span>
                      <span className={`font-bold ${plan.bulk_csv_enabled ? "text-emerald-600" : "text-slate-400"}`}>
                        {plan.bulk_csv_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-slate-400" /> Search Ranking:
                      </span>
                      <span className="font-bold text-slate-800">{plan.ranking_boost_level || "Standard"}</span>
                    </div>
                  </div>

                  {/* Statutory Tax Snapshot */}
                  <div className="pt-2 border-t border-slate-100 flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>GST: {(Number(plan.gst_rate) * 100).toFixed(1)}%</span>
                    <span>TCS: {(Number(plan.tcs_rate) * 100).toFixed(2)}%</span>
                    <span>TDS: {(Number(plan.tds_rate) * 100).toFixed(2)}%</span>
                    <span>Grace: {plan.grace_period_days}d</span>
                  </div>

                  {/* Audit timestamp */}
                  {plan.updated_at && (
                    <div className="pt-1 text-[10px] text-slate-400">
                      Updated {new Date(plan.updated_at).toLocaleDateString("en-IN")}
                      {plan.profiles?.full_name ? ` by ${plan.profiles.full_name}` : ""}
                    </div>
                  )}
                </div>

                {/* Edit Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(plan)}
                    className="w-full bg-slate-900 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit {plan.membership_plan} Plan Rules
                  </button>
                </div>
              </div>
            </AnimatedPerimeterCard>
          );
        })}
      </div>

      {/* Edit Plan Modal / Drawer */}
      {isEditOpen && selectedPlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                  Admin Configuration Mode
                </span>
                <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                  Edit Plan: {selectedPlan.membership_plan}
                </h2>
                <p className="text-xs text-slate-500">
                  Update database fee rules, subscription pricing, feature allocations, and settlement criteria.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Sensitive Change Confirmation Banner */}
            {showConfirmDiff && (
              <div className="my-5 p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm mb-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  Review Sensitive Financial &amp; Policy Changes
                </div>
                <p className="text-xs text-amber-800 mb-4">
                  Please review the modified sensitive fields below before applying. Existing completed orders and historical settlements will not be rewritten.
                </p>

                <div className="space-y-2 bg-white/80 p-3 rounded-xl border border-amber-200">
                  {getSensitiveDiffs().map((diff) => (
                    <div key={diff.field} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
                      <span className="font-semibold text-slate-700">{diff.field}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-rose-600 line-through">{diff.oldVal}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-emerald-700 font-bold">{diff.newVal}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmDiff(false)}
                    className="px-4 py-2 border border-slate-300 bg-white rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitSave}
                    disabled={saving}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Confirm &amp; Apply Changes
                  </button>
                </div>
              </div>
            )}

            {/* Main Form */}
            <form onSubmit={handlePreSave} className="space-y-6 mt-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {/* Section 1: Basic Information */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  1. Basic Information
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Plan Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formState.displayName}
                      onChange={(e) => setFormState({ ...formState, displayName: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      placeholder="e.g. Professional Growth"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Plan Status
                    </label>
                    <select
                      value={formState.active ? "true" : "false"}
                      onChange={(e) => setFormState({ ...formState, active: e.target.value === "true" })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="true">Active (Visible to Sellers)</option>
                      <option value="false">Inactive (Suspended)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Plan Description
                  </label>
                  <textarea
                    rows={2}
                    value={formState.description}
                    onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    placeholder="Short description highlighting tier benefits..."
                  />
                </div>
              </div>

              {/* Section 2: Pricing & Promotional Offers */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    2. Pricing &amp; Promotional Offers (INR)
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-2xs">
                    <input
                      type="checkbox"
                      checked={formState.offerEnabled}
                      onChange={(e) => setFormState({ ...formState, offerEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-extrabold text-slate-800">Enable Special Offer</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Standard Monthly Price (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formState.monthlyPrice}
                      onChange={(e) => setFormState({ ...formState, monthlyPrice: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Standard Yearly Price (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formState.yearlyPrice}
                      onChange={(e) => setFormState({ ...formState, yearlyPrice: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                  </div>
                </div>

                {/* Offer Fields when Offer is Enabled */}
                {formState.offerEnabled && (
                  <div className="p-4 bg-gradient-to-r from-rose-50/70 to-amber-50/70 rounded-xl border border-rose-200/80 space-y-3 animate-in fade-in">
                    <span className="text-[10px] font-black uppercase text-rose-800 tracking-wider block">
                      Promotional Discount Configuration
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Original Monthly Price (Struck-through)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 1999"
                          value={formState.originalMonthlyPrice}
                          onChange={(e) => setFormState({ ...formState, originalMonthlyPrice: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1 font-bold text-rose-700">
                          Offer Monthly Price (Effective Charged) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 999"
                          value={formState.offerMonthlyPrice}
                          onChange={(e) => setFormState({ ...formState, offerMonthlyPrice: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-mono font-bold text-rose-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Original Yearly Price (Struck-through)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 19999"
                          value={formState.originalYearlyPrice}
                          onChange={(e) => setFormState({ ...formState, originalYearlyPrice: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1 font-bold text-rose-700">
                          Offer Yearly Price (Effective Charged) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 9999"
                          value={formState.offerYearlyPrice}
                          onChange={(e) => setFormState({ ...formState, offerYearlyPrice: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-mono font-bold text-rose-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Offer Badge Tag
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. LIMITED OFFER"
                          value={formState.offerBadge}
                          onChange={(e) => setFormState({ ...formState, offerBadge: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Offer Sub-label
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Special Launch Offer"
                          value={formState.offerLabel}
                          onChange={(e) => setFormState({ ...formState, offerLabel: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Offer Valid Until
                        </label>
                        <input
                          type="date"
                          value={formState.offerValidUntil}
                          onChange={(e) => setFormState({ ...formState, offerValidUntil: e.target.value })}
                          className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Limits */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  3. Platform Limits
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Products
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Leave empty for Unlimited"
                      value={formState.maxProducts}
                      onChange={(e) => setFormState({ ...formState, maxProducts: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Blank = Unlimited</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Storage Limit (MB)
                    </label>
                    <input
                      type="number"
                      min="100"
                      value={formState.storageLimitMB}
                      onChange={(e) => setFormState({ ...formState, storageLimitMB: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">10240 MB = 10 GB</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Store Admin Users
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Leave empty for Unlimited"
                      value={formState.adminUsersLimit}
                      onChange={(e) => setFormState({ ...formState, adminUsersLimit: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Blank = Unlimited</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Seller Features */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  4. Seller Features
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">Seller Coupons</span>
                    <input
                      type="checkbox"
                      checked={formState.sellerCouponsEnabled}
                      onChange={(e) => setFormState({ ...formState, sellerCouponsEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">Bulk CSV Tools</span>
                    <input
                      type="checkbox"
                      checked={formState.bulkCsvEnabled}
                      onChange={(e) => setFormState({ ...formState, bulkCsvEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ranking Boost
                    </label>
                    <select
                      value={formState.rankingBoostLevel}
                      onChange={(e) => setFormState({ ...formState, rankingBoostLevel: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="Standard">Standard</option>
                      <option value="High">High</option>
                      <option value="Priority Boost">Priority Boost</option>
                      <option value="Maximum Boost">Maximum Boost</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 5: Commission */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  5. Platform Commission
                </h4>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Commission Rate (%) *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={formState.commissionRatePct}
                      onChange={(e) => setFormState({ ...formState, commissionRatePct: Number(e.target.value) })}
                      className="w-48 text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono font-bold text-blue-700"
                    />
                    <span className="text-xs text-slate-500 font-semibold">% on completed orders</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    e.g. 8.00% will be applied to future transactions. Historical orders remain untouched.
                  </span>
                </div>
              </div>

              {/* Section 6: Membership Rules */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  6. Membership Rules
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Billing Duration Label
                    </label>
                    <input
                      type="text"
                      value={formState.billingDuration}
                      onChange={(e) => setFormState({ ...formState, billingDuration: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      placeholder="e.g. Monthly / Yearly"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Grace Period (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formState.gracePeriodDays}
                      onChange={(e) => setFormState({ ...formState, gracePeriodDays: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Section 7: Payout & Settlement */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  7. Payout &amp; Settlement Criteria
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Minimum Payout Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={formState.minPayoutAmount}
                      onChange={(e) => setFormState({ ...formState, minPayoutAmount: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Escrow Hold Days
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formState.escrowHoldDays}
                      onChange={(e) => setFormState({ ...formState, escrowHoldDays: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Section 8: Tax / Withholding */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  8. Statutory Tax &amp; Withholding Parameters
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      GST on Services (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formState.gstRatePct}
                      onChange={(e) => setFormState({ ...formState, gstRatePct: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Default: 18.00%</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      GST TCS Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.01"
                      value={formState.tcsRatePct}
                      onChange={(e) => setFormState({ ...formState, tcsRatePct: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Sec 52: 0.50%</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sec 194-O TDS Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.01"
                      value={formState.tdsRatePct}
                      onChange={(e) => setFormState({ ...formState, tdsRatePct: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Standard: 0.10%</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Unsaved Changes
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      "Review & Save Changes"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
