"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, ChevronDown, X, Cake, Sparkles, Clock, RotateCcw, ArrowRight, AlertCircle, ShoppingBag, Check, Star } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Button } from "@/components/ui/Button";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { Modal } from "@/components/ui/Modal";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE } from "@/components/storefront/TopCategoryNav";
import { calculateFlipkartDiscount } from "@/lib/search";

interface CategoryProductItem {
  id: string;
  title: string;
  slug?: string;
  price: number;
  sale_price?: number | null;
  product_images?: Array<{ image_url: string }>;
  rating?: number | null;
  display_style?: string | null;
  reviews_count?: number | null;
  reviewCount?: number | null;
  category_id?: string | null;
  status: string;
  description?: string | null;
  tags?: string[] | null;
  stock_quantity?: number | null;
  stores?: { id: string; name: string } | null;
}

interface CategoryData {
  id: string;
  name: string;
  description?: string | null;
}

interface SubcategoryItem {
  id: string;
  name: string;
  slug: string;
}

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subcategoryParam = searchParams.get("sub") || searchParams.get("subcategory");

  const [products, setProducts] = useState<CategoryProductItem[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryItem[]>([]);
  const [totalCategoryProductsCount, setTotalCategoryProductsCount] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<CategoryProductItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(subcategoryParam || "all");
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [minDiscount, setMinDiscount] = useState<number>(0);
  const [minRating, setMinRating] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  // Sync subcategory state when URL param changes
  useEffect(() => {
    setSelectedSubcategory(subcategoryParam || "all");
  }, [subcategoryParam]);

  const handleSelectSubcategory = (subSlug: string) => {
    const nextSub = subSlug === selectedSubcategory ? "all" : subSlug;
    setSelectedSubcategory(nextSub);
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextSub === "all") {
      params.delete("sub");
      params.delete("subcategory");
    } else {
      params.set("sub", nextSub);
      params.delete("subcategory");
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const handleResetFilters = () => {
    setSelectedSubcategory("all");
    setMaxPrice(10000);
    setMinDiscount(0);
    setMinRating(0);
    setInStockOnly(false);
    router.replace(pathname, { scroll: false });
  };

  const hasActiveFilters =
    selectedSubcategory !== "all" ||
    maxPrice < 10000 ||
    minDiscount > 0 ||
    minRating > 0 ||
    inStockOnly;

  // Reset pagination when category, subcategory or sort changes
  useEffect(() => {
    setVisibleCount(12);
  }, [params.slug, selectedSubcategory, sortBy, maxPrice, minDiscount, minRating, inStockOnly]);

  const { addItem } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const effectivePrice =
        p.sale_price && p.sale_price > 0 && p.sale_price < p.price ? p.sale_price : p.price;
      if (effectivePrice > maxPrice) return false;

      if (inStockOnly && p.stock_quantity !== undefined && p.stock_quantity !== null && p.stock_quantity <= 0) {
        return false;
      }

      if (minRating > 0 && ((p.rating ?? 0) < minRating)) {
        return false;
      }

      if (minDiscount > 0) {
        const discountInfo = calculateFlipkartDiscount(p.price, p.sale_price);
        if (!discountInfo.isValidDiscount || discountInfo.discountPercent < minDiscount) {
          return false;
        }
      }

      return true;
    });
  }, [products, maxPrice, inStockOnly, minRating, minDiscount]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const handleLoadMore = () => {
    if (isLoadingMoreRef.current || isLoadingMore) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + 12);
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
    }, 350);
  };

  const [categoryInfo, setCategoryInfo] = useState<CategoryData | null>(null);

  const fetchCategoryProducts = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      // 1. Fetch parent category first
      const { data: categoryData, error: catError } = await supabase
        .from("categories")
        .select("id, name, description")
        .eq("slug", params.slug)
        .maybeSingle();

      if (catError) {
        throw new Error(catError.message);
      }

      if (categoryData) {
        setCategoryInfo(categoryData);

        // 2. Fetch all child subcategories dynamically from DB
        const { data: subcatsData } = await supabase
          .from("categories")
          .select("id, name, slug")
          .eq("parent_id", categoryData.id)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        const childCategories = (subcatsData || []) as SubcategoryItem[];
        setSubcategories(childCategories);

        const allCategoryIds = [categoryData.id, ...childCategories.map((c) => c.id)];

        // Check total active products in this category hierarchy (unfiltered baseline)
        const { count: totalCount } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("category_id", allCategoryIds)
          .eq("status", "active");

        setTotalCategoryProductsCount(totalCount ?? 0);

        // Fetch products for listing with store attribution
        let query = supabase
          .from("products")
          .select("*, product_images(image_url), stores:stores!products_store_id_fkey(id, name)")
          .eq("status", "active");

        // Filter by subcategory if selected
        if (selectedSubcategory && selectedSubcategory !== "all") {
          const matchedSub = childCategories.find(
            (s) => s.slug === selectedSubcategory || s.id === selectedSubcategory
          );
          if (matchedSub) {
            query = query.or(`category_id.eq.${matchedSub.id},tags.cs.{"subcat:${matchedSub.id}"}`);
          } else {
            const subFilters = allCategoryIds.map((id) => `tags.cs.{"subcat:${id}"}`).join(",");
            query = query.or(`category_id.in.(${allCategoryIds.join(",")}),${subFilters}`);
          }
        } else {
          const subFilters = allCategoryIds.map((id) => `tags.cs.{"subcat:${id}"}`).join(",");
          query = query.or(`category_id.in.(${allCategoryIds.join(",")}),${subFilters}`);
        }

        if (sortBy === "price_asc") query = query.order("price", { ascending: true });
        else if (sortBy === "price_desc") query = query.order("price", { ascending: false });
        else if (sortBy === "newest") query = query.order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        setProducts((data || []) as CategoryProductItem[]);
      } else {
        setProducts([]);
        setSubcategories([]);
        setTotalCategoryProductsCount(0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load category products.";
      setFetchError(msg);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoryProducts();
  }, [params.slug, sortBy, selectedSubcategory, supabase]);

  const handleQuickAdd = (product: CategoryProductItem) => {
    const effectivePrice = product.sale_price && product.sale_price > 0 && product.sale_price < product.price
      ? product.sale_price
      : product.price;

    addItem({
      id: product.id,
      productId: product.id,
      title: product.title,
      price: effectivePrice,
      image: product.product_images?.[0]?.image_url || "",
    });
    addToast({ title: "Added to cart", type: "success" });
  };

  const categoryTitle = categoryInfo?.name || params.slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-12 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">{categoryTitle}</h1>
          <p className="text-foreground-secondary mt-2 text-sm">
            {categoryInfo?.description || `${filteredProducts.length} ${filteredProducts.length === 1 ? "product" : "products"} found in ${categoryTitle}`}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            className="flex items-center gap-2 text-sm font-medium hover:text-accent transition-colors md:hidden"
            onClick={() => setIsFilterOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4" /> Filters
          </button>
          
          <div className="relative group hidden md:block">
            <button className="flex items-center gap-2 text-sm font-medium hover:text-accent transition-colors">
              Sort by: {sortBy === "recommended" ? "Recommended" : sortBy === "price_asc" ? "Price: Low to High" : sortBy === "price_desc" ? "Price: High to Low" : "Newest"} <ChevronDown className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 flex flex-col py-2">
              <button onClick={() => setSortBy("recommended")} className="text-left px-4 py-2 text-sm hover:bg-background-secondary">Recommended</button>
              <button onClick={() => setSortBy("price_asc")} className="text-left px-4 py-2 text-sm hover:bg-background-secondary">Price: Low to High</button>
              <button onClick={() => setSortBy("price_desc")} className="text-left px-4 py-2 text-sm hover:bg-background-secondary">Price: High to Low</button>
              <button onClick={() => setSortBy("newest")} className="text-left px-4 py-2 text-sm hover:bg-background-secondary">Newest</button>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Subcategory Pills Strip */}
      {subcategories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
          <button
            onClick={() => handleSelectSubcategory("all")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              selectedSubcategory === "all"
                ? "bg-accent text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            All Items
          </button>
          {subcategories.map((sub) => {
            const isActive = selectedSubcategory === sub.slug || selectedSubcategory === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => handleSelectSubcategory(sub.slug)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-accent text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {sub.name}
              </button>
            );
          })}
        </div>
      )}

      {params.slug === "cake" && (
        <div className="mb-10 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-rose-950 via-pink-900 to-rose-900 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl border border-rose-800/60">
          <div className="space-y-2 max-w-xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider">
              <Cake className="w-4 h-4 text-pink-300" /> Bespoke Cake Studio
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Customize Your Cake</h2>
            <p className="text-xs sm:text-sm text-white/90">
              Tell us what cake you want and we&apos;ll help you create it. Choose flavor, weight, custom inscription, or upload reference designs.
            </p>
          </div>
          <Link
            href="/customize-cake"
            className="px-6 py-3 rounded-2xl bg-white text-rose-900 font-extrabold text-sm hover:bg-rose-50 transition-all shadow-lg shadow-black/20 shrink-0"
          >
            Customize Cake →
          </Link>
        </div>
      )}

      <div className="flex gap-12">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-28 flex flex-col gap-6 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                <span>Filters</span>
              </h3>
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="text-[11px] font-semibold text-accent hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Price Filter with Visible Range */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  PRICE
                </h4>
                <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                  ₹0 – ₹{maxPrice >= 10000 ? "10,000+" : maxPrice.toLocaleString("en-IN")}
                </span>
              </div>
              <input
                type="range"
                className="w-full accent-accent cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
                min="0"
                max="10000"
                step="250"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
              />
              <div className="flex justify-between text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-1.5">
                <span>₹0</span>
                <span>₹5,000</span>
                <span>₹10,000+</span>
              </div>
            </div>

            {/* Discount Percentage Filter */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  DISCOUNT
                </h4>
                {minDiscount > 0 && (
                  <button
                    onClick={() => setMinDiscount(0)}
                    className="text-[10px] text-accent font-semibold hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {[
                  { value: 0, label: "All Discounts" },
                  { value: 10, label: "10% or more" },
                  { value: 20, label: "20% or more" },
                  { value: 30, label: "30% or more" },
                  { value: 50, label: "50% or more" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMinDiscount(opt.value)}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all text-left ${
                      minDiscount === opt.value
                        ? "bg-accent/10 text-accent font-bold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {minDiscount === opt.value && <Check className="w-3.5 h-3.5 text-accent" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Rating Filter */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  CUSTOMER RATING
                </h4>
                {minRating > 0 && (
                  <button
                    onClick={() => setMinRating(0)}
                    className="text-[10px] text-accent font-semibold hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {[
                  { value: 0, label: "Any Rating" },
                  { value: 4, label: "4★ & above" },
                  { value: 3, label: "3★ & above" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMinRating(opt.value)}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all text-left ${
                      minRating === opt.value
                        ? "bg-accent/10 text-accent font-bold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {opt.value > 0 && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
                      <span>{opt.label}</span>
                    </span>
                    {minRating === opt.value && <Check className="w-3.5 h-3.5 text-accent" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Stock Availability */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center justify-between cursor-pointer py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                <span>In Stock Only</span>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="rounded border-slate-300 text-accent focus:ring-accent w-4 h-4 cursor-pointer accent-accent"
                />
              </label>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col gap-2 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-border">
                  <div className="w-full aspect-square bg-background-secondary rounded-lg" />
                  <div className="h-3.5 bg-background-secondary rounded w-3/4" />
                  <div className="h-3.5 bg-background-secondary rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            /* API / NETWORK ERROR STATE */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-red-50/50 dark:bg-red-950/20 rounded-3xl border border-red-200/80 dark:border-red-900/50 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Unable to Load Products</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mb-5">
                {fetchError || "An unexpected error occurred while communicating with the store catalog."}
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => fetchCategoryProducts()}
                className="gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </Button>
            </div>
          ) : totalCategoryProductsCount === 0 ? (
            /* ============================================================== */
            /* PREMIUM "COMING SOON" EXPERIENCE FOR EMPTY CATEGORY            */
            /* ============================================================== */
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 px-6 text-center bg-gradient-to-b from-slate-50/80 to-white dark:from-slate-900/40 dark:to-slate-900/80 rounded-3xl border border-dashed border-slate-300/80 dark:border-slate-800 shadow-xs max-w-2xl mx-auto">
              {(() => {
                const catStyle = CATEGORY_STYLES[params.slug] || DEFAULT_CATEGORY_STYLE;
                const CategoryIcon = catStyle.icon;
                return (
                  <div className="relative mb-5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center border-2 border-amber-200/80 dark:border-amber-800/60 shadow-lg shadow-amber-500/10">
                      <CategoryIcon className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                    <span className="absolute -top-2 -right-2 p-1.5 rounded-full bg-amber-500 text-white shadow-md">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                  </div>
                );
              })()}

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/80 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[11px] font-extrabold uppercase tracking-widest mb-3 border border-amber-200/80 dark:border-amber-800/80">
                <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Coming Soon</span>
              </div>

              <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                New Curations Arriving in {categoryTitle}
              </h2>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed mb-6">
                Our regional artisans and verified merchant partners are carefully stocking exclusive collections for this department. As soon as products are published, they will appear right here.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href="/products">
                  <Button variant="primary" size="md" className="gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    <span>Explore Available Products</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" size="md">
                    Back to Marketplace
                  </Button>
                </Link>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            /* ZERO SEARCH / FILTER RESULTS IN NON-EMPTY CATEGORY */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center mb-3">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                No products match selected filter
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mb-5">
                We couldn&apos;t find any items matching your active subcategory or filter criteria in {categoryTitle}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters &amp; View All {categoryTitle}</span>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    {...product}
                    storeName={product.stores?.name}
                    displayStyle={product.display_style || "standard"}
                    reviewCount={product.reviews_count ?? product.reviewCount ?? undefined}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => handleQuickAdd(product)}
                  />
                ))}
              </div>

              {filteredProducts.length > 0 && (
                <LoadMoreButton
                  currentCount={visibleCount}
                  totalCount={filteredProducts.length}
                  isLoading={isLoadingMore}
                  onLoadMore={handleLoadMore}
                  batchSize={12}
                  categoryLabel={categoryTitle}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick View Modal */}
      <Modal isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} title="Quick View">
        {quickViewProduct && (
          <div className="flex flex-col md:flex-row gap-6 mt-4">
            <div className="relative aspect-[3/4] w-full md:w-1/2 bg-background-secondary rounded-lg overflow-hidden">
              <Image src={quickViewProduct.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"} alt={quickViewProduct.title} fill className="object-cover" />
            </div>
            <div className="w-full md:w-1/2 flex flex-col">
              <h3 className="text-2xl font-serif">{quickViewProduct.title}</h3>
              <p className="text-xl mt-2">{formatCurrency(quickViewProduct.price)}</p>
              
              <div className="mt-6 flex-1">
                <p className="text-sm text-foreground-secondary">
                  A high-quality item perfect for your everyday wardrobe. Features premium materials and expert craftsmanship.
                </p>
              </div>

              <div className="mt-6">
                <Button variant="primary" className="w-full" onClick={() => {
                  handleQuickAdd(quickViewProduct);
                  setQuickViewProduct(null);
                }}>
                  Add to Cart
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Mobile Filter Sheet */}
      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs md:hidden"
            onClick={() => setIsFilterOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-background rounded-t-3xl p-6 flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-4 border-b border-border">
                <h3 className="font-bold text-lg text-foreground">Filters</h3>
                <button onClick={() => setIsFilterOpen(false)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-6 overflow-y-auto py-4 flex-1">
                {/* Mobile Price Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">PRICE</h4>
                    <span className="text-xs font-bold text-accent">
                      ₹0 – ₹{maxPrice >= 10000 ? "10,000+" : maxPrice.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="w-full accent-accent"
                    min="0"
                    max="10000"
                    step="250"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                  />
                </div>

                {/* Mobile Discount Filter */}
                <div>
                  <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-slate-500">
                    DISCOUNT
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: "All" },
                      { value: 10, label: "10%+" },
                      { value: 20, label: "20%+" },
                      { value: 30, label: "30%+" },
                      { value: 50, label: "50%+" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setMinDiscount(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          minDiscount === opt.value
                            ? "bg-accent text-white border-accent shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile Rating Filter */}
                <div>
                  <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-slate-500">
                    CUSTOMER RATING
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: "Any Rating" },
                      { value: 4, label: "4★ & above" },
                      { value: 3, label: "3★ & above" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setMinRating(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          minRating === opt.value
                            ? "bg-accent text-white border-accent shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile In Stock Filter */}
                <div className="py-1">
                  <label className="flex items-center justify-between cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <span>In Stock Only</span>
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="rounded border-slate-300 text-accent focus:ring-accent w-4 h-4 cursor-pointer accent-accent"
                    />
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 text-xs font-bold"
                  onClick={() => {
                    handleResetFilters();
                    setIsFilterOpen(false);
                  }}
                >
                  Reset
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 text-xs font-bold"
                  onClick={() => setIsFilterOpen(false)}
                >
                  Apply Filters
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
