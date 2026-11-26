import React from "react";

export default function ProductsListLoading() {
  return (
    <div className="min-h-screen bg-background animate-pulse py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header / Filter Bar Skeleton */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="h-7 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filter Sidebar Skeleton */}
          <div className="hidden lg:flex flex-col gap-6">
            <div className="p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-card space-y-4">
              <div className="h-5 w-28 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3.5 w-28 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Product Grid Skeleton */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-3 flex flex-col gap-3 bg-card"
                >
                  <div className="aspect-square w-full rounded-xl bg-slate-200/80 dark:bg-slate-800/80" />
                  <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/2 rounded bg-slate-200/60 dark:bg-slate-800/60" />
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-8 w-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
