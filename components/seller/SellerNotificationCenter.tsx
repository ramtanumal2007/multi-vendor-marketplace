"use client";

import React, { useState, useEffect } from "react";
import { Bell, Check, Info, ShieldCheck, Package } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface SellerNotificationCenterProps {
  sellerId: string;
}

export function SellerNotificationCenter({ sellerId }: SellerNotificationCenterProps) {
  const [notifications, setNotifications] = useState<Array<Record<string, unknown>>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchNotifications() {
      if (!sellerId) return;
      const { data, error } = await supabase
        .from("seller_notifications")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!error && data) {
        setNotifications(data);
      }
      setIsLoading(false);
    }
    fetchNotifications();
  }, [sellerId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("seller_notifications").update({ is_read: true }).eq("id", id);
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("seller_notifications").update({ is_read: true }).eq("seller_id", sellerId);
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded">High</span>;
      case "low":
        return <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5 rounded">Low</span>;
      default:
        return <span className="bg-blue-100 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 rounded">Medium</span>;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none"
        title="Seller Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
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
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {isLoading ? (
                <div className="p-6 text-center text-xs text-slate-400">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No notifications yet.</div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleMarkAsRead(item.id)}
                    className={`p-4 transition-colors cursor-pointer flex items-start space-x-3 ${
                      item.is_read ? "bg-white hover:bg-slate-50/60" : "bg-blue-50/30 hover:bg-blue-50/60"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-blue-100/80 text-blue-600 flex-shrink-0 mt-0.5">
                      {item.type === "approval" ? (
                        <ShieldCheck className="w-4 h-4 text-green-600" />
                      ) : item.type === "inventory" ? (
                        <Package className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Info className="w-4 h-4 text-blue-600" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                        {getPriorityBadge(item.priority)}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.message}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
