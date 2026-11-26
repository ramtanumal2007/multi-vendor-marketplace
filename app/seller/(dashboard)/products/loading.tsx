import React from "react";
import { Loader2 } from "lucide-react";

export default function SellerProductsLoading() {
  return (
    <div className="flex-1 p-6 md:p-8 animate-pulse space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="h-7 w-48 rounded-lg bg-slate-200 mb-2" />
          <div className="h-4 w-72 rounded bg-slate-200/70" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-slate-200" />
      </div>

      {/* Product List Skeleton Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="h-5 w-40 rounded bg-slate-200" />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Loading products catalog...</span>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-slate-200 shrink-0" />
                <div className="space-y-2">
                  <div className="h-4 w-52 rounded bg-slate-200" />
                  <div className="h-3 w-32 rounded bg-slate-200/60" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-5 w-16 rounded bg-slate-200" />
                <div className="h-8 w-20 rounded-lg bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
