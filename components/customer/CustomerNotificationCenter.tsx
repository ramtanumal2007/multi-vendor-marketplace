"use client";

import React, { useState } from "react";
import { Bell, Check, ShoppingBag, Truck, CheckCircle2, Tag, Info, ExternalLink, X, CheckCheck, Sparkles } from "lucide-react";
import { useCustomerNotifications, CustomerNotification } from "@/lib/hooks/useCustomerNotifications";
import Link from "next/link";

interface CustomerNotificationCenterProps {
  userId?: string;
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

export function CustomerNotificationCenter({ userId }: CustomerNotificationCenterProps) {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useCustomerNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<CustomerNotification | null>(null);

  if (!userId) return null;

  const handleNotificationClick = (item: CustomerNotification) => {
    if (!item.is_read) {
      markAsRead(item.id);
    }
    setSelectedNotification(item);
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "order_confirmation":
        return <ShoppingBag className="w-4 h-4 text-blue-600" />;
      case "order_shipped":
        return <Truck className="w-4 h-4 text-purple-600" />;
      case "order_delivered":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "offer":
      case "coupon":
        return <Tag className="w-4 h-4 text-amber-600" />;
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
        aria-label="Customer notifications"
        aria-expanded={isOpen}
        className="relative p-2 rounded-full text-foreground-secondary hover:bg-background-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span 
            aria-label={`${unreadCount} unread notifications`}
            className="absolute top-0 right-0 min-w-4 h-4 px-1 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs"
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
            aria-label="Customer notifications list"
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-background border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-background-secondary/40 backdrop-blur-xs">
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-foreground text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-accent/10 text-accent text-xs font-semibold px-2 py-0.5 rounded-full">
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

            {/* List Body */}
            <div className="max-h-88 overflow-y-auto divide-y divide-border">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-foreground-secondary font-medium">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-background-secondary text-foreground-secondary flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5 text-accent" />
                  </div>
                  <h4 className="text-xs font-bold text-foreground">You&apos;re all caught up</h4>
                  <p className="text-[11px] text-foreground-secondary">No new notifications right now.</p>
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-4 transition-all cursor-pointer flex items-start space-x-3 group relative ${
                      item.is_read ? "bg-background hover:bg-background-secondary/50" : "bg-accent/5 hover:bg-accent/10"
                    }`}
                  >
                    {!item.is_read && (
                      <span className="absolute left-1.5 top-5 w-2 h-2 rounded-full bg-accent" />
                    )}

                    <div className="p-2 rounded-xl bg-background-secondary text-foreground flex-shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      {getTypeIcon(item.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`text-xs truncate ${item.is_read ? "font-semibold text-foreground-secondary" : "font-bold text-foreground"}`}>
                          {item.title}
                        </h4>
                        {getPriorityBadge(item.priority)}
                      </div>

                      <p className="text-xs text-foreground-secondary mt-1 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between mt-2 pt-1">
                        <span className="text-[10px] text-foreground-secondary font-medium">
                          {formatRelativeTime(item.created_at)}
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

            {/* Footer */}
            <div className="p-3 border-t border-border bg-background-secondary/40 flex items-center justify-between text-xs">
              <span className="text-[11px] text-foreground-secondary font-medium">
                Recent notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="font-semibold text-accent hover:underline"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedNotification(null)}
        >
          <div 
            className="bg-background border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Notification details"
          >
            <button
              onClick={() => setSelectedNotification(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-foreground-secondary hover:text-foreground hover:bg-background-secondary transition-colors"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                {getTypeIcon(selectedNotification.type)}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono uppercase text-foreground-secondary font-semibold">
                    {selectedNotification.type || "System"}
                  </span>
                  {getPriorityBadge(selectedNotification.priority)}
                </div>
                <h3 className="text-sm font-bold text-foreground mt-0.5">
                  {selectedNotification.title}
                </h3>
              </div>
            </div>

            <div className="bg-background-secondary border border-border rounded-xl p-4 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {selectedNotification.message}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-foreground-secondary font-medium text-[11px]">
                {new Date(selectedNotification.created_at).toLocaleString()}
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
