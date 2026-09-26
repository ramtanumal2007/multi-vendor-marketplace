"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { useAuth } from "@/lib/context/AuthContext";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { user } = useAuth();

  // Trigger search modal via global event
  const handleOpenSearch = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-search-modal"));
    }
  };

  const navItems = [
    {
      label: "Home",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
    },
    {
      label: "Categories",
      href: "/products",
      icon: LayoutGrid,
      isActive: pathname === "/products" || pathname.startsWith("/categories"),
    },
    {
      label: "Search",
      href: "#search",
      icon: Search,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        handleOpenSearch();
      },
      isActive: false,
    },
    {
      label: "Cart",
      href: "/cart",
      icon: ShoppingBag,
      badge: itemCount > 0 ? itemCount : null,
      isActive: pathname === "/cart",
    },
    {
      label: user ? "Account" : "Sign In",
      href: user ? "/account" : "/login",
      icon: User,
      isActive: pathname.startsWith("/account") || pathname.startsWith("/login"),
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)] select-none"
    >
      <div className="grid grid-cols-5 h-[56px] items-center px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isCurrent = item.isActive;

          if (item.onClick) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`flex flex-col items-center justify-center h-full py-1 text-[10px] font-medium transition-colors relative ${
                  isCurrent
                    ? "text-accent font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5 mb-0.5" />
                </div>
                <span className="truncate max-w-[64px]">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center h-full py-1 text-[10px] font-medium transition-colors relative ${
                isCurrent
                  ? "text-accent font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5 mb-0.5" />
                {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-accent text-white font-black text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 shadow-xs animate-in zoom-in-75 duration-150">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className="truncate max-w-[64px]">{item.label}</span>
              {isCurrent && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
