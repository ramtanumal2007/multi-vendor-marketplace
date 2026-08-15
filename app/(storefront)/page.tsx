"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
  Star, 
  ShieldCheck, 
  Truck, 
  RefreshCw, 
  Zap, 
  TrendingUp, 
  Store as StoreIcon, 
  Sparkles,
  Tag,
  Clock,
  Flame,
  Award
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { TopCategoryNav } from "@/components/storefront/TopCategoryNav";
import { ProductCarousel } from "@/components/storefront/ProductCarousel";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { useCart } from "@/lib/context/CartContext";
import { 
  fetchMerchandisingSignals, 
  rankProducts, 
  MerchandisedProduct, 
  SectionMerchandisingRule 
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

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url?: string;
  sort_order?: number;
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
  bgGradient: string;
}

interface HomepageConfig {
  special_collection?: {
    title: string;
    subtitle: string;
    banner_url: string;
    is_active: boolean;
    cards: SpecialCollectionCard[];
  };
  in_the_spotlight?: {
    title: string;
    subtitle: string;
    is_active: boolean;
    cards: SpotlightCard[];
  };
  section_rules?: Record<string, SectionMerchandisingRule>;
}

interface CategoryProductGroup {
  category: Category;
  products: MerchandisedProduct[];
}

const CATEGORY_IMAGE_FALLBACKS: Record<string, string> = {
  "electronics": "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80",
  "mens-fashion": "https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=400&q=80",
  "womens-fashion": "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=400&q=80",
  "home-living": "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&q=80",
  "beauty-care": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&q=80",
  "footwear": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80",
  "accessories": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80",
  "sports-fitness": "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400&q=80",
  "toys-baby": "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400&q=80",
  "hand-craft": "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400&q=80",
  "grocery-food": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80",
  "books-stationery": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80",
};

