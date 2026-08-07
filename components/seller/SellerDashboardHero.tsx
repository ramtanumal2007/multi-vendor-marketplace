"use client";

import React, { useState } from "react";
import { Store, Calendar, Sparkles, ChevronDown, ChevronUp, CheckCircle2, Circle, ArrowUpRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { DownloadCertificateButton } from "./DownloadCertificateButton";
import { getProductUsageStatus } from "@/lib/membership";
import { computeSellerMetrics } from "@/lib/sellerMetrics";

interface SellerDashboardHeroProps {
  sellerProfile: Record<string, unknown> | null;
  store: Record<string, unknown> | null;
  productCount: number;
}

export function SellerDashboardHero({ sellerProfile, store, productCount }: SellerDashboardHeroProps) {
  const [showChecklist, setShowChecklist] = useState(false);

  const plan = sellerProfile?.membership_plan || "BASIC";
  const usage = getProductUsageStatus(productCount, plan);
  const metrics = computeSellerMetrics(sellerProfile, store, productCount);

  const formattedApprovalDate = sellerProfile?.approved_at
    ? new Date(sellerProfile.approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : sellerProfile?.verification_status === "approved"
    ? "Approved"
    : "Pending Approval";

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 md:p-8 shadow-xl border border-slate-700/60 mb-8 relative overflow-hidden">
      {/* Background Accent glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-700/60">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> Store: {store?.name || "Official Store"}
              </span>

              <span className="bg-slate-700/80 text-slate-200 border border-slate-600 text-xs font-mono px-3 py-1 rounded-full">
                ID: {sellerProfile?.seller_id_code || "SLR-PENDING"}
              </span>

              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold px-3 py-1 rounded-full">
                Plan: {plan}
              </span>

              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold px-3 py-1 rounded-full">
                Level: {metrics.level}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {sellerProfile?.contact_name || store?.name || "Partner"}! 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage your marketplace products, track sales performance, and optimize your store catalog.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {usage.isLimitReached ? (
              <button
                disabled
                title="Product limit reached for BASIC membership"
                className="bg-slate-700 text-slate-400 font-medium px-5 py-2.5 rounded-xl cursor-not-allowed opacity-75 text-sm"
              >
                Start Selling (Locked)
              </button>
            ) : (
              <Link
                href="/seller/products/new"
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
              >
                Start Selling <ArrowUpRight className="w-4 h-4" />
              </Link>
            )}

            <DownloadCertificateButton
              sellerIdCode={sellerProfile?.seller_id_code}
              storeName={store?.name}
              businessName={sellerProfile?.business_name}
              contactName={sellerProfile?.contact_name}
              approvalDate={sellerProfile?.approved_at}
              status={sellerProfile?.verification_status}
              variant="outline"
            />
          </div>
        </div>

        {/* Dynamic Grid: Usage + Health Score + Approval Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          {/* Product Usage Progress */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Product Usage</span>
              <span className="text-xs font-bold text-blue-400">
                {usage.maxProducts === null ? `${productCount} (Unlimited)` : `${productCount} / ${usage.maxProducts}`}
              </span>
            </div>

            {usage.maxProducts !== null && (
              <div>
                <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all duration-500 ${
                      usage.isLimitReached ? "bg-red-500" : usage.isWarning ? "bg-amber-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${usage.percentage}%` }}
                  />
                </div>
                {usage.isLimitReached ? (
                  <p className="text-xs text-red-400 flex items-center font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 flex-shrink-0" /> Product limit reached. Upgrade to PRO.
                  </p>
                ) : usage.isWarning ? (
                  <p className="text-xs text-amber-400 flex items-center font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 flex-shrink-0" /> Warning: 9 of 10 slots used. Upgrade to PRO.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">{usage.remainingSlots} product slots remaining in BASIC plan.</p>
                )}
              </div>
            )}
          </div>

          {/* Seller Health Score & Completion */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Seller Score</span>
              <div className="text-2xl font-bold text-white mt-1 flex items-baseline gap-1">
                {metrics.score} <span className="text-xs font-normal text-slate-400">/ 100</span>
              </div>
              <button
                onClick={() => setShowChecklist(!showChecklist)}
                className="text-xs text-blue-400 hover:text-blue-300 mt-1 flex items-center gap-1 font-medium transition-colors"
              >
                Store Checklist ({metrics.completionPercentage}%)
                {showChecklist ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="w-12 h-12 rounded-full border-4 border-blue-500/40 flex items-center justify-center bg-blue-500/10 text-blue-400 font-bold text-sm">
              {metrics.score}%
            </div>
          </div>

          {/* Account Status & Approval Date */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Account Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                sellerProfile?.verification_status === "approved" ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}>
                {(sellerProfile?.verification_status || "Pending").toUpperCase()}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-300 flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1.5" /> Approval Date: <strong className="ml-1 text-white">{formattedApprovalDate}</strong>
            </div>
          </div>
        </div>

        {/* Expandable Store Completion Checklist */}
        {showChecklist && (
          <div className="mt-6 bg-slate-900/90 border border-slate-700 p-5 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Store Profile Completion Checklist
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metrics.checklist.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border text-xs flex items-start space-x-3 transition-colors ${
                    item.isCompleted ? "bg-slate-800/50 border-green-500/30 text-slate-300" : "bg-slate-800/20 border-slate-700 text-slate-400"
                  }`}
                >
                  {item.isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-200">{item.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{item.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
