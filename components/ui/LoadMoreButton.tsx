"use client";

import React from "react";
import { Loader2, ChevronDown, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadMoreButtonProps {
  currentCount: number;
  totalCount: number;
  isLoading: boolean;
  onLoadMore: () => void;
  error?: string | null;
  onRetry?: () => void;
  batchSize?: number;
  categoryLabel?: string;
  className?: string;
}

export function LoadMoreButton({
  currentCount,
  totalCount,
  isLoading,
  onLoadMore,
  error,
  onRetry,
  batchSize = 12,
  categoryLabel,
  className,
}: LoadMoreButtonProps) {
  if (totalCount <= 0) return null;

  const remaining = Math.max(0, totalCount - currentCount);
  const nextBatchCount = Math.min(batchSize, remaining);
  const isCaughtUp = currentCount >= totalCount;

  return (
    <div
      className={cn("mt-12 sm:mt-16 flex flex-col items-center gap-4 w-full", className)}
      aria-live="polite"
    >
      {/* Progress & Divider */}
      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 font-medium w-full max-w-md justify-center px-4">
        <span className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
        <span className="whitespace-nowrap font-medium">
          Showing <span className="font-bold text-slate-800 dark:text-slate-200">{Math.min(currentCount, totalCount)}</span> of{" "}
          <span className="font-bold text-slate-800 dark:text-slate-200">{totalCount}</span> products
        </span>
        <span className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
      </div>

      {/* Error state with retry */}
      {error ? (
        <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 max-w-md text-center">
          <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
            {error || "Could not load additional products. Please try again."}
          </p>
          <button
            type="button"
            onClick={onRetry || onLoadMore}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-xs"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>Retry Loading</span>
          </button>
        </div>
      ) : !isCaughtUp ? (
        /* Load More Action Button */
        <button
          type="button"
          disabled={isLoading}
          onClick={onLoadMore}
          aria-busy={isLoading}
          aria-label={isLoading ? "Loading more products" : `Load ${nextBatchCount} more products`}
          className={cn(
            "relative group flex items-center justify-center gap-2 px-8 py-3.5 min-h-[48px] rounded-full",
            "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100",
            "border border-slate-300 dark:border-slate-700",
            "hover:border-indigo-600 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400",
            "shadow-xs hover:shadow-md active:scale-[0.98]",
            "font-bold text-xs sm:text-sm tracking-tight transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
            isLoading && "opacity-80 cursor-not-allowed pointer-events-none"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span>Loading more products...</span>
            </>
          ) : (
            <>
              <span>Load More Products</span>
              {remaining > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950/60 dark:group-hover:text-indigo-300 transition-colors">
                  +{nextBatchCount}
                </span>
              )}
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-y-0.5 transition-transform" />
            </>
          )}
        </button>
      ) : (
        /* Caught up state */
        <div className="flex flex-col items-center gap-1 py-2 text-center animate-in fade-in duration-300">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>You&apos;re all caught up</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            {categoryLabel
              ? `All ${totalCount} products in ${categoryLabel} have been explored.`
              : `All ${totalCount} products have been explored.`}
          </p>
        </div>
      )}
    </div>
  );
}
