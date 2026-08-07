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

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setQuery("");
      setResults([]);
    }
    return () => { document.body.style.overflow = 'unset'; };
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
        .limit(5);

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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center px-6 md:px-16 h-24 border-b border-border">
            <div className="flex items-center gap-4 w-full max-w-4xl mx-auto">
              <SearchIcon className="w-6 h-6 text-foreground-secondary" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products..."
                className="flex-1 bg-transparent text-2xl md:text-4xl font-serif outline-none placeholder:text-foreground-secondary/50"
              />
              <button onClick={onClose} className="p-2 hover:bg-background-secondary rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-16">
            <div className="max-w-4xl mx-auto">
              {isSearching ? (
                <div className="flex justify-center p-12">
                  <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                </div>
              ) : query && results.length === 0 ? (
                <div className="text-center p-12 text-foreground-secondary">
                  No results found for "{query}"
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {results.map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Link 
                        href={`/products/${product.slug}`} 
                        onClick={onClose}
                        className="flex items-center gap-4 p-4 rounded-xl hover:bg-background-secondary transition-colors group"
                      >
                        <div className="w-20 h-24 relative rounded-md overflow-hidden bg-white">
                          <Image
                            src={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                            alt={product.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                        <div>
                          <h4 className="font-medium text-lg font-serif">{product.title}</h4>
                          <p className="text-foreground-secondary mt-1">{formatCurrency(product.price)}</p>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
              
              {!query && (
                <div className="mt-8">
                  <h3 className="text-sm font-medium text-foreground-secondary uppercase tracking-widest mb-4">Popular Searches</h3>
                  <div className="flex flex-wrap gap-2">
                    {["Milk", "Atta", "Smartphone", "T-Shirt", "Sneakers", "Headphones"].map(term => (
                      <button 
                        key={term}
                        onClick={() => setQuery(term)}
                        className="px-4 py-2 rounded-full border border-border text-sm hover:border-accent hover:text-accent transition-colors"
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
