"use client";

import React, { useState, useEffect } from "react";
import { Bell, Check, Info, ShieldCheck, Package, AlertTriangle, Tag, ExternalLink, X, CheckCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface SellerNotificationCenterProps {
  sellerId: string;
}

export interface SellerNotification {
  id: string;
  title: string;
  message: string;
  type?: string;
  priority?: string;
  is_read?: boolean;
  link_url?: string;
  created_at: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SellerNotificationCenter({ sellerId }: SellerNotificationCenterProps) {
  const [notifications, setNotifications] = useState<SellerNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<SellerNotification | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchNotifications() {
      if (!sellerId) return;
      try {
        const res = await fetch("/api/seller/notifications");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        } else {
          // Fallback to direct client query
          const { data: dbData } = await supabase
            .from("seller_notifications")
            .select("*")
            .eq("seller_id", sellerId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (dbData) setNotifications(dbData);
        }
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchNotifications();

    if (!sellerId) return;

    // Real-time listener for live seller notification bell updates
    const channel = supabase
      .channel(`seller-notifications-${sellerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "seller_notifications",
          filter: `seller_id=eq.${sellerId}`,
        },
        (payload) => {
          const newNotif = payload.new as SellerNotification;
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "seller_notifications",
          filter: `seller_id=eq.${sellerId}`,
        },
        (payload) => {
          const updatedNotif = payload.new as SellerNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updatedNotif.id ? { ...n, ...updatedNotif } : n))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, supabase]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await fetch("/api/seller/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      await supabase.from("seller_notifications").update({ is_read: true }).eq("id", id);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch("/api/seller/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      await supabase.from("seller_notifications").update({ is_read: true }).eq("seller_id", sellerId);
    }
  };

  const handleNotificationClick = (item: SellerNotification) => {
    if (!item.is_read) {
      handleMarkAsRead(item.id);
    }
    setSelectedNotification(item);
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "approval":
        return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
      case "inventory":
      case "order":
        return <Package className="w-4 h-4 text-blue-600" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      case "offer":
      case "coupon":
        return <Tag className="w-4 h-4 text-purple-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case "high":
        return <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-red-200">High</span>;
      case "low":
        return <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5 rounded-md border border-slate-200">Low</span>;
      default:
        return <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-blue-200">Medium</span>;
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Seller notifications"
        aria-expanded={isOpen}
        className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span 
            aria-label={`${unreadCount} unread notifications`}
            className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div 
            role="dialog"
            aria-label="Notifications list"
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-xs">
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 focus:outline-none"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            {/* List Body */}
            <div className="max-h-88 overflow-y-auto divide-y divide-slate-100">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">You&apos;re all caught up</h4>
                  <p className="text-[11px] text-slate-500">No new seller notifications right now.</p>
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-4 transition-all cursor-pointer flex items-start space-x-3 group relative ${
                      item.is_read ? "bg-white hover:bg-slate-50/80" : "bg-blue-50/40 hover:bg-blue-50/70"
                    }`}
                  >
                    {!item.is_read && (
                      <span className="absolute left-1.5 top-5 w-2 h-2 rounded-full bg-blue-600" />
                    )}

                    <div className="p-2 rounded-xl bg-slate-100/80 text-slate-700 flex-shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      {getTypeIcon(item.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`text-xs truncate ${item.is_read ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>
                          {item.title}
                        </h4>
                        {getPriorityBadge(item.priority)}
                      </div>

                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between mt-2 pt-1">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {formatRelativeTime(item.created_at)}
                        </span>
                        {item.link_url && (
                          <span className="text-[10px] font-semibold text-blue-600 flex items-center gap-0.5 group-hover:underline">
                            Details <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 font-medium">
                Showing recent updates
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="font-semibold text-blue-600 hover:text-blue-800 transition-colors"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedNotification(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Notification details"
          >
            <button
              onClick={() => setSelectedNotification(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                {getTypeIcon(selectedNotification.type)}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono uppercase text-slate-400 font-semibold">
                    {selectedNotification.type || "System"}
                  </span>
                  {getPriorityBadge(selectedNotification.priority)}
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                  {selectedNotification.title}
                </h3>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {selectedNotification.message}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-medium text-[11px]">
                {new Date(selectedNotification.created_at).toLocaleString()}
              </span>

              {selectedNotification.link_url && (
                <a
                  href={selectedNotification.link_url}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs"
                >
                  View details <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
