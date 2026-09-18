"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import {
  LayoutGrid,
  Shirt,
  Sparkles,
  BookOpen,
  Smartphone,
  Watch,
  Footprints,
  ShoppingBag,
  Palette,
  Home,
  Dumbbell,
  Gamepad2,
  Tag,
  ChevronLeft,
  ChevronRight,
  Smile
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategoryStyleConfig {
  icon: React.ElementType;
  iconBg: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyleConfig> = {
  "all-products": {
    icon: LayoutGrid,
    iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400",
  },
  "mens-fashion": {
    icon: Shirt,
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
  },
  "womens-fashion": {
    icon: Sparkles,
    iconBg: "bg-pink-50 text-pink-600 dark:bg-pink-950/60 dark:text-pink-400",
  },
  "electronics": {
    icon: Smartphone,
    iconBg: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400",
  },
  "grocery-food": {
    icon: ShoppingBag,
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  },
  "home-living": {
    icon: Home,
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
  },
  "beauty-care": {
    icon: Smile,
    iconBg: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/60 dark:text-fuchsia-400",
  },
  "footwear": {
    icon: Footprints,
    iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400",
  },
  "accessories": {
    icon: Watch,
    iconBg: "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400",
  },
  "books-stationery": {
    icon: BookOpen,
    iconBg: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400",
  },
  "sports-fitness": {
    icon: Dumbbell,
    iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400",
  },
  "toys-baby": {
    icon: Gamepad2,
    iconBg: "bg-amber-50 text-amber-500 dark:bg-amber-950/60 dark:text-amber-400",
  },
  "hand-craft": {
    icon: Palette,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400",
  },
};

const DEFAULT_CATEGORY_STYLE: CategoryStyleConfig = {
  icon: Tag,
  iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function TopCategoryNav() {
  const pathname = usePathname();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const supabase = createClient();

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    async function fetchCategories() {
      setIsLoading(false);
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (data && data.length > 0) {
        setCategories(data);
      }
    }
    fetchCategories();
  }, [supabase]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, categories]);

  // Stable active element visibility check without aggressive jumping
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const activeKey = pathname === "/products" 
      ? "all-products" 
      : pathname.startsWith("/categories/") 
        ? pathname.replace("/categories/", "") 
        : "";
    
    if (!activeKey) return;

    const activeEl = itemRefs.current[activeKey];
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();

    // Check if fully visible within container with buffer
    const isVisible = itemRect.left >= containerRect.left + 20 && itemRect.right <= containerRect.right - 20;
    if (!isVisible) {
      if (itemRect.left < containerRect.left + 20) {
        const offset = itemRect.left - containerRect.left - 24;
        container.scrollBy({ left: offset, behavior: "smooth" });
      } else if (itemRect.right > containerRect.right - 20) {
        const offset = itemRect.right - containerRect.right + 24;
        container.scrollBy({ left: offset, behavior: "smooth" });
      }
    }
  }, [pathname]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = 240;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  const isAllActive = pathname === "/products";

  return (
    <nav 
      aria-label="Category Navigation"
      className="w-full h-[46px] md:h-[50px] min-h-[46px] md:min-h-[50px] bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center overflow-hidden select-none"
    >
      <div className="max-w-[1440px] mx-auto px-2 sm:px-4 md:px-12 h-full flex items-center relative w-full">
        {/* Left Scroll Control */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-1 md:left-2 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs transition-transform flex items-center justify-center hover:scale-105 active:scale-95 outline-none focus:outline-none"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Scrollable Category List */}
        <div 
          ref={scrollRef}
          className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto h-full scroll-smooth w-full select-none px-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* All Products Item */}
          <Link
            ref={(el) => { itemRefs.current["all-products"] = el; }}
            href="/products"
            scroll={false}
            className={cn(
              "group flex items-center gap-2 h-full px-2.5 sm:px-3 text-[12px] md:text-[12.5px] whitespace-nowrap transition-colors duration-150 shrink-0 relative select-none border-b-2 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
              isAllActive
                ? "font-semibold text-slate-900 dark:text-white border-accent dark:border-accent"
                : "font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent"
            )}
          >
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105",
              CATEGORY_STYLES["all-products"].iconBg
            )}>
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            </div>
            <span>All Products</span>
          </Link>

          {isLoading ? (
            Array(8).fill(0).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 h-full px-3 shrink-0"
              >
                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="w-16 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ))
          ) : (
            categories.map((cat) => {
              const style = CATEGORY_STYLES[cat.slug] || DEFAULT_CATEGORY_STYLE;
              const IconComponent = style.icon;
              const isActive = pathname === `/categories/${cat.slug}`;

              return (
                <Link
                  key={cat.id}
                  ref={(el) => { itemRefs.current[cat.slug] = el; }}
                  href={`/categories/${cat.slug}`}
                  scroll={false}
                  className={cn(
                    "group flex items-center gap-2 h-full px-2.5 sm:px-3 text-[12px] md:text-[12.5px] whitespace-nowrap transition-colors duration-150 shrink-0 relative select-none border-b-2 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                    isActive
                      ? "font-semibold text-slate-900 dark:text-white border-accent dark:border-accent"
                      : "font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105",
                    style.iconBg
                  )}>
                    <IconComponent className="w-3.5 h-3.5 shrink-0" />
                  </div>
                  <span>{cat.name}</span>
                </Link>
              );
            })
          )}
        </div>

        {/* Right Scroll Control */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-1 md:right-2 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs transition-transform flex items-center justify-center hover:scale-105 active:scale-95 outline-none focus:outline-none"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </nav>
  );
}
