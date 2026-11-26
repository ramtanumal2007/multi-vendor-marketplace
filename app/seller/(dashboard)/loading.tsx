import React from "react";
import { Loader2 } from "lucide-react";

export default function SellerDashboardLoading() {
  return (
    <div className="flex-1 p-6 md:p-8 animate-pulse space-y-6">
      {/* Top Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="h-7 w-48 rounded-lg bg-slate-200 mb-2" />
          <div className="h-4 w-72 rounded bg-slate-200/70" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-xl bg-slate-200" />
          <div className="h-9 w-32 rounded-xl bg-slate-200" />
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded bg-slate-200" />
              <div className="w-8 h-8 rounded-lg bg-slate-100" />
            </div>
            <div className="h-7 w-32 rounded bg-slate-200" />
            <div className="h-3 w-20 rounded bg-slate-200/60" />
          </div>
        ))}
      </div>

      {/* Main Table / Content Skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="h-5 w-36 rounded bg-slate-200" />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Loading portal data...</span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-40 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-200/60" />
                </div>
              </div>
              <div className="h-4 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
