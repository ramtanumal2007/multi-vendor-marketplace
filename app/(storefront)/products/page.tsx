"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, ChevronDown, X } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";

export default function ProductListingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<any>(null);
  
  const { addItem } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [sortBy, selectedCategory]);

  const fetchCategories = async () => {
    const { data } = await supabase.from("categories").select("*");
    if (data) setCategories(data);
  };

  const fetchProducts = async () => {
    setIsLoading(true);
    let query = supabase.from("products").select("*, product_images(*)").eq("status", "active");
    
    if (selectedCategory) {
      query = query.eq("category_id", selectedCategory);
    }
    
    if (sortBy === "price_asc") query = query.order("price", { ascending: true });
    else if (sortBy === "price_desc") query = query.order("price", { ascending: false });
    else if (sortBy === "newest") query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (data) setProducts(data);
    setIsLoading(false);
  };

  const handleQuickAdd = (product: any) => {
    addItem({
      id: product.id,
      productId: product.id,
      title: product.title,
      price: product.price,
      image: product.product_images[0]?.image_url,
    });
    addToast({ title: "Added to cart", type: "success" });
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-8 md:py-12 w-full pt-[80px] md:pt-[100px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Discover Products</h1>
          <p className="text-foreground-secondary mt-2">{products.length} products found matching your criteria</p>
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

      <div className="flex gap-12">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24 flex flex-col gap-8">
            <div>
              <h3 className="font-serif text-lg mb-4">Category</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group" onClick={() => setSelectedCategory(null)}>
                  <div className={`w-4 h-4 border ${selectedCategory === null ? 'border-accent bg-accent' : 'border-border'} rounded-sm group-hover:border-accent transition-colors flex items-center justify-center`} />
                  <span className={`text-sm group-hover:text-foreground ${selectedCategory === null ? 'text-foreground font-medium' : 'text-foreground-secondary'}`}>All Products</span>
                </label>
                {categories.map(cat => (
                  <label key={cat.id} className="flex items-center gap-3 cursor-pointer group" onClick={() => setSelectedCategory(cat.id)}>
                    <div className={`w-4 h-4 border ${selectedCategory === cat.id ? 'border-accent bg-accent' : 'border-border'} rounded-sm group-hover:border-accent transition-colors flex items-center justify-center`} />
                    <span className={`text-sm group-hover:text-foreground ${selectedCategory === cat.id ? 'text-foreground font-medium' : 'text-foreground-secondary'}`}>{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-serif text-lg mb-4">Price</h3>
              <input type="range" className="w-full accent-accent" min="0" max="500" />
              <div className="flex justify-between text-xs text-foreground-secondary mt-2">
                <span>$0</span>
                <span>$500+</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/4 mt-auto" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-background-secondary/50 rounded-2xl border border-dashed border-border">
              <p className="text-foreground-secondary mb-4 text-lg">No products found matching your filters.</p>
              <Button variant="outline" onClick={() => setSelectedCategory(null)} className="font-bold">Clear Filters</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    {...product}
                    primaryImage={product.product_images?.[0]?.image_url || "/placeholder.jpg"}
                    onQuickAdd={() => handleQuickAdd(product)}
                  />
                ))}
              </div>
              <div className="mt-16 flex justify-center">
                <Button variant="outline" size="lg">Load More</Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick View Modal */}
      <Modal isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} title="Quick View">
        {quickViewProduct && (() => {
          const hasDiscount = Boolean(quickViewProduct.sale_price && quickViewProduct.sale_price > 0 && quickViewProduct.sale_price < quickViewProduct.price);
          const effectivePrice = hasDiscount ? quickViewProduct.sale_price : quickViewProduct.price;

          return (
            <div className="flex flex-col md:flex-row gap-6 mt-4">
              <div className="relative aspect-[3/4] w-full md:w-1/2 bg-background-secondary rounded-lg overflow-hidden">
                <Image src={quickViewProduct.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"} alt={quickViewProduct.title} fill className="object-cover" />
              </div>
              <div className="w-full md:w-1/2 flex flex-col">
                <h3 className="text-2xl font-serif">{quickViewProduct.title}</h3>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-bold text-accent">{formatCurrency(effectivePrice)}</span>
                  {hasDiscount && (
                    <span className="text-sm text-slate-400 line-through">{formatCurrency(quickViewProduct.price)}</span>
                  )}
                </div>
                
                <div className="mt-6 flex-1">
                  <p className="text-sm text-foreground-secondary">
                    {quickViewProduct.description || "A high-quality item perfect for your everyday wardrobe. Features premium materials and expert craftsmanship."}
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
            className="fixed inset-0 z-50 bg-black/40 md:hidden"
            onClick={() => setIsFilterOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 h-[80vh] bg-background rounded-t-2xl p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl">Filters</h3>
                <button onClick={() => setIsFilterOpen(false)} className="p-2 bg-background-secondary rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-col gap-6 overflow-y-auto h-full pb-10">
                <div>
                  <h4 className="font-bold mb-3 text-sm text-foreground-secondary uppercase tracking-wider">Categories</h4>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer group" onClick={() => setSelectedCategory(null)}>
                      <div className={`w-5 h-5 border ${selectedCategory === null ? 'border-accent bg-accent' : 'border-border'} rounded-md flex items-center justify-center transition-colors`} />
                      <span className={`text-base ${selectedCategory === null ? 'text-foreground font-bold' : 'text-foreground-secondary'}`}>All Products</span>
                    </label>
                    {categories.map(cat => (
                      <label key={cat.id} className="flex items-center gap-3 cursor-pointer group" onClick={() => setSelectedCategory(cat.id)}>
                        <div className={`w-5 h-5 border ${selectedCategory === cat.id ? 'border-accent bg-accent' : 'border-border'} rounded-md flex items-center justify-center transition-colors`} />
                        <span className={`text-base ${selectedCategory === cat.id ? 'text-foreground font-bold' : 'text-foreground-secondary'}`}>{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
