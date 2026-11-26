import React from "react";

export default function StorefrontLoading() {
  return (
    <div className="min-h-screen bg-background animate-pulse pb-16">
      {/* Hero / Banner Skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="h-44 sm:h-72 md:h-96 w-full rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 mb-8" />

        {/* Category Icons Row Skeleton */}
        <div className="flex gap-4 overflow-x-hidden mb-10 pb-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-200/80 dark:bg-slate-800/80" />
              <div className="h-3 w-12 rounded bg-slate-200/60 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>

        {/* Section Heading Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-20 rounded bg-slate-200/60 dark:bg-slate-800/60" />
        </div>

        {/* Products Grid Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-3 flex flex-col gap-3 bg-card"
            >
              <div className="aspect-square w-full rounded-xl bg-slate-200/80 dark:bg-slate-800/80" />
              <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
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
  );
}
