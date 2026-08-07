"use client";

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

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const [products, setProducts] = useState<any[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recommended");
  
  const { addItem } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();

  const [categoryInfo, setCategoryInfo] = useState<any>(null);

  useEffect(() => {
    async function fetchCategoryProducts() {
      setIsLoading(true);
      // Fetch category first
      const { data: categoryData } = await supabase
        .from("categories")
        .select("id, name, description")
        .eq("slug", params.slug)
        .single();

      if (categoryData) {
        setCategoryInfo(categoryData);
      }

      let query = supabase.from("products").select("*, product_images(image_url)").eq("status", "active");

      if (categoryData) {
        query = query.eq("category_id", categoryData.id);
      } else {
        // If category slug doesn't exist, return empty products array
        setProducts([]);
        setIsLoading(false);
        return;
      }

      if (sortBy === "price_asc") query = query.order("price", { ascending: true });
      else if (sortBy === "price_desc") query = query.order("price", { ascending: false });
      else if (sortBy === "newest") query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      
      if (!error && data) {
        setProducts(data);
      }
      setIsLoading(false);
    }
    fetchCategoryProducts();
  }, [params.slug, sortBy]);

  const handleQuickAdd = (product: any) => {
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
            {categoryInfo?.description || `${products.length} products found in ${categoryTitle}`}
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

      <div className="flex gap-12">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24 flex flex-col gap-8">
            <div>
              <h3 className="font-serif text-lg mb-4">Price</h3>
              <input type="range" className="w-full accent-accent" min="0" max="500" />
              <div className="flex justify-between text-xs text-foreground-secondary mt-2">
                <span>$0</span>
                <span>$500+</span>
              </div>
            </div>
            
            <div>
              <h3 className="font-serif text-lg mb-4">Size</h3>
              <div className="flex flex-wrap gap-2">
                {["XS", "S", "M", "L", "XL"].map(size => (
                  <button key={size} className="w-10 h-10 border border-border rounded-md flex items-center justify-center text-sm hover:border-accent transition-colors">
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col gap-3">
                  <div className="w-full aspect-[3/4] bg-background-secondary rounded-lg" />
                  <div className="h-4 bg-background-secondary rounded w-3/4" />
                  <div className="h-4 bg-background-secondary rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-foreground-secondary mb-4">No products found in this category.</p>
              <Button variant="outline" onClick={() => window.location.href = '/products'}>View All Products</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    {...product}
                    primaryImage={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                    onQuickAdd={() => handleQuickAdd(product)}
                  />
                ))}
              </div>

              {products.length > 0 && (
                <div className="mt-16 flex justify-center">
                  <Button variant="outline" size="lg">Load More</Button>
                </div>
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
                <h3 className="font-serif text-xl">Filters</h3>
                <button onClick={() => setIsFilterOpen(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-col gap-6 mt-4">
                 <div>
                  <h3 className="font-medium text-base mb-4">Price</h3>
                  <input type="range" className="w-full accent-accent" min="0" max="500" />
                  <div className="flex justify-between text-xs text-foreground-secondary mt-2">
                    <span>$0</span>
                    <span>$500+</span>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-base mb-4">Size</h3>
                  <div className="flex flex-wrap gap-2">
                    {["XS", "S", "M", "L", "XL"].map(size => (
                      <button key={size} className="w-10 h-10 border border-border rounded-md flex items-center justify-center text-sm hover:border-accent transition-colors">
                        {size}
                      </button>
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
