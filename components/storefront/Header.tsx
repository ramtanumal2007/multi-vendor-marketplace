"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ShoppingBag,
  User,
  Menu,
  X,
  Sun,
  Moon,
  MapPin,
  ChevronDown,
  Package,
  Heart,
  Store,
  HelpCircle,
  LogOut,
  LogIn,
  LayoutDashboard,
  Sparkles,
  ShieldCheck
} from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { SearchModal } from "./SearchModal";
import { useTheme } from "@/lib/context/ThemeContext";
import { createClient } from "@/lib/supabase";
import { CustomerNotificationCenter } from "@/components/customer/CustomerNotificationCenter";
import { TopCategoryNav } from "./TopCategoryNav";
import { useAuth } from "@/lib/context/AuthContext";

interface CategoryItem {
  name: string;
  slug: string;
}

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  const { user: authUser, fullName, isApprovedSeller, isPendingSeller, sellerStatus } = useAuth();
  const { itemCount, openDrawer } = useCart();
  const { theme, toggleTheme } = useTheme();
  const supabase = createClient();

  const displayName = fullName || (authUser?.user_metadata?.full_name as string) || (authUser?.user_metadata?.name as string) || (authUser?.email ? authUser.email.split("@")[0] : null);

  const user = authUser ? {
    id: authUser.id,
    email: authUser.email,
    name: displayName,
    isApprovedSeller,
    isPendingSeller,
    sellerStatus,
  } : null;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 35);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    async function fetchCategories() {
      const { data } = await supabase.from("categories").select("name, slug").order("name");
      if (data) setCategories(data);
    }
    fetchCategories();
  }, [supabase]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    const handleOpenSearchEvent = () => setIsSearchOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-search-modal", handleOpenSearchEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-search-modal", handleOpenSearchEvent);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsAccountMenuOpen(false);
  };

  return (
    <>
      {/* SINGLE FIXED STOREFRONT HEADER CONTAINER */}
      <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 flex flex-col select-none ${
        isScrolled
          ? "bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-md shadow-slate-950/5 dark:shadow-slate-950/30 border-b border-slate-200/80 dark:border-slate-800/80"
          : "bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
      }`}>

        {/* ROW 1: TOP UTILITY BAR (Desktop only, collapses on scroll) */}
        <div className={`hidden md:flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/95 dark:bg-slate-950/70 px-4 md:px-12 text-[12px] text-slate-500 dark:text-slate-400 overflow-hidden transition-all duration-300 ${
          isScrolled
            ? "max-h-0 opacity-0 -translate-y-2 py-0 border-none pointer-events-none"
            : "max-h-[40px] h-[38px] min-h-[38px] opacity-100"
        }`}>
          <div className="max-w-[1440px] mx-auto w-full flex items-center justify-between">
            {/* Left Brand Reassurance */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>India&apos;s Verified Multi-Vendor Marketplace</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="hidden lg:inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>100% Genuine Local &amp; National Stores</span>
              </span>
            </div>

            {/* Right Utility Links */}
            <div className="flex items-center gap-5 font-medium">
              {user?.isApprovedSeller ? (
                <Link
                  href="/seller"
                  className="flex items-center gap-1.5 text-accent hover:text-accent-hover hover:underline transition-colors font-semibold"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Switch to Seller Hub</span>
                </Link>
              ) : user?.isPendingSeller ? (
                <Link
                  href="/seller/tracking"
                  className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline transition-colors font-semibold"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Track Application</span>
                </Link>
              ) : (
                <Link
                  href="/seller/register"
                  className="flex items-center gap-1.5 text-accent hover:text-accent-hover hover:underline transition-colors font-semibold"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Become a Seller</span>
                </Link>
              )}
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <Link
                href="/stores"
                className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Local Stores</span>
              </Link>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <Link
                href="/support"
                className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Help &amp; Support</span>
              </Link>
              {user && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <Link
                    href="/account/orders"
                    className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1 text-slate-700 dark:text-slate-300"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Track Orders</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: MAIN MARKETPLACE HEADER (~54px on scroll / ~64px default) */}
        <div className="bg-transparent w-full transition-all duration-300">
          <div className={`mx-auto max-w-[1440px] px-4 md:px-12 w-full flex items-center justify-between gap-3 md:gap-6 transition-all duration-300 ${
            isScrolled ? "h-[54px] md:h-[58px] min-h-[54px] md:min-h-[58px]" : "h-[60px] md:h-[64px] min-h-[60px] md:min-h-[64px]"
          }`}>

            {/* Left Section: Logo + Subtitle (LOCKED TOGETHER) + Deliver to Location */}
            <div className="flex items-center gap-3 md:gap-5 shrink-0">
              {/* Mobile Menu Toggle */}
              <button
                className="md:hidden p-2 -ml-2 text-foreground focus:outline-none hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu className="w-6 h-6" />
              </button>

              {/* Logo Branding Block */}
              <Link
                href="/"
                className="flex flex-col shrink-0 py-0.5 select-none group"
              >
                <span className="font-serif text-2xl md:text-[26px] font-black tracking-tight text-slate-950 dark:text-white whitespace-nowrap leading-none group-hover:opacity-90 transition-opacity">
                  VENDOSMITH
                </span>
                <span className="text-[9px] font-bold tracking-[0.2em] text-accent uppercase leading-none mt-1">
                  MARKETPLACE
                </span>
              </Link>

              {/* Desktop Deliver to Location Group */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 rounded-xl transition-colors cursor-pointer shrink-0 border border-slate-200/70 dark:border-slate-700/70 select-none">
                <MapPin className="w-4 h-4 text-accent shrink-0" />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">Deliver to</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none mt-0.5 flex items-center gap-1">
                    New Delhi, 110001 <ChevronDown className="w-3 h-3 text-slate-400" />
                  </span>
                </div>
              </div>
            </div>

            {/* Center Section: Large Dominant Marketplace Search Bar */}
            <div
              onClick={() => setIsSearchOpen(true)}
              className="flex-1 max-w-[740px] mx-auto hidden md:flex items-center cursor-pointer group"
              role="search"
              aria-label="Search products"
            >
              <div className="relative w-full flex items-center h-[44px] bg-slate-100/90 hover:bg-slate-100 dark:bg-slate-800/90 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-700/90 rounded-xl group-hover:border-accent/60 dark:group-hover:border-accent/60 transition-colors px-4 shadow-2xs">
                <Search className="w-4 h-4 text-slate-400 group-hover:text-accent transition-colors mr-3 shrink-0" />
                <span className="text-sm text-slate-500 dark:text-slate-400 select-none flex-1 truncate font-normal">
                  Search for products, brands and more...
                </span>
                <kbd className="hidden lg:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-2xs">
                  ⌘K
                </kbd>
              </div>
            </div>

            {/* Right Section: Actions (Theme, Notification, Account, Cart) */}
            <div className="flex items-center gap-1 md:gap-2.5 shrink-0">
              {/* Mobile Search Button */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors md:hidden text-foreground"
                aria-label="Search products"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-700 dark:text-slate-200"
                aria-label="Toggle theme"
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {theme === "dark" ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
              </button>

              {/* Customer Notification Bell */}
              {user?.id && (
                <div className="flex items-center">
                  <CustomerNotificationCenter userId={user.id} />
                </div>
              )}

              {/* Account Menu */}
              <div className="relative">
                <button
                  onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                  className="flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors focus:outline-none text-slate-800 dark:text-slate-200"
                  aria-label="Customer account menu"
                  aria-expanded={isAccountMenuOpen}
                >
                  <User className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                  <span className="hidden lg:inline text-xs font-semibold">
                    {user ? (user.name ? user.name.trim().split(/\s+/)[0] : (user.email?.split("@")[0] || "Account")) : "Sign In"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
                </button>

                {isAccountMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsAccountMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                          {user?.name || (user?.email ? user.email.split("@")[0] : "Guest Visitor")}
                        </p>
                        {user?.email && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-normal">
                            {user.email}
                          </p>
                        )}
                      </div>

                      <nav className="py-1 text-xs font-medium">
                        {user ? (
                          <>
                            <Link
                              href="/account"
                              onClick={() => setIsAccountMenuOpen(false)}
                              className="flex items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <LayoutDashboard className="w-4 h-4 text-accent" />
                              Dashboard
                            </Link>
                            <Link
                              href="/account/orders"
                              onClick={() => setIsAccountMenuOpen(false)}
                              className="flex items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Package className="w-4 h-4 text-slate-500" />
                              My Orders
                            </Link>

                            {/* Seller Navigation Option */}
                            {user.isApprovedSeller ? (
                              <Link
                                href="/seller"
                                onClick={() => setIsAccountMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border-y border-blue-100 dark:border-blue-900/40 my-0.5"
                              >
                                <Store className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <span>Switch to Seller Hub</span>
                              </Link>
                            ) : user.isPendingSeller ? (
                              <Link
                                href="/seller/tracking"
                                onClick={() => setIsAccountMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-amber-600 dark:text-amber-400 font-semibold bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors border-y border-amber-100 dark:border-amber-900/40 my-0.5"
                              >
                                <Store className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span>Track Application</span>
                              </Link>
                            ) : (
                              <Link
                                href="/seller/register"
                                onClick={() => setIsAccountMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-accent font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Store className="w-4 h-4 text-accent" />
                                <span>Become a Seller</span>
                              </Link>
                            )}
                          </>
                        ) : (
                          <>
                            <Link
                              href="/login"
                              onClick={() => setIsAccountMenuOpen(false)}
                              className="flex items-center gap-2.5 px-4 py-2.5 text-accent font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <LogIn className="w-4 h-4 text-accent" />
                              Sign In / Register
                            </Link>
                            <Link
                              href="/seller/register"
                              onClick={() => setIsAccountMenuOpen(false)}
                              className="flex items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Store className="w-4 h-4 text-slate-500" />
                              <span>Become a Seller</span>
                            </Link>
                          </>
                        )}

                        <Link
                          href="/wishlist"
                          onClick={() => setIsAccountMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Heart className="w-4 h-4 text-slate-500" />
                          Wishlist
                        </Link>

                        <button
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            openDrawer();
                          }}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                        >
                          <ShoppingBag className="w-4 h-4 text-slate-500" />
                          Shopping Cart ({itemCount})
                        </button>

                        <Link
                          href="/stores"
                          onClick={() => setIsAccountMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Store className="w-4 h-4 text-slate-500" />
                          Local Stores
                        </Link>

                        <Link
                          href="/support"
                          onClick={() => setIsAccountMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <HelpCircle className="w-4 h-4 text-slate-500" />
                          Help &amp; Support
                        </Link>
                      </nav>

                      {user && (
                        <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={handleSignOut}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors text-left"
                          >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Cart Trigger */}
              <button
                onClick={openDrawer}
                id="header-cart-button"
                className="flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors relative text-slate-800 dark:text-slate-200"
                aria-label="View shopping cart"
              >
                <div className="relative">
                  <ShoppingBag className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                  <AnimatePresence>
                    {itemCount > 0 && (
                      <motion.div
                        key={itemCount}
                        initial={{ scale: 0.6 }}
                        animate={{ scale: [1, 1.35, 1] }}
                        exit={{ scale: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        id="header-cart-badge"
                        className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold flex items-center justify-center rounded-full shadow-xs"
                      >
                        {itemCount}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <span className="hidden lg:inline text-xs font-semibold">Cart</span>
              </button>
            </div>
          </div>
        </div>

        {/* ROW 3: CATEGORY NAVIGATION BAR (~46px mobile / ~50px desktop) */}
        <TopCategoryNav />
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
            <div className="h-[70px] px-6 flex items-center justify-between border-b border-border bg-background">
              <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-white" onClick={() => setIsMobileMenuOpen(false)}>
                VENDOSMITH
              </Link>
              <div className="flex items-center gap-2">
                {user?.id && (
                  <CustomerNotificationCenter userId={user.id} />
                )}
                <button
                  onClick={toggleTheme}
                  className="p-2 hover:bg-background-secondary rounded-full transition-colors"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
                </button>
                <button
                  className="p-2 -mr-2 text-foreground"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Mobile Location */}
            <div className="p-4 border-b border-border flex items-center gap-3 bg-background-secondary/50">
              <MapPin className="w-5 h-5 text-accent shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-foreground-secondary uppercase tracking-wider">Deliver to</span>
                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                  New Delhi, 110001 <ChevronDown className="w-4 h-4 text-slate-400" />
                </span>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
              <Link href="/products" className="text-base font-semibold" onClick={() => setIsMobileMenuOpen(false)}>
                All Products
              </Link>
              <Link href="/stores" className="text-base font-semibold text-secondary-accent flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
                Local Stores <span className="px-2 py-0.5 bg-secondary-accent/10 rounded text-[10px] font-bold">VERIFIED</span>
              </Link>

              {user ? (
                <div className="flex flex-col gap-2 p-3 bg-background-secondary/60 rounded-xl border border-border">
                  <span className="text-[10px] font-bold text-foreground-secondary uppercase tracking-wider">My Account</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-foreground truncate">{user.name || (user.email ? user.email.split("@")[0] : "Account")}</span>
                    {user.email && (
                      <span className="text-xs text-foreground-secondary truncate">{user.email}</span>
                    )}
                  </div>
                  <Link href="/account" className="text-sm font-medium text-foreground hover:text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                    Dashboard
                  </Link>
                  <Link href="/account/orders" className="text-sm font-medium text-foreground hover:text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                    My Orders
                  </Link>
                  <Link href="/wishlist" className="text-sm font-medium text-foreground hover:text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                    Wishlist
                  </Link>
                </div>
              ) : (
                <Link href="/login" className="text-base font-bold text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                  Sign In / Register
                </Link>
              )}

              {user?.isApprovedSeller ? (
                <div className="flex flex-col gap-2 p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/50">
                  <Link
                    href="/seller"
                    className="text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Store className="w-4 h-4" />
                    <span>Switch to Seller Hub</span>
                  </Link>
                </div>
              ) : user?.isPendingSeller ? (
                <div className="flex flex-col gap-2 p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  <Link
                    href="/seller/tracking"
                    className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Store className="w-4 h-4" />
                    <span>Track Seller Application</span>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <Link
                    href="/seller/register"
                    className="text-sm font-bold text-accent flex items-center gap-1.5"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Store className="w-4 h-4" />
                    <span>Become a Seller</span>
                  </Link>
                  {!user && (
                    <Link
                      href="/seller/login"
                      className="text-xs font-medium text-foreground-secondary hover:text-foreground"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      Seller Portal Login
                    </Link>
                  )}
                </div>
              )}

              <div className="h-px bg-border w-full my-1" />
              <h3 className="text-xs font-bold text-foreground-secondary uppercase tracking-wider">Browse Categories</h3>
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.slug}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <Link
                    href={`/categories/${cat.slug}`}
                    className="text-sm font-medium text-foreground hover:text-accent transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {cat.name}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="p-6 border-t border-border flex justify-between items-center bg-background">
              {user ? (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-destructive"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              ) : (
                <Link href="/login" className="flex flex-col items-center gap-1 text-foreground-secondary hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                  <User className="w-5 h-5" />
                  <span className="text-xs font-medium">Account</span>
                </Link>
              )}

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSearchOpen(true);
                }}
                className="flex flex-col items-center gap-1 text-foreground-secondary hover:text-foreground"
              >
                <Search className="w-5 h-5" />
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
