"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

export interface CustomerNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  priority?: string;
  is_read?: boolean;
  link_url?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export function useCustomerNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchCustomerNotifications() {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/customer/notifications");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        } else {
          // Direct Supabase query fallback
          const { data: dbData } = await supabase
            .from("customer_notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (dbData) {
            setNotifications(dbData);
            setUnreadCount(dbData.filter((n) => !n.is_read).length);
          }
        }
      } catch (err) {
        console.error("Failed to load customer notifications:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCustomerNotifications();

    if (!userId) return;

    // Realtime channel subscription for customer notifications
    const channel = supabase
      .channel(`customer-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as CustomerNotification;
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
          if (!newNotif.is_read) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "customer_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedNotif = payload.new as CustomerNotification;
          setNotifications((prev) => {
            const next = prev.map((n) => (n.id === updatedNotif.id ? { ...n, ...updatedNotif } : n));
            setUnreadCount(next.filter((item) => !item.is_read).length);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/customer/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      await supabase.from("customer_notifications").update({ is_read: true }).eq("id", id);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/customer/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      if (userId) {
        await supabase.from("customer_notifications").update({ is_read: true }).eq("user_id", userId);
      }
    }
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  };
}
