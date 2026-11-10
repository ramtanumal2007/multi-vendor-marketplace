"use client";

import React, { useEffect, useState } from "react";
import { Truck, CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";

interface FreeDeliveryProgressProps {
  subtotal: number;
  className?: string;
  compact?: boolean;
}

export function FreeDeliveryProgress({
  subtotal,
  className = "",
  compact = false,
}: FreeDeliveryProgressProps) {
  // Use existing business threshold: 500 fallback or fetched from site_settings
  const [threshold, setThreshold] = useState<number>(500);

  useEffect(() => {
    async function loadThreshold() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("site_settings")
          .select("free_delivery_threshold")
          .limit(1)
          .maybeSingle();

        if (data?.free_delivery_threshold) {
          const val = Number(data.free_delivery_threshold);
          if (val > 0) setThreshold(val);
        }
      } catch {
        // Fallback safely to existing 500 threshold
      }
    }
    loadThreshold();
  }, []);

  const diff = Math.max(0, threshold - subtotal);
  const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
  const isUnlocked = subtotal >= threshold;

  if (compact) {
    return (
      <div
        className={`p-3 rounded-xl border transition-all ${
          isUnlocked
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
            : "bg-blue-500/10 border-blue-500/20 text-blue-900 dark:text-blue-300"
        } ${className}`}
      >
        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
          <div className="flex items-center gap-1.5">
            {isUnlocked ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>FREE Delivery Unlocked!</span>
              </>
            ) : (
              <>
                <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  Add <strong className="text-foreground font-black">{formatCurrency(diff)}</strong> for Free Delivery
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] font-mono font-bold">{percent}%</span>
        </div>

        <div className="w-full h-1.5 bg-background-secondary rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              isUnlocked ? "bg-emerald-600" : "bg-blue-600"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        isUnlocked
          ? "bg-gradient-to-r from-emerald-50/90 to-teal-50/70 dark:from-emerald-950/40 dark:to-teal-950/30 border-emerald-300/80 dark:border-emerald-800/80 shadow-xs"
          : "bg-background-secondary/40 border-border/80"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isUnlocked
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-blue-600/10 text-blue-600 dark:text-blue-400"
            }`}
          >
            {isUnlocked ? (
              <Sparkles className="w-4 h-4 animate-spin-slow" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
          </div>

          <div>
            <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">
              {isUnlocked ? (
                <span className="text-emerald-700 dark:text-emerald-300 font-black">
                  🎉 Free Standard Delivery Unlocked!
                </span>
              ) : (
                <span>
                  Add <strong className="text-accent underline font-black">{formatCurrency(diff)}</strong> more to get FREE Delivery
                </span>
              )}
            </p>
            <p className="text-[11px] text-foreground-secondary mt-0.5">
              {isUnlocked
                ? "Eligible orders ship with verified courier delivery at ₹0 cost."
                : `Orders over ${formatCurrency(threshold)} qualify for free standard shipping.`}
            </p>
          </div>
        </div>

        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
            isUnlocked
              ? "bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200"
              : "bg-background-secondary text-foreground-secondary"
          }`}
        >
          {percent}%
        </span>
      </div>

      {/* Visual Progress Bar */}
      <div className="w-full h-2 bg-background-secondary rounded-full overflow-hidden p-0.5">
        <motion.div
          className={`h-full rounded-full transition-all ${
            isUnlocked
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              : "bg-gradient-to-r from-blue-500 to-accent"
          }`}
          initial={{ width: "0%" }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
