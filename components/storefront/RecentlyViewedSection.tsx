"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Trash2, ArrowDown } from "lucide-react";
import { getRecentlyViewed, clearRecentlyViewed, RecentlyViewedProduct } from "@/lib/recentlyViewed";
import { formatCurrency } from "@/lib/utils";
import { calculateFlipkartDiscount } from "@/lib/search";
import { FlipkartPriceRow } from "@/components/ui/ProductCard";

interface RecentlyViewedSectionProps {
  currentProductId?: string;
  title?: string;
  limit?: number;
  className?: string;
}

export function RecentlyViewedSection({
  currentProductId,
  title = "Recently Viewed",
  limit = 8,
  className = "",
}: RecentlyViewedSectionProps) {
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const recent = getRecentlyViewed();
    // Exclude current product if on PDP
    const filtered = currentProductId
      ? recent.filter((item) => item.id !== currentProductId)
      : recent;
    setItems(filtered.slice(0, limit));
  }, [currentProductId, limit]);

  const handleClear = () => {
    clearRecentlyViewed();
    setItems([]);
  };

  const gridClassName = React.useMemo(() => {
    if (items.length === 1) {
      return "max-w-xs sm:max-w-sm mx-auto grid grid-cols-1 justify-center";
    }
    if (items.length === 2) {
      return "max-w-md sm:max-w-xl mx-auto grid grid-cols-2 gap-3 sm:gap-5 justify-center";
    }
    if (items.length === 3) {
      return "max-w-2xl sm:max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5 justify-center";
    }
    return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5";
  }, [items.length]);

  if (!isMounted || items.length === 0) {
    return null;
  }

  return (
    <section className={`w-full py-8 md:py-12 border-t border-border ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-accent/10 text-accent">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-foreground">
              {title}
            </h2>
            <p className="text-xs text-foreground-secondary">
              Pick up where you left off
            </p>
          </div>
        </div>

        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-destructive transition-colors self-start sm:self-auto font-medium"
          title="Clear browsing history"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear History</span>
        </button>
      </div>

      <div className={gridClassName}>
        {items.map((item) => {
          const discountInfo = calculateFlipkartDiscount(item.price, item.sale_price);

          return (
            <Link
              key={item.id}
              href={`/products/${item.slug || item.id}`}
              className="group flex flex-col bg-card rounded-2xl border border-border overflow-hidden hover:border-accent/40 hover:shadow-md transition-all duration-300"
            >
              <div className="relative aspect-square w-full bg-background-secondary overflow-hidden">
                <Image
                  src={item.image_url || "/placeholder.jpg"}
                  alt={item.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                />
                {discountInfo.hasDiscount && discountInfo.discountPercent > 0 && (
                  <span className="inline-flex items-center gap-0.5 absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs">
                    <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                    <span>{discountInfo.discountPercent}% OFF</span>
                  </span>
                )}
              </div>

              <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                <div>
                  {item.category_name && (
                    <span className="text-[10px] uppercase font-semibold text-foreground-secondary tracking-wider line-clamp-1">
                      {item.category_name}
                    </span>
                  )}
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                    {item.title}
                  </h3>
                </div>

                <div className="pt-1.5 border-t border-border/50">
                  <FlipkartPriceRow
                    originalPrice={discountInfo.originalPrice}
                    sellingPrice={discountInfo.finalPrice}
                    hasDiscount={discountInfo.hasDiscount}
                    discountPercent={discountInfo.discountPercent}
                    savingsAmount={discountInfo.savingsAmount}
                    size="compact"
                    showSavings={true}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
