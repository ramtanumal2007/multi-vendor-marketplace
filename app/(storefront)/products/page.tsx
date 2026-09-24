"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  SlidersHorizontal, 
  ChevronDown, 
  X, 
  Check, 
  Loader2, 
  Search, 
  Package
} from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";

interface StorefrontProductItem {
  id: string;
  title: string;
  slug?: string;
  price: number;
  sale_price?: number | null;
  product_images?: Array<{ id?: string; image_url: string }>;
  rating?: number;
  category_id?: string | null;
  status: string;
  description?: string | null;
  sku?: string | null;
  stores?: { id: string; name: string };
}

interface StorefrontCategoryItem {
  id: string;
  name: string;
  slug?: string;
}

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest Arrivals" },
];

export default function ProductListingPage() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get("search") || "";

  const [products, setProducts] = useState<StorefrontProductItem[]>([]);
  const [categories, setCategories] = useState<StorefrontCategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProductItem | null>(null);

  // Pagination / Load More state
  const [visibleCount, setVisibleCount] = useState<number>(12);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const { addItem } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from("categories").select("*").order("sort_order", { ascending: true });
    if (data) setCategories(data);
  }, [supabase]);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    let query = supabase.from("products").select("*, product_images(*), stores(id, name)").eq("status", "active");

    if (selectedCategory) {
      query = query.eq("category_id", selectedCategory);
    }

    if (searchQuery.trim()) {
      query = query.ilike("title", `%${searchQuery.trim()}%`);
    }

    if (sortBy === "price_asc") query = query.order("price", { ascending: true });
    else if (sortBy === "price_desc") query = query.order("price", { ascending: false });
    else if (sortBy === "newest") query = query.order("created_at", { ascending: false });

    const { data } = await query;
    if (data) {
      setProducts(data as StorefrontProductItem[]);
      setVisibleCount(12);
    }
    setIsLoading(false);
  }, [selectedCategory, sortBy, searchQuery, supabase]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Client-side price filter
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const price = p.sale_price && p.sale_price > 0 && p.sale_price < p.price ? p.sale_price : p.price;
      return price <= maxPrice;
    });
  }, [products, maxPrice]);

  // Paginated visible slice
  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + 12);
      setIsLoadingMore(false);
    }, 400);
  };

  const handleQuickAdd = (product: StorefrontProductItem) => {
    const effectivePrice =
      product.sale_price && product.sale_price > 0 && product.sale_price < product.price
        ? product.sale_price
        : product.price;

    addItem({
      id: product.id,
      productId: product.id,
      title: product.title,
      price: effectivePrice,
      image: product.product_images?.[0]?.image_url || "",
    });
    addToast({ title: "Added to Cart ✓", type: "success" });
  };

  // Dynamic grid centering for small result counts (1, 2, 3 items)
  const gridContainerClass = useMemo(() => {
    const count = visibleProducts.length;
    if (count === 1) {
      return "max-w-sm mx-auto grid grid-cols-1 justify-center";
    }
    if (count === 2) {
      return "max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 justify-center";
    }
    if (count === 3) {
      return "max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-center";
    }
    return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6";
  }, [visibleProducts.length]);

  const sortLabel = useMemo(() => {
    return SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Recommended";
  }, [sortBy]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 py-6 md:py-10 w-full min-h-screen">
      {/* 1. SEARCH RESULTS HEADER CARD / BANNER OR DEFAULT HEADER */}
      {searchQuery ? (
        <div className="mb-8 p-6 md:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl relative overflow-hidden border border-slate-700/60">
          <div className="absolute right-0 top-0 w-96 h-96 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2">
                <Link href="/" className="hover:text-white transition-colors">Home</Link>
                <span>/</span>
                <Link href="/products" className="hover:text-white transition-colors">Products</Link>
                <span>/</span>
                <span className="text-amber-400">Search Results</span>
              </div>

              <span className="text-[10px] font-extrabold uppercase tracking-widest bg-accent/25 text-blue-200 px-2.5 py-0.5 rounded-full border border-blue-400/30">
                SEARCH RESULTS
              </span>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight mt-2 text-white">
                Results matching &ldquo;{searchQuery}&rdquo;
              </h1>

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-md">
                  {filteredProducts.length} {filteredProducts.length === 1 ? "product found" : "products found"}
                </span>
                
                {/* Active search chip */}
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-bold bg-accent hover:bg-accent/80 text-white shadow-xs transition-colors group"
                  title="Click to remove search"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{searchQuery}</span>
                  <X className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Right sorting action on search */}
            <div className="flex items-center gap-3 self-start md:self-auto">
              <button 
                className="flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white md:hidden"
                onClick={() => setIsFilterOpen(true)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
              </button>

              <div className="relative">
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors"
                >
                  <span>Sort by: {sortLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {isSortOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsSortOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-30 py-1.5 overflow-hidden text-slate-800 dark:text-slate-100">
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setSortBy(opt.value);
                            setIsSortOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between ${
                            sortBy === opt.value
                              ? "bg-accent/10 text-accent font-bold"
                              : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <span>{opt.label}</span>
                          {sortBy === opt.value && <Check className="w-3.5 h-3.5 text-accent" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-slate-200/80 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1.5">
              <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
              <span>/</span>
              <span className="text-accent">Products Catalog</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
                Discover Marketplace Products
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent/10 text-accent">
                {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"}
              </span>
            </div>
            <p className="text-foreground-secondary text-xs sm:text-sm mt-1.5">
              Explore authentic products from certified multi-vendor stores across India.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              className="flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-background-secondary md:hidden"
              onClick={() => setIsFilterOpen(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>

            {/* Sort Dropdown (Light Mode & Dark Mode safe) */}
            <div className="relative">
              <button
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-accent transition-colors shadow-2xs"
              >
                <span>Sort by: {sortLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {isSortOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-1.5 overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setSortBy(opt.value);
                          setIsSortOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between ${
                          sortBy === opt.value
                            ? "bg-accent/10 text-accent font-bold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.value && <Check className="w-3.5 h-3.5 text-accent" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN LAYOUT: SIDEBAR FILTERS + PRODUCT GRID */}
      <div className="flex gap-8 lg:gap-12">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-28 flex flex-col gap-6 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                <span>Filters</span>
              </h3>
              {(selectedCategory !== null || maxPrice < 10000) && (
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setMaxPrice(10000);
                  }}
                  className="text-[11px] font-semibold text-accent hover:underline"
                >
                  Reset
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

            {/* Category Selectable Chips / Checkboxes */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                CATEGORIES
              </h4>
              <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto scrollbar-none pr-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left border ${
                    selectedCategory === null
                      ? "bg-accent/10 border-accent/40 text-accent font-bold shadow-xs"
                      : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                  }`}
                >
                  <span>All Categories</span>
                  {selectedCategory === null && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left border ${
                      selectedCategory === cat.id
                        ? "bg-accent/10 border-accent/40 text-accent font-bold shadow-xs"
                        : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    {selectedCategory === cat.id && <Check className="w-3.5 h-3.5 text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* 3. PRODUCT GRID */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {Array(8)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="flex flex-col gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/4 mt-auto" />
                  </div>
                ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4">
                <Package className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {searchQuery ? `No products found for "${searchQuery}"` : "No products found"}
              </h3>
              <p className="text-foreground-secondary text-xs sm:text-sm max-w-md mb-6 leading-relaxed">
                {searchQuery
                  ? "Try checking your keywords, adjusting the price filter, or viewing our full marketplace collection."
                  : "Try clearing selected filters or expanding the price range to explore products."}
              </p>
              <div className="flex items-center gap-3">
                {searchQuery && (
                  <Link href="/products">
                    <Button variant="primary" className="font-semibold text-xs sm:text-sm">
                      View All Products
                    </Button>
                  </Link>
                )}
                {(selectedCategory !== null || maxPrice < 10000) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCategory(null);
                      setMaxPrice(10000);
                    }}
                    className="font-semibold text-xs sm:text-sm"
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Dynamically centered product grid for small counts */}
              <div className={gridContainerClass}>
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    title={product.title}
                    price={product.price}
                    salePrice={product.sale_price}
                    primaryImage={product.product_images?.[0]?.image_url || "/placeholder.jpg"}
                    storeName={product.stores?.name || "Verified Store"}
                    onQuickAdd={() => handleQuickAdd(product)}
                  />
                ))}
              </div>

              {/* 4. REDESIGNED LOAD MORE SECTION */}
              <div className="mt-14 flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 font-medium w-full max-w-md justify-center">
                  <span className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                  <span>
                    You&apos;ve seen {Math.min(visibleCount, filteredProducts.length)} of {filteredProducts.length} products
                  </span>
                  <span className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                </div>

                {visibleCount < filteredProducts.length ? (
                  <Button
                    variant="outline"
                    disabled={isLoadingMore}
                    onClick={handleLoadMore}
                    className="rounded-xl px-8 h-11 font-bold text-xs sm:text-sm border-slate-200 dark:border-slate-800 hover:border-accent hover:text-accent shadow-xs hover:-translate-y-0.5 transition-all flex items-center gap-2 group"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-accent" />
                        <span>Loading products...</span>
                      </>
                    ) : (
                      <>
                        <span>Load More</span>
                        <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-accent group-hover:translate-y-0.5 transition-transform" />
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="text-center py-2 space-y-0.5">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">You&apos;re all caught up</p>
                    <p className="text-[11px] text-slate-400">All products have been explored.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick View Modal */}
      <Modal isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} title="Quick View">
        {quickViewProduct && (() => {
          const hasDiscount = Boolean(
            quickViewProduct.sale_price &&
              quickViewProduct.sale_price > 0 &&
              quickViewProduct.sale_price < quickViewProduct.price
          );
          const effectivePrice = Number(
            hasDiscount ? quickViewProduct.sale_price : quickViewProduct.price
          ) || quickViewProduct.price;

          return (
            <div className="flex flex-col md:flex-row gap-6 mt-4">
              <div className="relative aspect-[3/4] w-full md:w-1/2 bg-background-secondary rounded-lg overflow-hidden">
                <Image
                  src={
                    quickViewProduct.product_images?.[0]?.image_url ||
                    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"
                  }
                  alt={quickViewProduct.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="w-full md:w-1/2 flex flex-col">
                <h3 className="text-2xl font-serif">{quickViewProduct.title}</h3>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-bold text-accent">{formatCurrency(effectivePrice)}</span>
                  {hasDiscount && (
                    <span className="text-sm text-slate-400 line-through">
                      {formatCurrency(quickViewProduct.price)}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex-1">
                  <p className="text-sm text-foreground-secondary">
                    {quickViewProduct.description ||
                      "A high-quality item perfect for your everyday wardrobe. Features premium materials and expert craftsmanship."}
                  </p>
                </div>

                <div className="mt-6">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      handleQuickAdd(quickViewProduct);
                      setQuickViewProduct(null);
                    }}
                  >
                    Add to Cart
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
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
              className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white dark:bg-slate-900 rounded-t-3xl p-6 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Filters</h3>
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500"
                >
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

                {/* Mobile Categories */}
                <div>
                  <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-slate-500">
                    CATEGORIES
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => {
                        setSelectedCategory(null);
                        setIsFilterOpen(false);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl text-xs text-left border ${
                        selectedCategory === null
                          ? "bg-accent/10 border-accent text-accent font-bold"
                          : "border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <span>All Products</span>
                      {selectedCategory === null && <Check className="w-4 h-4 text-accent" />}
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setIsFilterOpen(false);
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl text-xs text-left border ${
                          selectedCategory === cat.id
                            ? "bg-accent/10 border-accent text-accent font-bold"
                            : "border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <span>{cat.name}</span>
                        {selectedCategory === cat.id && <Check className="w-4 h-4 text-accent" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 text-xs font-bold"
                  onClick={() => {
                    setSelectedCategory(null);
                    setMaxPrice(10000);
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
