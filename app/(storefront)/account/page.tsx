"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  Package,
  ArrowRight,
  Wallet,
  ShoppingBag,
  RotateCcw,
  Heart,
  MapPin,
  Bell,
  HelpCircle,
  User as UserIcon,
  LogOut,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  CheckCircle2,
  Cake,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { User } from "@supabase/supabase-js";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

interface RecentOrderRow {
  id: string;
  order_number: string;
  created_at: string;
  fulfillment_status: string;
  total: number;
}

interface WalletSnapshot {
  id: string;
  balance: number;
  currency: string;
}

interface WalletTransaction {
  id: string;
  amount: number;
  direction: "credit" | "debit";
  description: string;
  created_at: string;
}

export default function AccountDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [isWalletLoading, setIsWalletLoading] = useState(true);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [refreshingWallet, setRefreshingWallet] = useState(false);

  const supabase = createClient();
  const router = useRouter();
  const { addToast } = useToast();

  const fetchWallet = async () => {
    try {
      setRefreshingWallet(true);
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.wallet) {
          setWallet(data.wallet);
          setWalletTransactions((data.transactions || []).slice(0, 2));
        }
      }
    } catch (err) {
      console.warn("Failed to load customer wallet snapshot:", err);
    } finally {
      setIsWalletLoading(false);
      setRefreshingWallet(false);
    }
  };

  useEffect(() => {
    async function initAccount() {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser(data.user);

        // Fetch recent orders
        const { data: orderData, count } = await supabase
          .from("orders")
          .select("*", { count: "exact" })
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false });

        if (orderData) {
          setRecentOrders(orderData.slice(0, 4) as RecentOrderRow[]);
        }
        if (count !== null) {
          setTotalOrders(count);
        }
        setIsOrdersLoading(false);
      } else {
        router.push("/login");
      }
    }

    initAccount();
    fetchWallet();
  }, [supabase, router]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      addToast({ title: "Logged out successfully", type: "success" });
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  if (!user) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-3xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
          <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
          <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  const activeDeliveriesCount = recentOrders.filter(
    (o) =>
      o.fulfillment_status !== "delivered" &&
      o.fulfillment_status !== "DELIVERED" &&
      o.fulfillment_status !== "cancelled" &&
      o.fulfillment_status !== "CANCELLED"
  ).length;

  // The 10 required navigation items
  const NAVIGATION_CARDS = [
    {
      id: "dashboard",
      title: "Account Dashboard",
      description: "Overview of your orders, wallet balance, and delivery activity.",
      icon: UserIcon,
      href: "/account",
      isCurrent: true,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60",
      badge: "Current",
    },
    {
      id: "wallet",
      title: "My Wallet",
      description: "Available store credits, price difference adjustments, and full ledger.",
      icon: Wallet,
      href: "/account/wallet",
      isCurrent: false,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60",
      badge: wallet ? formatCurrency(wallet.balance, wallet.currency || "INR") : undefined,
      highlightBadge: true,
    },
    {
      id: "orders",
      title: "My Orders",
      description: "Track current shipments, reorder favorites, and download tax invoices.",
      icon: ShoppingBag,
      href: "/account/orders",
      isCurrent: false,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60",
      badge: totalOrders > 0 ? `${totalOrders} orders` : undefined,
    },
    {
      id: "returns",
      title: "Returns & Replacements",
      description: "Request easy item returns, order replacements, and track refund status.",
      icon: RotateCcw,
      href: "/account/orders",
      isCurrent: false,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60",
    },
    {
      id: "wishlist",
      title: "Wishlist",
      description: "Saved products you love, price drop tracking, and favorite items.",
      icon: Heart,
      href: "/wishlist",
      isCurrent: false,
      color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60",
    },
    {
      id: "addresses",
      title: "Saved Addresses",
      description: "Manage default delivery locations and recipient contact details.",
      icon: MapPin,
      href: "/account/addresses",
      isCurrent: false,
      color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60",
    },
    {
      id: "custom-cakes",
      title: "Custom Cakes",
      description: "Track custom designer cake orders, baker quotes, and approvals.",
      icon: Cake,
      href: "/account/custom-cakes",
      isCurrent: false,
      color: "text-pink-600 bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-900/60",
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Order updates, delivery tracking alerts, and system announcements.",
      icon: Bell,
      onClick: () => {
        const bell = document.getElementById("header-notification-bell");
        if (bell) {
          bell.click();
        } else {
          router.push("/account");
        }
      },
      isCurrent: false,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/60",
    },
    {
      id: "support",
      title: "Customer Support",
      description: "Help center, frequently asked questions, and direct support.",
      icon: HelpCircle,
      href: "/support",
      isCurrent: false,
      color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900/60",
    },
    {
      id: "profile",
      title: "My Profile",
      description: "Personal account details, security credentials, and email settings.",
      icon: ShieldCheck,
      href: "/account/settings",
      isCurrent: false,
      color: "text-slate-700 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    },
    {
      id: "logout",
      title: "Logout",
      description: "Securely sign out of your account on this device.",
      icon: LogOut,
      onClick: handleLogout,
      isCurrent: false,
      isDestructive: true,
      color: "text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60",
    },
  ];

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-5xl">
      {/* 1. WELCOME & PROFILE HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 sm:p-7 rounded-3xl shadow-lg border border-slate-700/80 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-accent text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
              {user.email ? user.email.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified Customer
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate mt-0.5">
                {user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "Welcome")}
              </h1>
              <p className="text-xs text-slate-300 truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
            <Link
              href="/account/settings"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Edit Profile
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* 2. ACCOUNT OVERVIEW STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
            <Package className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {isOrdersLoading ? "-" : totalOrders}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Lifetime purchases</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Deliveries</span>
            <Truck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {isOrdersLoading ? "-" : activeDeliveriesCount}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">In transit or processing</span>
        </div>

        <Link
          href="/account/wallet"
          className="col-span-2 sm:col-span-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-500/40 hover:shadow-md transition-all group block"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Store Credit</span>
            <Wallet className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            {isWalletLoading ? "-" : formatCurrency(wallet?.balance || 0)}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5 group-hover:text-emerald-600 transition-colors">
            Ready to use • View Full Wallet →
          </span>
        </Link>
      </div>

      {/* 3. ACCOUNT FEATURES & SERVICES (PRIMARY NAVIGATION NEAR TOP) */}
      <div>
        <div className="mb-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            Account Features & Services
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quickly navigate all customer tools and orders without searching hidden menus.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {NAVIGATION_CARDS.map((item) => {
            const Icon = item.icon;

            const content = (
              <div
                className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 text-left w-full group ${
                  item.isCurrent
                    ? "bg-accent/5 dark:bg-accent/10 border-accent/40 shadow-xs"
                    : item.isDestructive
                    ? "bg-white dark:bg-slate-900 border-red-200/60 dark:border-red-950/60 hover:bg-red-50/50 dark:hover:bg-red-950/20"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-accent/40 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${item.color} group-hover:scale-105 transition-transform`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-sm font-bold truncate ${
                          item.isDestructive
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-900 dark:text-slate-100 group-hover:text-accent transition-colors"
                        }`}
                      >
                        {item.title}
                      </h3>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.highlightBadge
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-mono"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            );

            if (item.onClick) {
              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  type="button"
                  className="w-full text-left focus:outline-none"
                >
                  {content}
                </button>
              );
            }

            return (
              <Link key={item.id} href={item.href || "/account"} className="block w-full">
                {content}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 5. RECENT ORDERS SECTION */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Recent Orders</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track recent shipments and view order details.
            </p>
          </div>
          <Link
            href="/account/orders"
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isOrdersLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            Loading recent orders...
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">No orders placed yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Once you make your first purchase, you can track delivery and manage returns here.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-xs font-bold rounded-xl shadow-xs hover:bg-accent-hover transition-colors"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {recentOrders.map((order) => {
              const isDelivered =
                order.fulfillment_status === "delivered" || order.fulfillment_status === "DELIVERED";
              const isCancelled =
                order.fulfillment_status === "cancelled" || order.fulfillment_status === "CANCELLED";

              return (
                <div
                  key={order.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                        ORDER #{order.order_number}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(order.created_at)}</span>
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                        isDelivered
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200"
                          : isCancelled
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200"
                      }`}
                    >
                      {order.fulfillment_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Total Amount</span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                        {formatCurrency(order.total)}
                      </span>
                    </div>

                    <Link
                      href={`/account/orders/${order.id}`}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-accent bg-accent/10 hover:bg-accent hover:text-white transition-colors flex items-center gap-1"
                    >
                      <span>Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
