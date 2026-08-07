"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Star, ShieldCheck, Truck, RefreshCw, Zap, TrendingUp, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { useCart } from "@/lib/context/CartContext";

const HERO_BANNERS = [
  {
    id: "1",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1974&auto=format&fit=crop",
    heading: "Fresh Groceries Delivered Fast",
    subheading: "Everything you need, right to your door.",
    ctaText: "Shop Essentials",
    ctaLink: "/products?category=grocery",
    color: "bg-brand-grocery"
  },
  {
    id: "2",
    image: "https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=2070&auto=format&fit=crop",
    heading: "Latest Tech Gadgets",
    subheading: "Upgrade your lifestyle with our premium electronics.",
    ctaText: "Explore Tech",
    ctaLink: "/products?category=electronics",
    color: "bg-brand-electronics"
  }
];

export default function Homepage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { addToast } = useToast();
  const { addItem } = useCart();
  const supabase = createClient();
  
  const [categories, setCategories] = useState<any[]>([]);
  const [popularProducts, setPopularProducts] = useState<any[]>([]);
  const [dailyEssentials, setDailyEssentials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      
      const [catsRes, productsRes] = await Promise.all([
        supabase.from("categories").select("*").limit(8),
        supabase.from("products").select("*, product_images(image_url)").eq("status", "active").order("created_at", { ascending: false }).limit(10)
      ]);

      if (catsRes.data) setCategories(catsRes.data);
      
      if (productsRes.data) {
        // Split products randomly into two sections for demo purposes
        setPopularProducts(productsRes.data.slice(0, 5));
        setDailyEssentials(productsRes.data.slice(5, 10));
      }
      
      setIsLoading(false);
    }
    fetchData();
  }, [supabase]);

  const ProductSkeleton = () => (
    <div className="flex flex-col gap-3">
      <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4" />
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/4 mt-auto" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 w-full pb-20 pt-[60px] md:pt-[80px]">
      
      {/* Hero Banner Section */}
      <section className="px-4 md:px-16 max-w-[1440px] mx-auto mt-4 md:mt-8">
        <div className="relative h-[250px] md:h-[450px] w-full rounded-2xl overflow-hidden shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 h-full w-full"
            >
              <Image
                src={HERO_BANNERS[currentSlide].image}
                alt={HERO_BANNERS[currentSlide].heading}
                fill
                priority
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
            </motion.div>
          </AnimatePresence>

          <div className="absolute inset-0 flex items-center z-10 p-6 md:p-12 pointer-events-none">
            <div className="max-w-xl flex flex-col gap-2 md:gap-4 text-white pointer-events-auto">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={`h-${currentSlide}`}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-3xl md:text-5xl font-bold leading-tight"
                >
                  {HERO_BANNERS[currentSlide].heading}
                </motion.h1>
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.p
                  key={`p-${currentSlide}`}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="text-sm md:text-lg text-white/90"
                >
                  {HERO_BANNERS[currentSlide].subheading}
                </motion.p>
              </AnimatePresence>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mt-2 md:mt-4"
              >
                <Link href={HERO_BANNERS[currentSlide].ctaLink}>
                  <Button variant="primary" className={`${HERO_BANNERS[currentSlide].color} border-none text-white shadow-lg hover:brightness-110`}>
                    {HERO_BANNERS[currentSlide].ctaText}
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
          
          <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 flex gap-2 z-10">
            {HERO_BANNERS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`w-2 h-2 md:w-3 md:h-3 rounded-full transition-all ${currentSlide === i ? 'bg-white w-6 md:w-8' : 'bg-white/50 hover:bg-white/80'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Category Bubbles */}
      <section className="py-12 px-4 md:px-16 max-w-[1440px] mx-auto overflow-hidden">
        <h2 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-2"><Store className="w-5 h-5 text-accent"/> Shop by Category</h2>
        <div className="flex overflow-x-auto no-scrollbar gap-4 md:gap-8 pb-4">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 min-w-[80px]">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="w-12 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ))
          ) : categories.map((cat, i) => (
            <Link href={`/categories/${cat.slug}`} key={cat.id} className="group flex flex-col items-center gap-3 min-w-[80px] md:min-w-[100px]">
              <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-background-secondary border border-border flex items-center justify-center overflow-hidden group-hover:border-accent group-hover:shadow-md transition-all relative">
                {/* Fallback to initials if no image */}
                <span className="text-xl font-bold text-foreground-secondary group-hover:text-accent">{cat.name.substring(0,2).toUpperCase()}</span>
              </div>
              <span className="text-xs md:text-sm font-medium text-center text-foreground-secondary group-hover:text-foreground line-clamp-1">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Popular Products Carousel */}
      <section className="py-8 md:py-12 px-4 md:px-16 max-w-[1440px] mx-auto bg-background-secondary/50 dark:bg-background-secondary/20">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-xl md:text-3xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-secondary-accent" /> Popular Near You
            </h2>
          </div>
          <Link href="/products" className="text-sm font-medium text-accent hover:underline">View All</Link>
        </div>

        <div className="flex overflow-x-auto no-scrollbar gap-4 md:gap-6 pb-6 snap-x">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="min-w-[200px] md:min-w-[250px] snap-start">
                <ProductSkeleton />
              </div>
            ))
          ) : popularProducts.length > 0 ? popularProducts.map((product) => {
            const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
              ? product.sale_price
              : product.price;

            return (
              <div key={product.id} className="min-w-[160px] max-w-[160px] md:min-w-[220px] md:max-w-[220px] snap-start">
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
          }) : (
            <div className="w-full text-center py-12 text-foreground-secondary">More products arriving soon!</div>
          )}
        </div>
      </section>

      {/* Promotional Strip */}
      <section className="my-12 px-4 md:px-16 max-w-[1440px] mx-auto">
        <div className="w-full bg-gradient-to-r from-brand-fashion to-accent rounded-2xl p-6 md:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg">
          <div>
            <span className="uppercase tracking-widest text-xs font-bold bg-white/20 px-3 py-1 rounded-full">New Feature</span>
            <h2 className="text-2xl md:text-4xl font-bold mt-4">Discover Local Stores</h2>
            <p className="text-white/90 mt-2 max-w-lg text-sm md:text-base">Shop directly from top-rated sellers in your neighborhood and get delivery in minutes.</p>
          </div>
          <Link href="/stores">
            <Button className="bg-white text-accent hover:bg-slate-100 shadow-md font-bold shrink-0">
              Explore Stores
            </Button>
          </Link>
        </div>
      </section>

      {/* Daily Essentials Grid */}
      <section className="py-8 md:py-12 px-4 md:px-16 max-w-[1440px] mx-auto">
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-xl md:text-3xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" /> Daily Essentials
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => <ProductSkeleton key={i} />)
          ) : dailyEssentials.length > 0 ? dailyEssentials.map((product) => {
            const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
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
            );
          }) : (
            <div className="col-span-full text-center py-12 text-foreground-secondary border border-dashed border-border rounded-xl">No essentials available at the moment.</div>
          )}
        </div>
      </section>
      
      {/* Features */}
      <section className="py-12 mt-12 bg-background-secondary border-t border-border">
        <div className="max-w-[1440px] mx-auto px-4 md:px-16 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-brand-grocery shadow-sm">
              <Truck className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base">Fast Delivery</h4>
            <p className="text-xs text-foreground-secondary">From stores near you</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-accent shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base">Secure Payments</h4>
            <p className="text-xs text-foreground-secondary">100% safe & secure</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-brand-fashion shadow-sm">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base">Easy Returns</h4>
            <p className="text-xs text-foreground-secondary">Hassle-free process</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-yellow-500 shadow-sm">
              <Star className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm md:text-base">Top Quality</h4>
            <p className="text-xs text-foreground-secondary">Genuine products</p>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
