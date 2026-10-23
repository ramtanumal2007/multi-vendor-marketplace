"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Package, MapPin, Heart, Settings, LogOut, ArrowLeft, Store, Cake, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/context/AuthContext";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const ACCOUNT_LINKS = [
  { label: "Dashboard", href: "/account", icon: User },
  { label: "Orders", href: "/account/orders", icon: Package },
  { label: "Wallet", href: "/account/wallet", icon: Wallet },
  { label: "Custom Cakes", href: "/account/custom-cakes", icon: Cake },
  { label: "Addresses", href: "/account/addresses", icon: MapPin },
  { label: "Wishlist", href: "/wishlist", icon: Heart },
  { label: "Settings", href: "/account/settings", icon: Settings },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const { isApprovedSeller, isPendingSeller } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        setIsLoading(false);
      }
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_OUT" || !session) {
          router.push("/login");
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    addToast({ title: "Logged out successfully", type: "success" });
    router.push("/login");
  };

  if (isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  const isSubPage = pathname !== "/account";

  return (
    <div className="mx-auto max-w-[1440px] px-3.5 sm:px-6 md:px-12 lg:px-16 pt-5 sm:pt-8 pb-28 md:pb-16 w-full">
      {/* Mobile Top Header: Easy-to-find Back Navigation */}
      <div className="flex items-center justify-between gap-4 mb-4 sm:mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-accent transition-colors bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Shop</span>
            </Link>
            {isSubPage && (
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-accent transition-colors bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl"
              >
                <User className="w-3.5 h-3.5" />
                <span>Account Dashboard</span>
              </Link>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-foreground">
            {pathname === "/account"
              ? "My Account"
              : pathname === "/account/wallet"
              ? "Customer Wallet"
              : pathname.startsWith("/account/orders")
              ? "My Orders"
              : pathname === "/account/addresses"
              ? "Saved Addresses"
              : pathname === "/account/custom-cakes"
              ? "Custom Cake Requests"
              : pathname === "/account/settings"
              ? "Account Settings"
              : "My Account"}
          </h1>
        </div>

        {/* Seller Switcher Header (Desktop / Tablet) */}
        {isApprovedSeller ? (
          <Link
            href="/seller"
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/50 hover:bg-blue-100 transition-colors"
          >
            <Store className="w-4 h-4" />
            <span>Seller Hub</span>
          </Link>
        ) : isPendingSeller ? (
          <Link
            href="/seller/tracking"
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/50"
          >
            <Store className="w-4 h-4" />
            <span>Track Application</span>
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col md:flex-row gap-6 lg:gap-12">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="flex flex-col gap-6">
            {/* Primary Navigation Tabs (Hidden on mobile if on dashboard to allow the 10 rich cards to be primary) */}
            <nav className={`${isSubPage ? "flex" : "hidden md:flex"} flex-row md:flex-col gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none`}>
              {ACCOUNT_LINKS.filter(l => l.href !== "/account/settings").map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-accent text-white shadow-sm shadow-accent/20"
                        : "text-foreground-secondary hover:bg-background-secondary hover:text-foreground"
                    }`}
                  >
                    <link.icon className="w-4 h-4 shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Polished Menu / Action Card for Settings, Seller Hub, and Sign Out */}
            <div className="hidden md:flex bg-background-secondary/60 dark:bg-slate-900/60 border border-border rounded-2xl p-3.5 sm:p-4 flex-col gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground-secondary px-1">
                Account Settings &amp; Actions
              </span>

              {/* Settings Link */}
              <Link
                href="/account/settings"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                  pathname === "/account/settings"
                    ? "bg-accent text-white font-bold"
                    : "text-foreground-secondary hover:bg-background-secondary hover:text-foreground"
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Account Settings</span>
              </Link>

              {/* Seller Hub option in action card */}
              {isApprovedSeller ? (
                <Link
                  href="/seller"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>Switch to Seller Hub</span>
                </Link>
              ) : isPendingSeller ? (
                <Link
                  href="/seller/tracking"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 transition-colors"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>Track Application</span>
                </Link>
              ) : (
                <Link
                  href="/seller/register"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-accent hover:bg-accent/10 transition-colors"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>Become a Seller</span>
                </Link>
              )}

              {/* Genuine Sign Out Action */}
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
