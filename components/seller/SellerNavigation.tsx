"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Store,
  Package,
  ShoppingCart,
  User,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Zap,
  Boxes,
  BarChart3,
  Landmark,
  Cake,
  RotateCcw,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import { SellerNotificationCenter } from "@/components/seller/SellerNotificationCenter";

export const SELLER_NAV_LINKS = [
  { label: "Dashboard", href: "/seller", icon: LayoutDashboard },
  { label: "My Store", href: "/seller/store", icon: Store },
  { label: "Products", href: "/seller/products", icon: Package },
  { label: "Inventory", href: "/seller/inventory", icon: Boxes },
  { label: "Orders", href: "/seller/orders", icon: ShoppingCart },
  { label: "Returns & Exchanges", href: "/seller/returns", icon: RotateCcw },
  { label: "Custom Cakes", href: "/seller/custom-cakes", icon: Cake },
  { label: "Analytics", href: "/seller/analytics", icon: BarChart3 },
  { label: "Membership", href: "/seller/membership", icon: Zap },
  { label: "Bank Account", href: "/seller/bank-account", icon: Landmark },
  { label: "Earnings & Payouts", href: "/seller/wallet", icon: Wallet },
  { label: "Application Tracking", href: "/seller/tracking", icon: ClipboardList },
];

interface SellerNavigationProps {
  sellerId: string;
  children: React.ReactNode;
}

export function SellerNavigation({ sellerId, children }: SellerNavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Handle ESC key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const isActive = (href: string) => {
    if (href === "/seller") {
      return pathname === "/seller";
    }
    return pathname.startsWith(href);
  };

  const currentPageTitle =
    SELLER_NAV_LINKS.find((link) => isActive(link.href))?.label || "Seller Hub";

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0 h-full">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 shrink-0">
          <Link href="/seller" className="flex items-center space-x-2.5 font-extrabold text-xl text-slate-900">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <Store className="h-5 w-5" />
            </div>
            <span>Seller Hub</span>
          </Link>
        </div>

        {/* Navigation Items (Scrolls independently) */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          {SELLER_NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`flex items-center px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? "bg-blue-50 text-blue-700 font-bold shadow-xs"
                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon
                  className={`h-4 w-4 mr-3 shrink-0 ${
                    active ? "text-blue-600" : "text-slate-500"
                  }`}
                />
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Sidebar Footer */}
        <div className="p-4 border-t border-slate-200 shrink-0 bg-white space-y-1">
          <Link
            href="/account"
            className="flex items-center px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <User className="h-4 w-4 mr-2.5 text-slate-400" />
            <span>Customer Account</span>
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2.5 text-red-500" />
              <span>Logout</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile Slide-Out Drawer & Backdrop */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seller Navigation Menu"
          className="fixed inset-0 z-50 md:hidden"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-300">
            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 shrink-0">
              <Link
                href="/seller"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center space-x-2.5 font-extrabold text-lg text-slate-900"
              >
                <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
                  <Store className="h-4 w-4" />
                </div>
                <span>Seller Hub</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 -mr-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Links */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {SELLER_NAV_LINKS.map((link) => {
                const active = isActive(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? "bg-blue-50 text-blue-700 font-bold shadow-xs"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 mr-3 shrink-0 ${
                        active ? "text-blue-600" : "text-slate-500"
                      }`}
                    />
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 shrink-0 space-y-1 bg-slate-50/50">
              <Link
                href="/account"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <User className="h-4 w-4 mr-2.5 text-slate-400" />
                <span>Back to Customer Account</span>
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center px-3.5 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2.5 text-red-500" />
                  <span>Logout</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger Button for Mobile */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Seller Navigation Menu"
              className="p-2 -ml-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg md:hidden transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-2 truncate">
              <span className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentPageTitle}
              </span>
              <span className="hidden sm:inline-block text-xs font-medium text-slate-400">
                • Partner Portal
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4 shrink-0">
            <Link
              href="/"
              target="_blank"
              className="hidden sm:inline-flex text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              View Storefront
            </Link>
            <SellerNotificationCenter sellerId={sellerId} />
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
