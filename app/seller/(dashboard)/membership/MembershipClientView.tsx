"use client";

import React, { useState } from "react";
import { Check, ArrowRight, ShieldCheck, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { MEMBERSHIP_PLANS, MembershipPlan, MembershipStatus, getPlanPricing, DbFeeRule } from "@/lib/membership";
import { useRouter } from "next/navigation";

interface MembershipClientViewProps {
  currentPlan: MembershipPlan;
  membershipStatus: MembershipStatus;
  membershipExpiresAt: string | null;
  isInGracePeriod: boolean;
  businessName: string;
  feeRules?: Record<string, DbFeeRule>;
}

interface CashfreeInstance {
  checkout: (options: { paymentSessionId: string; redirectTarget?: "_modal" | "_self" }) => Promise<{
    error?: { message?: string; code?: string };
    paymentDetails?: unknown;
  }>;
}

interface WindowWithCashfree extends Window {
  Cashfree?: (config: { mode: "sandbox" | "production" }) => CashfreeInstance;
}

export default function MembershipClientView({
  currentPlan,
  membershipStatus,
  membershipExpiresAt,
  isInGracePeriod,
  businessName,
  feeRules,
}: MembershipClientViewProps) {
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [processingPlan, setProcessingPlan] = useState<"PRO" | "BUSINESS" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const router = useRouter();

  // Helper to dynamically load official Cashfree Web Checkout SDK v3
  const loadCashfreeSdk = (mode: "sandbox" | "production" = "sandbox"): Promise<CashfreeInstance | null> => {
    return new Promise((resolve) => {
      const win = window as unknown as WindowWithCashfree;
      if (win.Cashfree) {
        resolve(win.Cashfree({ mode }));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.onload = () => {
        if (win.Cashfree) {
          resolve(win.Cashfree({ mode }));
        } else {
          resolve(null);
        }
      };
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  };

  const handleUpgrade = async (plan: "PRO" | "BUSINESS") => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setProcessingPlan(plan);

    try {
      // 1. Create Subscription Order via dedicated endpoint
      const res = await fetch("/api/seller/membership/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingCycle }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to initialize subscription checkout.");
      }

      const { paymentSessionId, orderId } = data;
      if (!paymentSessionId) {
        throw new Error("Invalid payment session returned by server.");
      }

      // 2. Load SDK & Launch Checkout Modal
      const mode = (process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT?.toLowerCase() === "production") ? "production" : "sandbox";
      const cashfree = await loadCashfreeSdk(mode);

      if (!cashfree) {
        throw new Error("Unable to load Cashfree payment gateway. Please check your internet connection.");
      }

      const checkoutResult = await cashfree.checkout({
        paymentSessionId,
        redirectTarget: "_modal",
      });

      if (checkoutResult?.error) {
        console.warn("Cashfree checkout notice:", checkoutResult.error);
      }

      // 3. Authoritative Server-to-Server Verification
      const verifyRes = await fetch("/api/seller/membership/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashfreeOrderId: orderId }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.message || "Payment verification failed. If amount was deducted, your membership will activate shortly via webhook.");
      }

      setSuccessMessage(`Congratulations! Your seller membership has been successfully upgraded to ${plan} (${billingCycle.toLowerCase()}).`);
      router.refresh();
    } catch (err) {
      console.error("Membership upgrade error:", err);
      const msg = err instanceof Error ? err.message : "Payment failed or was cancelled.";
      setErrorMessage(msg);
    } finally {
      setProcessingPlan(null);
    }
  };

  const plansList: MembershipPlan[] = ["BASIC", "PRO", "BUSINESS"];

  const formattedExpiry = membershipExpiresAt
    ? new Date(membershipExpiresAt).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="max-w-6xl mx-auto py-2">
      {/* Notifications */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Grace Period Warning */}
      {isInGracePeriod && (
        <div className="mb-8 p-5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 shadow-xs">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base">Subscription Grace Period Active</h3>
              <p className="text-sm mt-1 text-amber-800">
                Your paid membership expired on <strong>{formattedExpiry}</strong>. You are currently in the <strong>7-day grace period</strong>.
                All your existing products remain live, but new product additions will be locked if you downgrade to the BASIC limit (10 items).
                Renew your plan below to maintain continuous store benefits.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header & Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
        <div>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-500">Seller Store</span>
          <h2 className="text-xl font-extrabold text-slate-900">{businessName || "My Store"}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-600">Current Plan:</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${MEMBERSHIP_PLANS[currentPlan].badgeColor}`}>
              {currentPlan}
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                membershipStatus === "active"
                  ? "bg-emerald-100 text-emerald-800"
                  : membershipStatus === "past_due"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              Status: {membershipStatus.toUpperCase()}
            </span>
          </div>
        </div>

        {formattedExpiry && currentPlan !== "BASIC" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-right">
            <span className="text-xs text-slate-500 font-medium">Subscription Renews / Expires:</span>
            <div className="text-sm font-bold text-slate-900">{formattedExpiry}</div>
          </div>
        )}
      </div>

      {/* Cycle Toggle */}
      <div className="flex justify-center items-center mb-10">
        <div className="bg-slate-100 p-1 rounded-xl flex items-center space-x-1 border border-slate-200">
          <button
            type="button"
            onClick={() => setBillingCycle("MONTHLY")}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              billingCycle === "MONTHLY"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("YEARLY")}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              billingCycle === "YEARLY"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Annual Billing</span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md">
              Save ~17%
            </span>
          </button>
        </div>
      </div>

      {/* Plans Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {plansList.map((planKey) => {
          const plan = MEMBERSHIP_PLANS[planKey];
          const rule = feeRules?.[planKey];
          const isCurrent = currentPlan === planKey;
          const isPaid = planKey === "PRO" || planKey === "BUSINESS";
          const pricing = isPaid ? getPlanPricing(planKey, billingCycle, rule) : null;
          const isProcessing = processingPlan === planKey;

          const displayName = rule?.display_name || plan.displayName;
          const maxProducts = rule?.max_products !== undefined ? rule.max_products : plan.maxProducts;
          const storageLimitMB = rule?.storage_limit_mb !== undefined ? rule.storage_limit_mb : plan.storageLimitMB;
          const adminUsersLimit = rule?.admin_users_limit !== undefined ? rule.admin_users_limit : plan.adminUsersLimit;
          const canCoupons = rule?.seller_coupons_enabled !== undefined ? rule.seller_coupons_enabled : plan.canCreateCoupons;
          const bulkCsv = rule?.bulk_csv_enabled !== undefined ? rule.bulk_csv_enabled : plan.bulkUpload;
          const rankingBoost = rule?.ranking_boost_level || (planKey === "BUSINESS" ? "Priority Boost" : planKey === "PRO" ? "High" : "Standard");
          const commissionRatePct = rule?.commission_rate !== undefined 
            ? `${(Number(rule.commission_rate) * 100).toFixed(0)}%` 
            : (planKey === "BASIC" ? "12%" : planKey === "PRO" ? "8%" : "5%");

          return (
            <div
              key={planKey}
              className={`bg-white rounded-2xl border p-8 flex flex-col justify-between relative transition-all shadow-xs hover:shadow-md ${
                isCurrent
                  ? "border-blue-600 ring-2 ring-blue-600/20"
                  : planKey === "PRO"
                  ? "border-blue-300 ring-1 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                  Active Current Plan
                </div>
              )}

              {planKey === "PRO" && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Most Popular
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-slate-900">{displayName}</h3>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${plan.badgeColor}`}>
                    {plan.name}
                  </span>
                </div>

                <div className="mb-6">
                  {planKey === "BASIC" ? (
                    <div>
                      <span className="text-3xl font-extrabold text-slate-900">Free</span>
                      <span className="text-xs text-slate-500 ml-1">forever</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline">
                        <span className="text-3xl font-extrabold text-slate-900">
                          ₹{pricing?.baseAmount.toLocaleString("en-IN")}
                        </span>
                        <span className="text-xs text-slate-500 ml-1">
                          /{billingCycle === "YEARLY" ? "year" : "month"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        + 18% GST (₹{pricing?.taxAmount.toLocaleString("en-IN")}) = <strong>₹{pricing?.totalAmount.toLocaleString("en-IN")}</strong> total
                      </div>
                    </div>
                  )}
                </div>

                <ul className="space-y-3 text-xs text-slate-700 mb-8 border-t border-slate-100 pt-6">
                  <li className="flex items-center font-medium">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Product Listings: <strong className="ml-1 font-bold text-slate-900">{maxProducts === null ? "Unlimited" : `${maxProducts} Products`}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Platform Commission: <strong className="ml-1 font-bold text-blue-700">{commissionRatePct}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Storage Space: <strong className="ml-1 font-bold text-slate-900">{storageLimitMB >= 1024 ? `${storageLimitMB / 1024} GB` : `${storageLimitMB} MB`}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Store Admin Users: <strong className="ml-1 font-bold text-slate-900">{adminUsersLimit === null ? "Unlimited" : `${adminUsersLimit} Users`}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${canCoupons ? "text-emerald-600" : "text-slate-300"}`} />
                    Store Promotional Coupons: <strong className="ml-1 font-bold text-slate-900">{canCoupons ? "Included" : "Disabled"}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${bulkCsv ? "text-emerald-600" : "text-slate-300"}`} />
                    Bulk CSV Upload Tools: <strong className="ml-1 font-bold text-slate-900">{bulkCsv ? "Included" : "Disabled"}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${rankingBoost !== "Standard" ? "text-emerald-600" : "text-slate-400"}`} />
                    Search Ranking Boost: <strong className="ml-1 font-bold text-slate-900">{rankingBoost}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.analytics !== "basic" ? "text-emerald-600" : "text-slate-300"}`} />
                    Advanced Sales Analytics
                  </li>
                </ul>
              </div>

              {isCurrent ? (
                <button
                  disabled
                  className="w-full bg-slate-100 text-slate-500 font-bold py-3 px-4 rounded-xl text-xs text-center cursor-default"
                >
                  Current Active Plan
                </button>
              ) : isPaid ? (
                <button
                  type="button"
                  onClick={() => handleUpgrade(planKey)}
                  disabled={isProcessing}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl text-xs text-center transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Opening Secure Payment...
                    </>
                  ) : (
                    <>
                      Upgrade to {plan.name} <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="w-full bg-slate-100 text-slate-400 font-bold py-3 px-4 rounded-xl text-xs text-center cursor-default"
                >
                  Standard Base Tier
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
