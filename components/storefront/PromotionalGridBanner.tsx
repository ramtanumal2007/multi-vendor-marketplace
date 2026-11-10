"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

interface PromotionalItem {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  badgeColor: string;
}

const DEFAULT_PROMOS: PromotionalItem[] = [
  {
    id: "promo-1",
    badge: "FESTIVAL CARNIVAL",
    title: "Up to 60% OFF Verified Stores",
    subtitle: "Explore deals on Indian artisanal brands, everyday essentials & festive apparel.",
    ctaText: "Shop Deals",
    ctaLink: "/products?sort=price_asc",
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&q=80",
    badgeColor: "bg-amber-500 text-slate-950",
  },
  {
    id: "promo-2",
    badge: "100% VERIFIED MERCHANTS",
    title: "Direct From Local Creators & Artisans",
    subtitle: "Every store is inspected for authenticity, speed, and customer satisfaction.",
    ctaText: "Explore Stores",
    ctaLink: "/stores",
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80",
    badgeColor: "bg-emerald-500 text-white",
  },
  {
    id: "promo-3",
    badge: "FRESH ARRIVALS",
    title: "Next-Gen Tech & Creator Gear",
    subtitle: "Headphones, wearables, smart home devices, and creator accessories.",
    ctaText: "Browse Tech",
    ctaLink: "/categories/electronics",
    image: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=1200&q=80",
    badgeColor: "bg-blue-600 text-white",
  },
];

interface PromotionalGridBannerProps {
  bannerIndex?: number;
  promo?: PromotionalItem;
  className?: string;
}

export function PromotionalGridBanner({
  bannerIndex = 0,
  promo,
  className = "",
}: PromotionalGridBannerProps) {
  const activePromo = promo || DEFAULT_PROMOS[bannerIndex % DEFAULT_PROMOS.length];

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden shadow-md group border border-slate-200/80 dark:border-slate-800 ${className}`}
    >
      <div className="relative w-full h-32 sm:h-36 md:h-44 bg-slate-900">
        {/* Background Image with subtle zoom on hover */}
        <Image
          src={activePromo.image}
          alt={activePromo.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-65 dark:opacity-45"
          sizes="(max-width: 768px) 100vw, 1200px"
        />

        {/* Gradient Overlay for high text contrast */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-900/40" />

        {/* Banner Content */}
        <div className="absolute inset-0 flex flex-col justify-center px-4 sm:px-8 md:px-12 text-white z-10 max-w-xl">
          <div className="flex items-center gap-1.5 mb-1 sm:mb-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider ${activePromo.badgeColor}`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>{activePromo.badge}</span>
            </span>
          </div>

          <h3 className="text-sm sm:text-lg md:text-xl font-extrabold leading-snug tracking-tight text-white line-clamp-1 sm:line-clamp-none">
            {activePromo.title}
          </h3>

          <p className="text-[11px] sm:text-xs text-slate-300 font-normal mt-0.5 sm:mt-1 line-clamp-1 max-w-md hidden sm:block">
            {activePromo.subtitle}
          </p>

          <div className="mt-2 sm:mt-3">
            <Link
              href={activePromo.ctaLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold bg-accent hover:bg-accent/90 text-white shadow-md transition-transform active:scale-95 group/btn w-fit"
            >
              <span>{activePromo.ctaText}</span>
              <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
