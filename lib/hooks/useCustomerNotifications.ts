"use client";

import { useState, useEffect, useRef } from "react";
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

type NotificationEventCallback = (
  notification: CustomerNotification,
  event: "INSERT" | "UPDATE"
) => void;

interface ChannelEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel: any;
  subscribers: Set<NotificationEventCallback>;
  teardownTimer?: NodeJS.Timeout;
}

// Module-level channel registry: guarantees exactly 1 RealtimeChannel per userId
// Prevents duplicate channel creation and the 'cannot add postgres_changes callbacks after subscribe()' error.
const customerChannelRegistry = new Map<string, ChannelEntry>();

export function useCustomerNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const supabase = createClient();

    // 1. Initial Data Fetch via REST API with direct DB query fallback
    async function fetchCustomerNotifications() {
      try {
        const res = await fetch("/api/customer/notifications");
        if (res.ok) {
          const data = await res.json();
          if (isMountedRef.current) {
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
          }
        } else {
          // Fallback direct Supabase query if REST API endpoint returns non-200
          const { data: dbData, error: dbErr } = await supabase
            .from("customer_notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);

          if (!dbErr && dbData && isMountedRef.current) {
            setNotifications(dbData);
            setUnreadCount(
              dbData.filter((n: CustomerNotification) => !n.is_read).length
            );
          }
        }
      } catch (err) {
        console.warn("Failed to load customer notifications:", err);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    fetchCustomerNotifications();

    // 2. Realtime Event Listener for this hook instance
    const handleRealtimeEvent: NotificationEventCallback = (
      item: CustomerNotification,
      event: "INSERT" | "UPDATE"
    ) => {
      if (!isMountedRef.current) return;

      if (event === "INSERT") {
        setNotifications((prev) => [
          item,
          ...prev.filter((n) => n.id !== item.id),
        ]);
        if (!item.is_read) {
          setUnreadCount((prev) => prev + 1);
        }
      } else if (event === "UPDATE") {
        setNotifications((prev) => {
          const next = prev.map((n) =>
            n.id === item.id ? { ...n, ...item } : n
          );
          setUnreadCount(next.filter((n) => !n.is_read).length);
          return next;
        });
      }
    };

    // 3. Register with Reference-Counted Channel Manager
    let entry = customerChannelRegistry.get(userId);

    if (entry) {
      // Cancel any pending teardown (e.g. from React Strict Mode or fast re-renders)
      if (entry.teardownTimer) {
        clearTimeout(entry.teardownTimer);
        entry.teardownTimer = undefined;
      }
      // Add this hook instance to existing channel's subscribers
      entry.subscribers.add(handleRealtimeEvent);
    } else {
      // Create new channel entry
      const subscribers = new Set<NotificationEventCallback>([handleRealtimeEvent]);

      try {
        const channelName = `customer-notifications-${userId}`;

        // Ensure any stale channel with this topic is cleaned up before registering new callbacks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = supabase.getChannels().find((ch: any) => ch.topic === `realtime:${channelName}` || ch.topic === channelName);
        if (existing) {
          supabase.removeChannel(existing);
        }

        const channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "customer_notifications",
              filter: `user_id=eq.${userId}`,
            },
            (payload: { new: CustomerNotification }) => {
              const currentEntry = customerChannelRegistry.get(userId);
              if (currentEntry) {
                const newNotif = payload.new as CustomerNotification;
                currentEntry.subscribers.forEach((cb) => cb(newNotif, "INSERT"));
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
            (payload: { new: CustomerNotification }) => {
              const currentEntry = customerChannelRegistry.get(userId);
              if (currentEntry) {
                const updatedNotif = payload.new as CustomerNotification;
                currentEntry.subscribers.forEach((cb) => cb(updatedNotif, "UPDATE"));
              }
            }
          );

        // All .on() listeners are registered BEFORE .subscribe() is called
        channel.subscribe((status: string, err?: Error) => {
          if (status === "CHANNEL_ERROR" || err) {
            console.warn(
              `Customer Realtime notification subscription notice (${status}):`,
              err?.message || "Channel unavailable. Polling fallback active."
            );
          }
        });

        entry = { channel, subscribers };
        customerChannelRegistry.set(userId, entry);
      } catch (subErr) {
        console.warn("Failed to initialize Realtime notification channel:", subErr);
      }
    }

    // 4. Safe Cleanup on Unmount
    return () => {
      const currentEntry = customerChannelRegistry.get(userId);
      if (!currentEntry) return;

      currentEntry.subscribers.delete(handleRealtimeEvent);

      // If no active consumers remain, schedule teardown
      if (currentEntry.subscribers.size === 0) {
        currentEntry.teardownTimer = setTimeout(() => {
          if (currentEntry.subscribers.size === 0) {
            try {
              supabase.removeChannel(currentEntry.channel);
            } catch (err) {
              console.warn("Error removing customer notification channel:", err);
            }
            customerChannelRegistry.delete(userId);
          }
        }, 1000); // 1-second debounce prevents thrashing in React Strict Mode or drawer transitions
      }
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
      try {
        const supabase = createClient();
        await supabase
          .from("customer_notifications")
          .update({ is_read: true })
          .eq("id", id);
      } catch {
        // Safe ignore
      }
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
        try {
          const supabase = createClient();
          await supabase
            .from("customer_notifications")
            .update({ is_read: true })
            .eq("user_id", userId);
        } catch {
          // Safe ignore
        }
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
