import React from "react";

export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-background animate-pulse py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb skeleton */}
        <div className="flex gap-2 mb-6">
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-4 rounded bg-slate-200/60 dark:bg-slate-800/60" />
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-4 rounded bg-slate-200/60 dark:bg-slate-800/60" />
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Product Layout Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Gallery Skeleton */}
          <div className="flex flex-col gap-4">
            <div className="aspect-square w-full rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
            <div className="flex gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-20 h-20 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 shrink-0" />
              ))}
            </div>
          </div>

          {/* Details Skeleton */}
          <div className="flex flex-col gap-5">
            <div className="h-8 w-3/4 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-1/3 rounded bg-slate-200/70 dark:bg-slate-800/70" />
            
            {/* Price Row Skeleton */}
            <div className="flex items-center gap-3 py-2 border-y border-slate-200/60 dark:border-slate-800/60">
              <div className="h-8 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-5 w-20 rounded bg-slate-200/60 dark:bg-slate-800/60" />
            </div>

            {/* Description Lines Skeleton */}
            <div className="space-y-2 py-2">
              <div className="h-4 w-full rounded bg-slate-200/70 dark:bg-slate-800/70" />
              <div className="h-4 w-5/6 rounded bg-slate-200/70 dark:bg-slate-800/70" />
              <div className="h-4 w-4/6 rounded bg-slate-200/70 dark:bg-slate-800/70" />
            </div>

            {/* Action Buttons Skeleton */}
            <div className="flex gap-4 pt-4">
              <div className="h-12 flex-1 rounded-xl bg-slate-200 dark:bg-slate-800" />
              <div className="h-12 flex-1 rounded-xl bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