export default function Homepage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { addToast } = useToast();
  const { addItem } = useCart();
  const supabase = createClient();
  
  // Data States
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dealsOfDay, setDealsOfDay] = useState<MerchandisedProduct[]>([]);
  const [topSelection, setTopSelection] = useState<MerchandisedProduct[]>([]);
  const [trendingNow, setTrendingNow] = useState<MerchandisedProduct[]>([]);
  const [categoryProductGroups, setCategoryProductGroups] = useState<CategoryProductGroup[]>([]);
  const [homepageConfig, setHomepageConfig] = useState<HomepageConfig | null>(null);
  
  // Auth & Personalization state
  const [userName, setUserName] = useState<string | null>(null);
  const [personalizedProducts, setPersonalizedProducts] = useState<MerchandisedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Auto slide timer for hero banner
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Fetch Homepage Data from Supabase
  useEffect(() => {
    async function fetchHomepageData() {
      setIsLoading(true);

      // Check current logged in user
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .single();
        if (profile?.full_name) {
          setUserName(profile.full_name.split(" ")[0]);
        }
      }

      // Parallel data fetching from Supabase
      const [
        heroRes,
        catsRes,
        productsRes,
        configRes
      ] = await Promise.all([
        supabase.from("hero_slides").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("categories").select("*").order("sort_order", { ascending: true }),
        supabase.from("products").select("*, product_images(image_url), categories(id, name, slug)").eq("status", "active").order("created_at", { ascending: false }).limit(40),
        supabase.from("page_seo").select("meta_description").eq("page_slug", "homepage_config").single()
      ]);

      if (heroRes.data && heroRes.data.length > 0) {
        setHeroSlides(heroRes.data);
      }

      if (catsRes.data) {
        setCategories(catsRes.data);
      }

      let parsedConfig: HomepageConfig | null = null;
      if (configRes.data?.meta_description) {
        try {
          parsedConfig = JSON.parse(configRes.data.meta_description);
          setHomepageConfig(parsedConfig);
        } catch (e) {
          console.error("Error parsing homepage_config:", e);
        }
      }

      if (productsRes.data && productsRes.data.length > 0) {
        const allProducts = productsRes.data as MerchandisedProduct[];
        const productIds = allProducts.map((p) => p.id);

        // Fetch real ranking signals (sales, reviews, wishlist counts)
        const signalsMap = await fetchMerchandisingSignals(supabase, productIds);

        // Section Rules from Admin Config or default
        const rules = parsedConfig?.section_rules || {};

        // 1. Deals of the Day ranking
        const dealsRanked = rankProducts(allProducts, signalsMap, "deals", {
          min_discount: 5,
          max_products: 10,
          ...rules["deals"]
        });
        setDealsOfDay(dealsRanked.length > 0 ? dealsRanked : allProducts.slice(0, 8));

        // 2. Trending Now ranking
        const trendingRanked = rankProducts(allProducts, signalsMap, "trending", {
          max_products: 10,
          ...rules["trending"]
        });
        setTrendingNow(trendingRanked);

        // 3. Top Selection ranking
        const topRanked = rankProducts(allProducts, signalsMap, "top_selection", {
          max_products: 8,
          ...rules["top_selection"]
        });
        setTopSelection(topRanked);

        // 4. Personalized Products
        setPersonalizedProducts(trendingRanked.slice(0, 8));

        // 5. Category-wise product rows ranking
        if (catsRes.data) {
          const groups: CategoryProductGroup[] = [];
          catsRes.data.forEach((cat: Category) => {
            const catProducts = allProducts.filter((p) => p.category_id === cat.id);
            if (catProducts.length > 0) {
              const rankedCatProducts = rankProducts(catProducts, signalsMap, "category", {
                max_products: 8,
                ...rules[`cat_${cat.slug}`]
              });
              groups.push({ category: cat, products: rankedCatProducts });
            }
          });
          setCategoryProductGroups(groups);
        }
      }

      setIsLoading(false);
    }

    fetchHomepageData();
  }, [supabase]);

  const ProductSkeleton = () => (
    <div className="flex flex-col gap-3 p-3 rounded-2xl border border-border/40 bg-background min-w-[170px] md:min-w-[220px]">
      <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4" />
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/2" />
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/4 mt-auto" />
    </div>
  );

  return (
    <div className="flex-1 w-full pb-24 bg-background overflow-x-hidden">
      
      {/* 2. TOP CATEGORY NAVIGATION */}
      <TopCategoryNav />

      {/* 3. MAIN HERO BANNER */}
      <section className="px-4 md:px-12 max-w-[1440px] mx-auto mt-4 md:mt-6">
        <div className="relative h-[280px] sm:h-[360px] md:h-[480px] w-full rounded-3xl overflow-hidden shadow-lg border border-border/40 group">
          {heroSlides.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7 }}
                className="absolute inset-0 h-full w-full"
              >
                <Image
                  src={heroSlides[currentSlide]?.image_url || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1974&q=80"}
                  alt={heroSlides[currentSlide]?.heading || "Hero Banner"}
                  fill
                  priority
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
          )}

          {/* Banner Hero Text */}
          {heroSlides.length > 0 && (
            <div className="absolute inset-0 flex items-center z-10 p-6 md:p-14 pointer-events-none">
              <div className="max-w-2xl flex flex-col gap-3 md:gap-5 text-white pointer-events-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`hero-text-${currentSlide}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col gap-2 md:gap-3"
                  >
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md w-fit text-white">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> Exclusive Marketplace Deals
                    </span>
                    <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold leading-tight font-sans tracking-tight">
                      {heroSlides[currentSlide]?.heading}
                    </h1>
                    <p className="text-xs sm:text-base md:text-xl text-white/90 max-w-lg font-normal">
                      {heroSlides[currentSlide]?.subheading}
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-2 md:mt-4">
                  <Link href={heroSlides[currentSlide]?.cta_link || "/products"}>
                    <Button variant="primary" className="bg-accent hover:bg-accent/90 text-white font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm md:text-base">
                      {heroSlides[currentSlide]?.cta_text || "Shop Now"}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
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
                    className={`h-2 rounded-full transition-all duration-300 ${currentSlide === i ? "bg-white w-7" : "bg-white/50 w-2 hover:bg-white/80"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 4. PREMIUM SHOP BY CATEGORY (Circular Image Cards) */}
      <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-foreground">
              <StoreIcon className="w-6 h-6 text-accent" /> Shop by Category
            </h2>
            <p className="text-xs md:text-sm text-foreground-secondary mt-1">Explore our wide selection of top verified marketplace departments</p>
          </div>
          <Link href="/products" className="text-xs md:text-sm font-semibold text-accent hover:underline flex items-center gap-1">
            See All Categories <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 gap-4 md:gap-6">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="w-16 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ))
          ) : (
            categories.slice(0, 12).map((cat) => {
              const catImage = cat.image_url || CATEGORY_IMAGE_FALLBACKS[cat.slug] || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80";

              return (
                <Link
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  className="group flex flex-col items-center text-center gap-2.5"
                >
                  <div className="relative w-20 h-20 sm:w-22 sm:h-22 md:w-24 md:h-24 rounded-full p-1 bg-background border-2 border-border/80 group-hover:border-accent shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-105 overflow-hidden">
                    <div className="relative w-full h-full rounded-full overflow-hidden">
                      <Image
                        src={catImage}
                        alt={cat.name}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                  </div>
                  <span className="text-xs md:text-sm font-semibold text-foreground group-hover:text-accent line-clamp-1 transition-colors">
                    {cat.name}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </section>

      {/* 5. PERSONALIZED / RECENTLY VIEWED */}
      <section className="py-8 px-4 md:px-12 max-w-[1440px] mx-auto bg-gradient-to-r from-accent/5 via-transparent to-accent/5 rounded-3xl my-6 border border-accent/10">
        <div className="flex justify-between items-end mb-6">
          <div>
            <span className="text-xs font-bold text-accent uppercase tracking-wider">Recommended for you</span>
            <h2 className="text-xl md:text-3xl font-bold text-foreground mt-0.5">
              {userName ? `${userName}, still looking for these?` : "You May Also Like"}
            </h2>
          </div>
          <Link href="/products" className="text-xs md:text-sm font-semibold text-accent hover:underline">Explore</Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4">
            {Array(4).fill(0).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <ProductCarousel>
            {personalizedProducts.map((product) => {
              const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                ? product.sale_price
                : product.price;

              return (
                <div key={product.id} className="min-w-[170px] max-w-[170px] md:min-w-[230px] md:max-w-[230px] snap-start">
                  <ProductCard
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart", type: "success" });
                    }}
                  />
                </div>
              );
            })}
          </ProductCarousel>
        )}
      </section>

      {/* 6. FESTIVAL / SPECIAL COLLECTION */}
      {homepageConfig?.special_collection?.is_active && (
        <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto my-6">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-orange-600 via-amber-600 to-amber-700 text-white p-6 md:p-12 shadow-xl">
            <div className="relative z-10">
              <span className="uppercase tracking-widest text-xs font-bold bg-white/20 px-3 py-1 rounded-full">
                Seasonal Campaign
              </span>
              <h2 className="text-2xl md:text-5xl font-extrabold mt-3 tracking-tight">
                {homepageConfig.special_collection.title}
              </h2>
              <p className="text-white/90 text-sm md:text-lg mt-2 max-w-2xl">
                {homepageConfig.special_collection.subtitle}
              </p>

              {/* Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-8">
                {homepageConfig.special_collection.cards.map((card, i) => (
                  <Link
                    key={i}
                    href={card.link}
                    className="group bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-2xl p-3 flex flex-col items-center text-center transition-all hover:scale-[1.03]"
                  >
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-white/10">
                      <Image
                        src={card.image}
                        alt={card.title}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                    <span className="text-xs md:text-sm font-bold line-clamp-1">{card.title}</span>
                    <span className="text-[11px] text-yellow-300 font-semibold mt-1">{card.offer}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 7. DEALS OF THE DAY */}
      <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto my-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 text-red-500 rounded-xl">
              <Flame className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="text-xl md:text-3xl font-extrabold text-foreground flex items-center gap-2">
                Deals of the Day
              </h2>
              <p className="text-xs md:text-sm text-foreground-secondary">Ranked by highest discount percentage & stock availability</p>
            </div>
          </div>
          <Link href="/products" className="text-xs md:text-sm font-semibold text-accent hover:underline">
            View All Deals
          </Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4">
            {Array(4).fill(0).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <ProductCarousel>
            {dealsOfDay.map((product) => {
              const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                ? product.sale_price
                : product.price;

              return (
                <div key={product.id} className="min-w-[170px] max-w-[170px] md:min-w-[240px] md:max-w-[240px] snap-start">
                  <ProductCard
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart", type: "success" });
                    }}
                  />
                </div>
              );
            })}
          </ProductCarousel>
        )}
      </section>

      {/* 8. TOP SELECTION */}
      <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <Award className="w-6 h-6 text-yellow-500" /> Top Selection
            </h2>
            <p className="text-xs md:text-sm text-foreground-secondary mt-1">Highest rated & top-performing curated items</p>
          </div>
          <Link href="/products" className="text-xs md:text-sm font-semibold text-accent hover:underline">Explore All</Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4">
            {Array(4).fill(0).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <ProductCarousel>
            {topSelection.map((product) => {
              const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                ? product.sale_price
                : product.price;

              return (
                <div key={product.id} className="min-w-[170px] max-w-[170px] md:min-w-[240px] md:max-w-[240px] snap-start">
                  <ProductCard
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart", type: "success" });
                    }}
                  />
                </div>
              );
            })}
          </ProductCarousel>
        )}
      </section>

      {/* 9. IN THE SPOTLIGHT */}
      {homepageConfig?.in_the_spotlight?.is_active && (
        <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto my-6">
          <div className="mb-6">
            <h2 className="text-xl md:text-3xl font-bold text-foreground flex items-center gap-2">
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

      {/* 10. TRENDING NOW */}
      <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-500" /> Trending Now
            </h2>
            <p className="text-xs md:text-sm text-foreground-secondary mt-1">Ranked by sales volume + recent order frequency</p>
          </div>
          <Link href="/products" className="text-xs md:text-sm font-semibold text-accent hover:underline">View All</Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4">
            {Array(4).fill(0).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <ProductCarousel>
            {trendingNow.map((product) => {
              const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                ? product.sale_price
                : product.price;

              return (
                <div key={product.id} className="min-w-[170px] max-w-[170px] md:min-w-[240px] md:max-w-[240px] snap-start">
                  <ProductCard
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart", type: "success" });
                    }}
                  />
                </div>
              );
            })}
          </ProductCarousel>
        )}
      </section>

      {/* 11. CATEGORY-WISE PRODUCT ROWS */}
      {categoryProductGroups.map((group) => (
        <section key={group.category.id} className="py-8 px-4 md:px-12 max-w-[1440px] mx-auto">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                <Tag className="w-5 h-5 text-accent" /> {group.category.name}
              </h2>
              <p className="text-xs text-foreground-secondary mt-0.5">Ranked selection from {group.category.name}</p>
            </div>
            <Link href={`/categories/${group.category.slug}`} className="text-xs font-semibold text-accent hover:underline flex items-center gap-1">
              View Category <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <ProductCarousel>
            {group.products.map((product) => {
              const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                ? product.sale_price
                : product.price;

              return (
                <div key={product.id} className="min-w-[170px] max-w-[170px] md:min-w-[230px] md:max-w-[230px] snap-start">
                  <ProductCard
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart", type: "success" });
                    }}
                  />
                </div>
              );
            })}
          </ProductCarousel>
        </section>
      ))}

      {/* 12. RECENTLY VIEWED */}
      <section className="py-10 px-4 md:px-12 max-w-[1440px] mx-auto">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5 text-foreground-secondary" /> Recently Viewed Items
            </h2>
          </div>
          <Link href="/products" className="text-xs font-semibold text-accent hover:underline">Explore More</Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4">
            {Array(4).fill(0).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <ProductCarousel>
            {topSelection.slice(0, 6).map((product) => {
              const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
                ? product.sale_price
                : product.price;

              return (
                <div key={product.id} className="min-w-[170px] max-w-[170px] md:min-w-[220px] md:max-w-[220px] snap-start">
                  <ProductCard
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => {
                      addItem({
                        id: product.id,
                        productId: product.id,
                        title: product.title,
                        price: effectivePrice,
                        image: product.product_images?.[0]?.image_url || "",
                      });
                      addToast({ title: "Added to Cart", type: "success" });
                    }}
                  />
                </div>
              );
            })}
          </ProductCarousel>
        )}
      </section>

      {/* Trust & Guarantee Banner */}
      <section className="py-12 mt-10 bg-background-secondary/80 border-t border-border">
        <div className="max-w-[1440px] mx-auto px-4 md:px-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-accent shadow-xs">
              <Truck className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base text-foreground">Fast Local Delivery</h4>
            <p className="text-xs text-foreground-secondary">Direct from verified local stores</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-emerald-500 shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base text-foreground">100% Safe Payments</h4>
            <p className="text-xs text-foreground-secondary">Protected SSL encryption</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-purple-500 shadow-xs">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base text-foreground">Hassle-Free Returns</h4>
            <p className="text-xs text-foreground-secondary">Easy customer return policy</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-yellow-500 shadow-xs">
              <Star className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base text-foreground">Verified Sellers</h4>
            <p className="text-xs text-foreground-secondary">Authentic products only</p>
          </div>
        </div>
      </section>
    </div>
  );
}
