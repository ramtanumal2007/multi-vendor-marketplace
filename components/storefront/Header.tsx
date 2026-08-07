"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingBag, User, Menu, X, Sun, Moon, MapPin, ChevronDown } from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { cn } from "@/lib/utils";
import { SearchModal } from "./SearchModal";
import { useTheme } from "@/lib/context/ThemeContext";
import { createClient } from "@/lib/supabase";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const pathname = usePathname();
  const { itemCount, openDrawer } = useCart();
  const { theme, toggleTheme } = useTheme();
  const supabase = createClient();

  useEffect(() => {
    async function fetchCategories() {
      const { data } = await supabase.from("categories").select("name, slug").order("name");
      if (data) setCategories(data);
    }
    fetchCategories();
  }, [supabase]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-40 transition-all duration-300",
          isScrolled
            ? "h-[60px] bg-background/90 backdrop-blur-md border-b border-border shadow-[0_4px_30px_rgba(0,0,0,0.5)]"
            : "h-[80px] bg-gradient-to-b from-black/80 to-transparent"
        )}
      >
        <div className="mx-auto max-w-[1440px] px-6 md:px-16 h-full flex items-center justify-between">
          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 -ml-2"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Logo */}
          <Link href="/" className="font-serif text-2xl font-bold tracking-tight">
            MY STORE
          </Link>

          {/* Desktop Location (UI Only) */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-background-secondary rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ml-4 mr-auto">
            <MapPin className="w-4 h-4 text-accent" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-foreground-secondary uppercase tracking-wider leading-none">Deliver to</span>
              <span className="text-xs font-medium text-foreground leading-none mt-1 flex items-center gap-1">
                New Delhi, 110001 <ChevronDown className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 hover:bg-background-secondary rounded-full transition-colors hidden md:block"
            >
              <Search className="w-5 h-5" />
            </button>
            <button 
              onClick={toggleTheme}
              className="p-2 hover:bg-background-secondary rounded-full transition-colors hidden md:block"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link href="/account" className="p-2 hover:bg-background-secondary rounded-full transition-colors hidden md:block">
              <User className="w-5 h-5" />
            </Link>
            <button
              onClick={openDrawer}
              className="p-2 hover:bg-background-secondary rounded-full transition-colors relative"
            >
              <ShoppingBag className="w-5 h-5" />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute top-0 right-0 w-4 h-4 bg-accent text-white text-[10px] font-bold flex items-center justify-center rounded-full"
                  >
                    {itemCount}
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>

        {/* Categories Strip (Desktop) */}
        <div className="hidden md:flex items-center h-10 border-t border-border bg-background px-6 md:px-16 overflow-x-auto no-scrollbar gap-8 shadow-sm">
          <Link href="/products" className="text-sm font-medium text-foreground hover:text-accent whitespace-nowrap transition-colors flex items-center gap-1">
            All Products
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="text-sm font-medium text-foreground-secondary hover:text-accent whitespace-nowrap transition-colors"
            >
              {cat.name}
            </Link>
          ))}
          <Link href="/stores" className="text-sm font-bold text-secondary-accent hover:text-orange-500 whitespace-nowrap transition-colors ml-auto flex items-center gap-1">
            Local Stores <span className="px-1.5 py-0.5 bg-secondary-accent/10 rounded text-[10px]">NEW</span>
          </Link>
          <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border">
            <Link href="/seller/login" className="text-sm font-medium text-foreground-secondary hover:text-foreground whitespace-nowrap transition-colors">
              Seller Login
            </Link>
            <Link href="/seller/register" className="text-sm font-bold text-accent hover:text-accent/80 whitespace-nowrap transition-colors">
              Become a Seller
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background md:hidden flex flex-col"
          >
            <div className="h-[80px] px-6 flex items-center justify-between border-b border-border">
              <Link href="/" className="font-serif text-2xl font-bold tracking-tight">
                MY STORE
              </Link>
              <div className="flex gap-2">
                <button 
                  onClick={toggleTheme}
                  className="p-2 hover:bg-background-secondary rounded-full transition-colors"
                >
                  {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button
                  className="p-2 -mr-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {/* Mobile Location */}
            <div className="p-4 border-b border-border flex items-center gap-3 bg-background-secondary/50">
              <MapPin className="w-5 h-5 text-accent" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-foreground-secondary uppercase tracking-wider">Deliver to</span>
                <span className="text-sm font-medium text-foreground flex items-center gap-1">
                  New Delhi, 110001 <ChevronDown className="w-4 h-4" />
                </span>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
              <Link href="/products" className="text-xl font-semibold" onClick={() => setIsMobileMenuOpen(false)}>
                All Products
              </Link>
              <Link href="/stores" className="text-xl font-semibold text-secondary-accent flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
                Local Stores <span className="px-2 py-0.5 bg-secondary-accent/10 rounded text-[10px]">NEW</span>
              </Link>
              <div className="flex flex-col gap-3 mt-2 p-4 bg-accent/5 rounded-lg border border-accent/10">
                <Link href="/seller/register" className="text-lg font-bold text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                  Become a Seller
                </Link>
                <Link href="/seller/login" className="text-base font-medium text-foreground-secondary" onClick={() => setIsMobileMenuOpen(false)}>
                  Seller Login
                </Link>
              </div>
              <div className="h-px bg-border w-full my-2" />
              <h3 className="text-sm font-bold text-foreground-secondary uppercase tracking-wider">Categories</h3>
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.slug}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/categories/${cat.slug}`}
                    className="text-lg font-medium text-foreground"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {cat.name}
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="p-6 border-t border-border flex justify-between items-center bg-background">
              <Link href="/account" className="flex flex-col items-center gap-1 text-foreground-secondary hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                <User className="w-6 h-6" />
                <span className="text-xs font-medium">Account</span>
              </Link>
              <button 
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSearchOpen(true);
                }}
                className="flex flex-col items-center gap-1 text-foreground-secondary hover:text-foreground"
              >
                <Search className="w-6 h-6" />
                <span className="text-xs font-medium">Search</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
