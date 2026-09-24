"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search as SearchIcon, 
  X, 
  Clock, 
  TrendingUp, 
  ArrowRight, 
  Package, 
  Loader2,
  Trash2
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

const POPULAR_SEARCHES = [
  "Smartphones",
  "T-Shirts",
  "Sneakers",
  "Headphones",
  "Organic Grocery",
  "Home Decor",
  "Accessories"
];

const RECENT_SEARCHES_STORAGE_KEY = "vendosmith_recent_searches";

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, 5));
        }
      }
    } catch {
      // localStorage may not be accessible in private browsing
    }
  }, [isOpen]);

  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const updated = [trimmed, ...recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage write errors
    }
  };

  const removeRecentSearch = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = recentSearches.filter((item) => item !== termToRemove);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage write errors
    }
  };

  const clearAllRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setRecentSearches([]);
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch {
      // Ignore storage write errors
    }
  };

  // Focus & body overflow & Escape key handler
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setQuery("");
      setResults([]);
      setIsSearching(false);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Real-time debounced product search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const searchProducts = async () => {
      const trimmedQuery = query.trim();
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, price, product_images(image_url)")
        .ilike("title", `%${trimmedQuery}%`)
        .limit(6);

      if (!error && data) {
        setResults(data);
      }
      setIsSearching(false);
    };

    const debounceTimer = setTimeout(searchProducts, 250);
    return () => clearTimeout(debounceTimer);
  }, [query, supabase]);

  const handleSearchSubmit = (e?: React.FormEvent, customTerm?: string) => {
    if (e) e.preventDefault();
    const term = (customTerm ?? query).trim();
    if (!term) return;

    saveRecentSearch(term);
    onClose();
    router.push(`/products?search=${encodeURIComponent(term)}`);
  };

  const handleProductClick = (slug: string) => {
    if (query.trim()) {
      saveRecentSearch(query.trim());
    }
    onClose();
    router.push(`/products/${slug}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-start p-3 sm:p-6 md:p-12 overflow-y-auto bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Search dialog"
        >
          {/* Centered Modal Card */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden mt-2 sm:mt-10 flex flex-col max-h-[85vh]"
          >
            {/* Top Search Input Bar */}
            <form 
              onSubmit={handleSearchSubmit}
              className="flex items-center px-4 md:px-5 h-[60px] md:h-[64px] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-3"
            >
              <SearchIcon className="w-5 h-5 text-accent shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, brands and essentials..."
                className="flex-1 bg-transparent text-base md:text-lg font-medium outline-none text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              
              {isSearching && (
                <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
              )}

              {query && !isSearching && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Clear
                </button>
              )}

              <button 
                type="button"
                onClick={onClose} 
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                aria-label="Close search"
              >
                <X className="w-5 h-5" />
              </button>
            </form>

            {/* Content Body Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/40 divide-y divide-slate-100 dark:divide-slate-800/80">
              
              {/* State 1: Active Query with Product Results */}
              {query && results.length > 0 && (
                <div className="space-y-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Matching Products ({results.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSearchSubmit()}
                      className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                    >
                      View all <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {results.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => handleProductClick(product.slug)}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-accent/50 dark:hover:border-accent/50 hover:shadow-sm transition-all cursor-pointer group"
                      >
                        <div className="w-14 h-14 relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-100 dark:border-slate-800">
                          <Image
                            src={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&q=80"}
                            alt={product.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-accent transition-colors">
                            {product.title}
                          </h4>
                          <p className="text-xs font-bold text-accent mt-0.5">
                            {formatCurrency(product.price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* View All Action Card */}
                  <div 
                    onClick={() => handleSearchSubmit()}
                    className="p-3 rounded-xl bg-accent/5 dark:bg-accent/10 border border-accent/20 hover:bg-accent/10 dark:hover:bg-accent/15 transition-colors cursor-pointer flex items-center justify-between text-accent font-semibold text-xs sm:text-sm"
                  >
                    <span>Press <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-white dark:bg-slate-900 border border-accent/30 rounded">Enter</kbd> to see all results for &quot;{query}&quot;</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              )}

              {/* State 2: Active Query with No Results */}
              {query && !isSearching && results.length === 0 && (
                <div className="py-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      No products found for &quot;{query}&quot;
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                      Check for spelling errors or try searching with more general keywords.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 rounded-lg transition-colors"
                    >
                      Clear search
                    </button>
                  </div>
                </div>
              )}

              {/* State 3: Empty Query (Default View: Recent Searches & Trending) */}
              {!query && (
                <div className="space-y-6 pt-1">
                  {/* Recent Searches */}
                  {recentSearches.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" /> Recent Searches
                        </span>
                        <button
                          type="button"
                          onClick={clearAllRecentSearches}
                          className="text-[11px] font-medium text-slate-400 hover:text-destructive flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Clear history
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((term) => (
                          <div
                            key={term}
                            onClick={() => {
                              setQuery(term);
                              handleSearchSubmit(undefined, term);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-accent/40 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-accent cursor-pointer transition-colors shadow-2xs group"
                          >
                            <span>{term}</span>
                            <button
                              type="button"
                              onClick={(e) => removeRecentSearch(term, e)}
                              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
                              aria-label={`Remove ${term}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Popular / Trending Searches */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <TrendingUp className="w-3.5 h-3.5 text-accent" />
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Trending Searches
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {POPULAR_SEARCHES.map((term) => (
                        <button 
                          key={term}
                          type="button"
                          onClick={() => {
                            setQuery(term);
                            handleSearchSubmit(undefined, term);
                          }}
                          className="px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-accent hover:border-accent/40 transition-colors shadow-2xs"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Keyboard Hint Bar */}
            <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-semibold text-[10px]">↵</kbd> Search</span>
                <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-semibold text-[10px]">ESC</kbd> Close</span>
              </div>
              <Link 
                href="/products" 
                onClick={onClose}
                className="hover:text-accent transition-colors font-medium"
              >
                Browse all products &rarr;
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
