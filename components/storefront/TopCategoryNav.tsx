"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import {
  LayoutGrid,
  Sparkles,
  BookOpen,
  Smartphone,
  Watch,
  Footprints,
  ShoppingBag,
  Palette,
  Home,
  User,
  Dumbbell,
  Gamepad2,
  Tag,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
}

const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  "electronics": Smartphone,
  "mens-fashion": User,
  "womens-fashion": Sparkles,
  "home-living": Home,
  "beauty-care": Sparkles,
  "footwear": Footprints,
  "accessories": Watch,
  "sports-fitness": Dumbbell,
  "toys-baby": Gamepad2,
  "hand-craft": Palette,
  "grocery-food": ShoppingBag,
  "books-stationery": BookOpen,
};

export function TopCategoryNav() {
  const pathname = usePathname();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
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

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.7;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  return (
    <nav 
      aria-label="Category Navigation"
      className="w-full bg-background/95 backdrop-blur-md border-b border-border sticky top-[60px] z-30 shadow-2xs overflow-hidden"
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-12 flex items-center relative group">
        {/* Left Chevron Control */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-1 z-20 p-1.5 rounded-full bg-background/90 hover:bg-background text-foreground border border-border shadow-xs transition-all flex items-center justify-center"
            aria-label="Scroll category list left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Scrollable Category Bar */}
        <div 
          ref={scrollRef}
          className="flex items-center gap-1.5 overflow-x-auto py-2 no-scrollbar scroll-smooth w-full"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* All Products */}
          <Link
            href="/products"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0 border",
              pathname === "/products"
                ? "bg-accent text-white border-accent shadow-xs scale-105"
                : "bg-background-secondary/60 text-foreground-secondary hover:text-foreground hover:bg-background-secondary border-border/60"
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>All Products</span>
          </Link>

          {isLoading ? (
            Array(8).fill(0).map((_, i) => (
              <div
                key={i}
                className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse shrink-0"
              />
            ))
          ) : (
            categories.map((cat) => {
              const IconComponent = CATEGORY_ICON_MAP[cat.slug] || Tag;
              const isActive = pathname === `/categories/${cat.slug}`;

              return (
                <Link
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0 border",
                    isActive
                      ? "bg-accent text-white border-accent shadow-xs scale-105"
                      : "bg-background-secondary/60 text-foreground-secondary hover:text-foreground hover:bg-background-secondary hover:border-accent/40 border-border/60"
                  )}
                >
                  <IconComponent className={cn("w-3.5 h-3.5", isActive ? "text-white" : "text-accent")} />
                  <span>{cat.name}</span>
                </Link>
              );
            })
          )}
        </div>

        {/* Right Chevron Control */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-1 z-20 p-1.5 rounded-full bg-background/90 hover:bg-background text-foreground border border-border shadow-xs transition-all flex items-center justify-center"
            aria-label="Scroll category list right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </nav>
  );
}
