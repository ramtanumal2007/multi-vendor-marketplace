"use client";

import React, { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  Truck, 
  RefreshCw, 
  Zap, 
  Sparkles,
  Shirt,
  Apple,
  Home,
  HeartHandshake,
  Footprints,
  Dumbbell,
  Smartphone,
  CheckCircle2,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { useCart } from "@/lib/context/CartContext";
import { 
  fetchMerchandisingSignals, 
  rankProducts, 
  MerchandisedProduct 
} from "@/lib/merchandising";

interface HeroSlide {
  id: string;
  image_url: string;
  mobile_image_url?: string;
  heading: string;
  subheading: string;
  cta_text: string;
  cta_link: string;
  sort_order: number;
  is_active: boolean;
}

interface SpecialCollectionCard {
  title: string;
  image: string;
  link: string;
  offer: string;
}

interface SpotlightCard {
  title: string;
  subtitle: string;
  image: string;
  link: string;
  badge: string;
}

interface HomepageConfig {
  special_collection?: {
    is_active: boolean;
    title: string;
    subtitle: string;
    badge: string;
    cards: SpecialCollectionCard[];
  };
  in_the_spotlight?: {
    is_active: boolean;
    title: string;
    subtitle: string;
    cards: SpotlightCard[];
  };
}

// Fallback Hero Slides
const FALLBACK_HERO_SLIDES: HeroSlide[] = [
  {
    id: "default-1",
    heading: "The Festival Mega Carnival",
    subheading: "Flat 40%–70% off across verified local & national brands.",
    cta_text: "Shop Carnival Deals",
    cta_link: "/products",
    image_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1600&q=80",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "default-2",
    heading: "Next-Gen Tech & Electronics",
    subheading: "Noise-cancelling headphones, smart wearables & creator gear.",
    cta_text: "Explore Tech Hub",
    cta_link: "/categories/electronics",
    image_url: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=1600&q=80",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "default-3",
    heading: "Authentic Designer Apparel",
    subheading: "Curated Indian textiles, luxury western & streetwear.",
    cta_text: "Discover Fashion",
    cta_link: "/categories/mens-fashion",
    image_url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&q=80",
    sort_order: 3,
    is_active: true,
  },
];

// Curated Category Showcase (8 Premium Departments)
const MARKETPLACE_CATEGORIES = [
  {
    name: "Men's Fashion",
    slug: "mens-fashion",
    icon: Shirt,
    description: "Apparel, formals & everyday",
    image: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=600&q=80",
  },
  {
    name: "Women's Fashion",
    slug: "womens-fashion",
    icon: Sparkles,
    description: "Ethnic, western & couture",
    image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=600&q=80",
  },
  {
    name: "Electronics & Gadgets",
    slug: "electronics",
    icon: Smartphone,
    description: "Audio, phones & smart tech",
    image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&q=80",
  },
  {
    name: "Grocery & Food",
    slug: "grocery-food",
    icon: Apple,
    description: "Daily staples, snacks & fresh",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80",
  },
  {
    name: "Home & Living",
    slug: "home-living",
    icon: Home,
    description: "Decor, essentials & kitchen",
    image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80",
  },
  {
    name: "Beauty & Personal Care",
    slug: "beauty",
    icon: HeartHandshake,
    description: "Skincare, wellness & scents",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80",
  },
  {
    name: "Footwear",
    slug: "footwear",
    icon: Footprints,
    description: "Sneakers, formals & comfort",
    image: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&q=80",
  },
  {
    name: "Sports & Fitness",
    slug: "sports-fitness",
    icon: Dumbbell,
    description: "Activewear, gear & training",
    image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&q=80",
  },
];

type DiscoverTabId = "trending" | "new_arrivals" | "best_sellers" | "recommended";

interface DiscoverTabMeta {
  id: DiscoverTabId;
  label: string;
  icon: string;
}

const DISCOVER_TABS: DiscoverTabMeta[] = [
  { id: "trending", label: "Trending", icon: "🔥" },
  { id: "new_arrivals", label: "New Arrivals", icon: "✨" },
  { id: "best_sellers", label: "Best Sellers", icon: "🏆" },
  { id: "recommended", label: "Recommended", icon: "💡" },
];

export default function Homepage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { addToast } = useToast();
  const { addItem } = useCart();
  const supabase = createClient();
  
  // Data States
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [trendingNow, setTrendingNow] = useState<MerchandisedProduct[]>([]);
  const [newArrivals, setNewArrivals] = useState<MerchandisedProduct[]>([]);
  const [bestSellers, setBestSellers] = useState<MerchandisedProduct[]>([]);
  const [recommended, setRecommended] = useState<MerchandisedProduct[]>([]);
  const [homepageConfig, setHomepageConfig] = useState<HomepageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Discover Products Tab Selection
  const [activeDiscoverTab, setActiveDiscoverTab] = useState<DiscoverTabId>("trending");

  // Auto slide timer for hero banner
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Fetch Homepage Data from Supabase with Strict Deduplication
  useEffect(() => {
    async function fetchHomepageData() {
      setIsLoading(true);

      const [
        heroRes,
        productsRes,
        configRes
      ] = await Promise.all([
        supabase.from("hero_slides").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("products").select("*, product_images(image_url), categories(id, name, slug), stores(id, name)").eq("status", "active").order("created_at", { ascending: false }).limit(40),
        supabase.from("page_seo").select("meta_description").eq("page_slug", "homepage_config").single()
      ]);

      if (heroRes.data && heroRes.data.length > 0) {
        setHeroSlides(heroRes.data);
      } else {
        setHeroSlides(FALLBACK_HERO_SLIDES);
      }

      if (configRes.data?.meta_description) {
        try {
          const parsedConfig = JSON.parse(configRes.data.meta_description);
          setHomepageConfig(parsedConfig);
        } catch (e) {
          console.error("Error parsing homepage_config:", e);
        }
      }

      if (productsRes.data && productsRes.data.length > 0) {
        const allProducts = productsRes.data as MerchandisedProduct[];
        const productIds = allProducts.map((p) => p.id);

        // Fetch real ranking signals
        const signalsMap = await fetchMerchandisingSignals(supabase, productIds);

        // Smart Strict Deduplication: No product ID repeats across tabs!
        const usedIds = new Set<string>();

        // 1. 🔥 Trending: High order velocity / signals
        const trendingRanked = rankProducts(allProducts, signalsMap, "trending", { max_products: 8 });
        const resolvedTrending = trendingRanked.length > 0 ? trendingRanked.slice(0, 8) : allProducts.slice(0, 8);
        resolvedTrending.forEach((p) => usedIds.add(p.id));
        setTrendingNow(resolvedTrending);

        // 2. ✨ New Arrivals: Chronological by created_at, strictly deduplicated
        const newestCandidates = allProducts
          .filter((p) => !usedIds.has(p.id))
          .sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeB - timeA;
          });
        const resolvedNewest = newestCandidates.length >= 2 ? newestCandidates.slice(0, 8) : allProducts.slice(0, 8);
        resolvedNewest.forEach((p) => usedIds.add(p.id));
        setNewArrivals(resolvedNewest);

        // 3. 🏆 Best Sellers: Top rated & sales volume, strictly deduplicated
        const bestSellerCandidates = allProducts.filter((p) => !usedIds.has(p.id));
        const bestRanked = rankProducts(bestSellerCandidates, signalsMap, "top_selection", { max_products: 8 });
        const resolvedBest = bestRanked.length >= 2 ? bestRanked.slice(0, 8) : (bestSellerCandidates.length > 0 ? bestSellerCandidates.slice(0, 8) : allProducts.slice(0, 8));
        resolvedBest.forEach((p) => usedIds.add(p.id));
        setBestSellers(resolvedBest);

        // 4. 💡 Recommended: Curated selection from remaining items, strictly deduplicated
        const remainingCandidates = allProducts.filter((p) => !usedIds.has(p.id));
        const resolvedRec = remainingCandidates.length >= 2 ? remainingCandidates.slice(0, 8) : allProducts.slice(0, 8);
        setRecommended(resolvedRec);
      }

      setIsLoading(false);
    }

    fetchHomepageData();
  }, [supabase]);

  // Current active products for Discover tab
  const currentTabProducts = useMemo(() => {
    switch (activeDiscoverTab) {
      case "trending":
        return trendingNow;
      case "new_arrivals":
        return newArrivals;
      case "best_sellers":
        return bestSellers;
      case "recommended":
        return recommended;
      default:
        return trendingNow;
    }
  }, [activeDiscoverTab, trendingNow, newArrivals, bestSellers, recommended]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* 1. HERO CAROUSEL */}
      <section className="relative w-full max-w-[1440px] mx-auto pt-3 md:pt-4 px-4 md:px-12">
        <div className="relative w-full h-[320px] sm:h-[400px] md:h-[460px] rounded-3xl overflow-hidden shadow-xl bg-slate-900 group">
          {heroSlides.length > 0 && (
            <div className="relative w-full h-full">
              <Image
                src={heroSlides[currentSlide]?.image_url || FALLBACK_HERO_SLIDES[0].image_url}
                alt={heroSlides[currentSlide]?.heading || "VENDOSMITH Marketplace"}
                fill
                priority
                className="object-cover transition-transform duration-700 ease-out"
                sizes="(max-width: 768px) 100vw, 1440px"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />

              {/* Slide Content */}
              <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-12 md:px-16 text-white max-w-2xl z-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="flex flex-col gap-2 md:gap-3"
                  >
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md w-fit text-white">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Exclusive Marketplace Deals
                    </span>
                    <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
                      {heroSlides[currentSlide]?.heading}
                    </h1>
                    <p className="text-xs sm:text-sm md:text-base text-white/90 max-w-lg font-normal">
                      {heroSlides[currentSlide]?.subheading}
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-4 md:mt-6">
                  <Link href={heroSlides[currentSlide]?.cta_link || "/products"}>
                    <Button variant="primary" className="bg-accent hover:bg-accent/90 text-white font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 text-xs sm:text-sm">
                      {heroSlides[currentSlide]?.cta_text || "Shop Now"}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          {heroSlides.length > 1 && (
            <>
              <button
                onClick={() => setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hidden md:block"
                aria-label="Previous Slide"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentSlide((prev) => (prev + 1) % heroSlides.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hidden md:block"
                aria-label="Next Slide"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div className="absolute bottom-4 right-4 md:bottom-6 md:right-8 flex gap-2 z-20">
                {heroSlides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlide(i)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      currentSlide === i ? "bg-white w-7" : "bg-white/50 w-2 hover:bg-white/80"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 2. VALUE PROPOSITION REASSURANCE BAR */}
      <section className="py-6 px-4 md:px-12 max-w-[1440px] mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3 p-2">
            <div className="p-2.5 rounded-xl bg-accent/10 text-accent shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Fast Express Delivery</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Direct from local & national sellers</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">100% Verified Stores</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Authentic & inspected products</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Hassle-Free Returns</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">7-day replacement guarantee</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Instant UPI & Cards</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Cashfree & COD supported</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PREMIUM CATEGORY SHOWCASE */}
      <section className="py-8 px-4 md:px-12 max-w-[1440px] mx-auto w-full">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-accent uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Browse By Department</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Featured Categories
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Explore authentic collections from certified multi-vendor stores
            </p>
          </div>
          <Link
            href="/products"
            className="hidden sm:inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-accent hover:underline group"
          >
            <span>All Categories</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Desktop: 4-8 visible / Mobile: horizontal snap carousel */}
        <div className="flex sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-x-auto sm:overflow-x-visible pb-3 sm:pb-0 scrollbar-none snap-x snap-mandatory">
          {MARKETPLACE_CATEGORIES.map((cat, idx) => {
            const IconComp = cat.icon;
            return (
              <Link
                key={idx}
                href={`/categories/${cat.slug}`}
                className="group relative flex flex-col justify-between bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3.5 sm:p-4 hover:shadow-xl hover:border-accent/40 dark:hover:border-accent/40 transition-all duration-300 min-w-[220px] sm:min-w-0 snap-start hover:-translate-y-1"
              >
                {/* Image Container with zoom */}
                <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden mb-3 bg-slate-100 dark:bg-slate-800">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-108 transition-transform duration-500 ease-out"
                    sizes="(max-width: 640px) 220px, (max-width: 1024px) 33vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                  {/* Category Floating Icon */}
                  <div className="absolute top-2.5 left-2.5 p-2 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-xs text-accent group-hover:scale-110 transition-transform">
                    <IconComp className="w-4 h-4" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 group-hover:text-accent transition-colors line-clamp-1">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                    {cat.description}
                  </p>
                </div>

                {/* Explore Link with micro-interaction */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-accent">
                  <span>Explore</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1.5 transition-transform duration-200" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 4. THE ONE STRONG EDITORIAL "DISCOVER PRODUCTS" SECTION */}
      <section className="py-12 px-4 md:px-12 max-w-[1440px] mx-auto w-full my-2">
        {/* Editorial Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8 border-b border-slate-200/80 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1 bg-accent/10 text-accent rounded-lg">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-extrabold text-accent uppercase tracking-widest">
                Curated Marketplace Selection
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              DISCOVER PRODUCTS
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Explore trending products, fresh arrivals and customer favourites.
            </p>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/90 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 overflow-x-auto scrollbar-none self-start md:self-auto">
            {DISCOVER_TABS.map((tab) => {
              const isSelected = activeDiscoverTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveDiscoverTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                    isSelected
                      ? "bg-accent text-white shadow-md shadow-accent/25 scale-[1.02]"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Smooth Tab Content Transition */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array(8)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="flex flex-col gap-3 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/3" />
                </div>
              ))}
          </div>
        ) : currentTabProducts.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Package className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No products found in this tab.</p>
            <p className="text-xs text-slate-400 mt-1">Check back soon for new additions.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeDiscoverTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"
            >
              {currentTabProducts.map((product) => {
                const effectivePrice =
                  product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                    ? product.sale_price
                    : product.price;

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    isNew={activeDiscoverTab === "new_arrivals"}
                    primaryImage={product.product_images?.[0]?.image_url || "/placeholder.jpg"}
                    storeName={product.stores?.name || "Verified Store"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart ✓", type: "success" });
                    }}
                  />
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}

        {/* View All Products CTA */}
        <div className="mt-10 flex justify-center">
          <Link href="/products">
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl px-8 font-bold text-xs sm:text-sm hover:border-accent hover:text-accent group shadow-2xs"
            >
              <span>Explore All Products in Catalog</span>
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
      </section>

      {/* 5. SPOTLIGHT CARDS (If configured) */}
      {homepageConfig?.in_the_spotlight?.is_active && (
        <section className="py-8 px-4 md:px-12 max-w-[1440px] mx-auto w-full my-4">
          <div className="mb-6">
            <h2 className="text-xl md:text-3xl font-extrabold text-foreground flex items-center gap-2">
              <Zap className="w-6 h-6 text-amber-500" /> {homepageConfig.in_the_spotlight.title}
            </h2>
            <p className="text-xs md:text-sm text-foreground-secondary mt-1">{homepageConfig.in_the_spotlight.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {homepageConfig.in_the_spotlight.cards.map((card, i) => (
              <Link
                key={i}
                href={card.link}
                className="group relative h-[220px] rounded-3xl overflow-hidden shadow-md flex flex-col justify-end p-6 text-white transition-all hover:scale-[1.02]"
              >
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                
                <div className="relative z-10 flex flex-col gap-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md w-fit text-yellow-300">
                    {card.badge}
                  </span>
                  <h3 className="text-lg font-bold leading-tight">{card.title}</h3>
                  <p className="text-xs text-white/80 line-clamp-1">{card.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 6. TRUST & VERIFICATION FOOTNOTE */}
      <section className="py-12 px-4 md:px-12 max-w-[1440px] mx-auto w-full text-center">
        <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            India&apos;s Trusted Multi-Vendor E-Commerce Marketplace
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mt-1">
            Shop directly from verified Indian merchants with automated order tracking, invoice generation, Cashfree payments, and dedicated customer support.
          </p>
        </div>
      </section>
    </div>
  );
}
