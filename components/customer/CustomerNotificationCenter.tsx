"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Bell,
  ShoppingBag,
  Truck,
  Tag,
  Info,
  ExternalLink,
  X,
  CheckCheck,
  CreditCard,
  User,
} from "lucide-react";
import { useCustomerNotifications, CustomerNotification } from "@/lib/hooks/useCustomerNotifications";
import Link from "next/link";

interface CustomerNotificationCenterProps {
  userId?: string;
}

type DateFilterTab = "all" | "today" | "yesterday" | "earlier";
type TypeFilterTab = "all" | "orders" | "payments" | "delivery" | "account";

/**
 * Format notification timestamp using calendar-day comparison in local timezone
 */
export function formatNotificationTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  if (isNaN(date.getTime())) {
    return "Just now";
  }

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return `Today, ${timeStr}`;
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const startOfSevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime();
  if (date.getTime() >= startOfSevenDaysAgo) {
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
    return `${dayName}, ${timeStr}`;
  }

  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

export function CustomerNotificationCenter({ userId }: CustomerNotificationCenterProps) {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useCustomerNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterTab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilterTab>("all");
  const [selectedNotification, setSelectedNotification] = useState<CustomerNotification | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedNotification) {
          setSelectedNotification(null);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };
    if (isOpen || selectedNotification) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedNotification]);

  // Calendar-day filtering in user's local timezone
  const filteredNotifications = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

    return notifications.filter((item) => {
      const itemDate = new Date(item.created_at);
      const itemTime = itemDate.getTime();

      // 1. Date Filter
      if (dateFilter === "today") {
        if (itemTime < startOfToday) return false;
      } else if (dateFilter === "yesterday") {
        if (itemTime < startOfYesterday || itemTime >= startOfToday) return false;
      } else if (dateFilter === "earlier") {
        if (itemTime >= startOfYesterday) return false;
      }

      // 2. Type Filter
      if (typeFilter !== "all") {
        const typeStr = (item.type || "").toLowerCase();
        if (typeFilter === "orders" && !typeStr.includes("order")) return false;
        if (typeFilter === "payments" && !typeStr.includes("payment") && !typeStr.includes("refund")) return false;
        if (typeFilter === "delivery" && !typeStr.includes("deliver") && !typeStr.includes("ship") && !typeStr.includes("track")) return false;
        if (typeFilter === "account" && !typeStr.includes("account") && !typeStr.includes("offer") && !typeStr.includes("coupon") && !typeStr.includes("user")) return false;
      }

      return true;
    });
  }, [notifications, dateFilter, typeFilter]);

  if (!userId) return null;

  const handleNotificationClick = (item: CustomerNotification) => {
    if (!item.is_read) {
      markAsRead(item.id);
    }
    setSelectedNotification(item);
  };

  const getTypeIcon = (type?: string) => {
    const t = (type || "").toLowerCase();
    if (t.includes("order")) {
      return <ShoppingBag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
    }
    if (t.includes("payment") || t.includes("refund")) {
      return <CreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    }
    if (t.includes("ship") || t.includes("deliver") || t.includes("track")) {
      return <Truck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
    }
    if (t.includes("offer") || t.includes("coupon")) {
      return <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
    }
    if (t.includes("account") || t.includes("user")) {
      return <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
    }
    return <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />;
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case "high":
        return (
          <span className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-red-200 dark:border-red-900/60">
            High
          </span>
        );
      case "low":
        return (
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-medium px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
            Low
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Customer notifications"
        aria-expanded={isOpen}
        id="header-notification-bell"
        className="relative p-2 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown (Compact, Fixed Max Height 430-460px) */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            role="dialog"
            aria-label="Customer notifications list"
            className="fixed inset-x-3 top-[65px] max-w-sm mx-auto sm:absolute sm:right-0 sm:top-full sm:inset-x-auto mt-2 w-[calc(100vw-24px)] sm:w-[410px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[450px] animate-in fade-in slide-in-from-top-2 duration-150"
          >
            {/* 1. FIXED HEADER */}
            <div className="p-3.5 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/95 dark:bg-slate-800/80 backdrop-blur-xs shrink-0">
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-accent/10 text-accent text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 focus:outline-none"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            {/* 2. FIXED FILTER TABS */}
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 shrink-0 space-y-1.5">
              {/* Primary Date Filters: All | Today | Yesterday | Earlier */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl text-xs font-medium">
                {(["all", "today", "yesterday", "earlier"] as const).map((tab) => {
                  const label =
                    tab === "all"
                      ? "All"
                      : tab === "today"
                      ? "Today"
                      : tab === "yesterday"
                      ? "Yesterday"
                      : "Earlier";
                  const isActive = dateFilter === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setDateFilter(tab)}
                      className={`flex-1 py-1 rounded-lg text-center transition-all capitalize text-[11px] font-semibold ${
                        isActive
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Optional Secondary Type Filters: All Types | Orders | Payments | Delivery | Account */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 text-[10px]">
                {(["all", "orders", "payments", "delivery", "account"] as const).map((tTab) => {
                  const label =
                    tTab === "all"
                      ? "All Types"
                      : tTab === "orders"
                      ? "Orders"
                      : tTab === "payments"
                      ? "Payments"
                      : tTab === "delivery"
                      ? "Delivery"
                      : "Account";
                  const isActive = typeFilter === tTab;
                  return (
                    <button
                      key={tTab}
                      onClick={() => setTypeFilter(tTab)}
                      className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors border font-medium ${
                        isActive
                          ? "bg-accent/10 border-accent/40 text-accent font-bold"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. SCROLLABLE COMPACT LIST BODY */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 p-1.5">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Loading notifications...
                </div>
              ) : filteredNotifications.length === 0 ? (
                /* Premium Empty State */
                <div className="py-12 px-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
                    <Bell className="w-5 h-5 text-accent" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    No notifications here
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    You’re all caught up.
                  </p>
                </div>
              ) : (
                filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 group relative ${
                      item.is_read
                        ? "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        : "bg-accent/5 dark:bg-accent/10 hover:bg-accent/10 dark:hover:bg-accent/15"
                    }`}
                  >
                    {!item.is_read && (
                      <span className="absolute left-1 top-3.5 w-1.5 h-1.5 rounded-full bg-accent" />
                    )}

                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      {getTypeIcon(item.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={`text-xs truncate ${
                            item.is_read
                              ? "font-semibold text-slate-700 dark:text-slate-300"
                              : "font-bold text-slate-900 dark:text-slate-100"
                          }`}
                        >
                          {item.title}
                        </h4>
                        {getPriorityBadge(item.priority)}
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between mt-1 pt-0.5">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          {formatNotificationTimestamp(item.created_at)}
                        </span>
                        {item.link_url && (
                          <span className="text-[10px] font-semibold text-accent flex items-center gap-0.5 group-hover:underline">
                            Details <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 4. FIXED FOOTER */}
            <div className="p-2.5 px-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50 flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {filteredNotifications.length}{" "}
                {filteredNotifications.length === 1 ? "notification" : "notifications"}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="font-semibold text-accent hover:underline text-xs"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedNotification(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Notification details"
          >
            <button
              onClick={() => setSelectedNotification(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-accent/10 text-accent">
                {getTypeIcon(selectedNotification.type)}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 font-semibold">
                    {selectedNotification.type || "System"}
                  </span>
                  {getPriorityBadge(selectedNotification.priority)}
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedNotification.title}
                </h3>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
              {selectedNotification.message}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                {formatNotificationTimestamp(selectedNotification.created_at)}
              </span>

              {selectedNotification.link_url && (
                <Link
                  href={selectedNotification.link_url}
                  onClick={() => setSelectedNotification(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent/90 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs"
                >
                  View details <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
