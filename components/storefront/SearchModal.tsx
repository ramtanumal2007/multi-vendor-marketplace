"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProductSearchResult {
  id: string;
  title: string;
  slug: string;
  price: number;
  product_images?: Array<{ image_url: string }>;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setQuery("");
      setResults([]);
    }
    return () => { 
      document.body.style.overflow = "unset"; 
    };
  }, [isOpen]);

  useEffect(() => {
    const searchProducts = async () => {
      if (!query.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, price, product_images(image_url)")
        .ilike("title", `%${query}%`)
        .limit(6);

      if (!error && data) {
        setResults(data);
      }
      setIsSearching(false);
    };

    const debounceTimer = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col"
        >
          {/* Top Search Bar (~64px height) */}
          <div className="flex items-center px-4 md:px-12 h-[64px] min-h-[64px] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-3 w-full max-w-[1440px] mx-auto">
              <SearchIcon className="w-5 h-5 text-accent shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for products, brands and more..."
                className="flex-1 bg-transparent text-base md:text-lg font-medium outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold"
                >
                  Clear
                </button>
              )}
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0 text-slate-700 dark:text-slate-200"
                aria-label="Close search"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-12 bg-white dark:bg-slate-900">
            <div className="max-w-4xl mx-auto">
              {isSearching ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : query && results.length === 0 ? (
                <div className="text-center p-12 text-slate-500 dark:text-slate-400">
                  No products found matching &quot;{query}&quot;
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Link 
                        href={`/products/${product.slug}`} 
                        onClick={onClose}
                        className="flex items-center gap-4 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                      >
                        <div className="w-16 h-16 relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                          <Image
                            src={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                            alt={product.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-accent transition-colors">
                            {product.title}
                          </h4>
                          <p className="text-sm font-bold text-accent mt-0.5">{formatCurrency(product.price)}</p>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
              
              {!query && (
                <div className="mt-6">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                    Popular Searches
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {["Smartphones", "T-Shirts", "Sneakers", "Headphones", "Organic Grocery", "Home Decor"].map(term => (
                      <button 
                        key={term}
                        onClick={() => setQuery(term)}
                        className="px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-accent hover:border-accent/40 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
