"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Bell
} from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { cn } from "@/lib/utils";
import { SearchModal } from "./SearchModal";
import { useTheme } from "@/lib/context/ThemeContext";
import { createClient } from "@/lib/supabase";
import { CustomerNotificationCenter } from "@/components/customer/CustomerNotificationCenter";

interface CategoryItem {
  name: string;
  slug: string;
}

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  
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

    // Check user auth state
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setUser(data.user ? { id: data.user.id, email: data.user.email } : null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsAccountMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAccountMenuOpen(false);
  };

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-40 h-[60px] bg-background/95 backdrop-blur-md border-b border-border shadow-xs transition-all duration-300"
      >
        <div className="mx-auto max-w-[1440px] px-4 md:px-12 h-full flex items-center justify-between">
          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 -ml-2 text-foreground focus:outline-none"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Logo */}
          <Link href="/" className="font-serif text-xl md:text-2xl font-bold tracking-tight text-foreground">
            MY STORE
          </Link>

          {/* Desktop Location (UI Only) */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-background-secondary rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ml-4 mr-auto">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-foreground-secondary uppercase tracking-wider leading-none">Deliver to</span>
              <span className="text-xs font-medium text-foreground leading-none mt-0.5 flex items-center gap-1">
                New Delhi, 110001 <ChevronDown className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 md:gap-3">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 hover:bg-background-secondary rounded-full transition-colors hidden md:block"
              aria-label="Search products"
            >
              <Search className="w-5 h-5" />
            </button>

            <button 
              onClick={toggleTheme}
              className="p-2 hover:bg-background-secondary rounded-full transition-colors hidden md:block"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Customer Notification Bell (Directly visible in header) */}
            {user?.id && (
              <div className="flex items-center">
                <CustomerNotificationCenter userId={user.id} />
              </div>
            )}

            {/* Collapsible Customer Account Menu */}
            <div className="relative">
              <button
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                className="p-2 hover:bg-background-secondary rounded-full transition-colors focus:outline-none"
                aria-label="Customer account menu"
                aria-expanded={isAccountMenuOpen}
              >
                <User className="w-5 h-5" />
              </button>

              {isAccountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAccountMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-2xl shadow-xl z-50 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-3 border-b border-border bg-background-secondary/40">
                      <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">Account</p>
                      <p className="text-sm font-bold text-foreground truncate mt-0.5">
                        {user?.email || "Guest Visitor"}
                      </p>
                    </div>

                    <nav className="py-1 text-xs font-medium">
                      {user ? (
                        <>
                          <Link
                            href="/account"
                            onClick={() => setIsAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-foreground hover:bg-background-secondary transition-colors"
                          >
                            <LayoutDashboard className="w-4 h-4 text-accent" />
                            Dashboard
                          </Link>
                          <Link
                            href="/account/orders"
                            onClick={() => setIsAccountMenuOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-foreground hover:bg-background-secondary transition-colors"
                          >
                            <Package className="w-4 h-4 text-foreground-secondary" />
                            My Orders
                          </Link>
                        </>
                      ) : (
                        <Link
                          href="/login"
                          onClick={() => setIsAccountMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-accent font-bold hover:bg-background-secondary transition-colors"
                        >
                          <LogIn className="w-4 h-4 text-accent" />
                          Sign In / Register
                        </Link>
                      )}

                      <Link
                        href="/wishlist"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-foreground hover:bg-background-secondary transition-colors"
                      >
                        <Heart className="w-4 h-4 text-foreground-secondary" />
                        Wishlist
                      </Link>

                      <button
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          openDrawer();
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-foreground hover:bg-background-secondary transition-colors text-left"
                      >
                        <ShoppingBag className="w-4 h-4 text-foreground-secondary" />
                        Shopping Cart ({itemCount})
                      </button>

                      <Link
                        href="/stores"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-foreground hover:bg-background-secondary transition-colors"
                      >
                        <Store className="w-4 h-4 text-foreground-secondary" />
                        Local Stores
                      </Link>

                      <Link
                        href="/faq"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-foreground hover:bg-background-secondary transition-colors"
                      >
                        <HelpCircle className="w-4 h-4 text-foreground-secondary" />
                        Help & FAQ
                      </Link>
                    </nav>

                    {user && (
                      <div className="pt-1 mt-1 border-t border-border">
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
              className="p-2 hover:bg-background-secondary rounded-full transition-colors relative"
              aria-label="View shopping cart"
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
              <div className="flex items-center gap-2">
                {user?.id && (
                  <CustomerNotificationCenter userId={user.id} />
                )}
                <button 
                  onClick={toggleTheme}
                  className="p-2 hover:bg-background-secondary rounded-full transition-colors"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button
                  className="p-2 -mr-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close menu"
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

            <nav className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
              <Link href="/products" className="text-lg font-semibold" onClick={() => setIsMobileMenuOpen(false)}>
                All Products
              </Link>
              <Link href="/stores" className="text-lg font-semibold text-secondary-accent flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
                Local Stores <span className="px-2 py-0.5 bg-secondary-accent/10 rounded text-[10px]">NEW</span>
              </Link>
              
              {user ? (
                <div className="flex flex-col gap-2 p-3 bg-background-secondary/60 rounded-xl border border-border">
                  <span className="text-[10px] font-bold text-foreground-secondary uppercase tracking-wider">My Account</span>
                  <Link href="/account" className="text-sm font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                    Dashboard
                  </Link>
                  <Link href="/account/orders" className="text-sm font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                    My Orders
                  </Link>
                  <Link href="/wishlist" className="text-sm font-medium text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                    Wishlist
                  </Link>
                </div>
              ) : (
                <Link href="/login" className="text-lg font-bold text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                  Sign In / Register
                </Link>
              )}

              <div className="flex flex-col gap-3 p-4 bg-accent/5 rounded-lg border border-accent/10">
                <Link href="/seller/register" className="text-base font-bold text-accent" onClick={() => setIsMobileMenuOpen(false)}>
                  Become a Seller
                </Link>
                <Link href="/seller/login" className="text-sm font-medium text-foreground-secondary" onClick={() => setIsMobileMenuOpen(false)}>
                  Seller Login
                </Link>
              </div>

              <div className="h-px bg-border w-full my-1" />
              <h3 className="text-xs font-bold text-foreground-secondary uppercase tracking-wider">Categories</h3>
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.slug}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link
                    href={`/categories/${cat.slug}`}
                    className="text-base font-medium text-foreground"
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
                <Link href="/account" className="flex flex-col items-center gap-1 text-foreground-secondary hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                  <User className="w-6 h-6" />
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
