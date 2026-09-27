"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Trash2 } from "lucide-react";
import { getRecentlyViewed, clearRecentlyViewed, RecentlyViewedProduct } from "@/lib/recentlyViewed";
import { formatCurrency } from "@/lib/utils";

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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
        {items.map((item) => {
          const hasDiscount = Boolean(item.sale_price && item.sale_price < item.price);
          const activePrice = item.sale_price || item.price;
          const discountPct = hasDiscount
            ? Math.round(((item.price - item.sale_price!) / item.price) * 100)
            : 0;

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
                {hasDiscount && (
                  <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                    {discountPct}% OFF
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

                <div className="flex items-baseline gap-1.5 flex-wrap pt-1 border-t border-border/50">
                  <span className="text-xs sm:text-sm font-black text-foreground">
                    {formatCurrency(activePrice)}
                  </span>
                  {hasDiscount && (
                    <span className="text-[10px] text-foreground-secondary line-through">
                      {formatCurrency(item.price)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
