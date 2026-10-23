"use client";

import React, { useState, useEffect } from "react";
import { Bell, Send, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface NotificationLog {
  id: string;
  sender_id: string | null;
  target_audience: "all_sellers" | "seller" | "all_customers" | "customer";
  target_id: string | null;
  title: string;
  message: string;
  type: string;
  priority: string;
  link_url: string | null;
  recipient_count: number;
  recipient_name?: string;
  recipient_email?: string;
  created_at: string;
}

interface SellerOption {
  id: string;
  business_name: string;
  business_email: string;
  verification_status?: string;
}

interface CustomerOption {
  id: string;
  full_name: string;
  email: string;
}

export default function AdminNotificationsPage() {
  const [history, setHistory] = useState<NotificationLog[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Form fields
  const [targetAudience, setTargetAudience] = useState<"all_sellers" | "seller" | "all_customers" | "customer">("all_sellers");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("system");
  const [priority, setPriority] = useState("medium");
  const [linkUrl, setLinkUrl] = useState("");

  const { addToast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/notifications");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setSellers(data.sellers || []);
        setCustomers(data.customers || []);
      } else {
        const errorData = await res.json().catch(() => ({}));
        addToast({ title: "Failed to load notifications data", description: errorData.error || "Server error", type: "error" });
      }
    } catch {
      addToast({ title: "Error", description: "Failed to connect to notifications service", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      addToast({ title: "Validation Error", description: "Title and message are required", type: "error" });
      return;
    }

    if ((targetAudience === "seller" || targetAudience === "customer") && !targetId) {
      addToast({ title: "Validation Error", description: "Please select a target recipient", type: "error" });
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAudience,
          targetId: targetId || undefined,
          title,
          message,
          type,
          priority,
          linkUrl: linkUrl || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        addToast({ 
          title: "Notification Sent 🎉", 
          description: data.count ? `Successfully sent to ${data.count} recipients.` : "Notification sent successfully.", 
          type: "success" 
        });
        // Reset form
        setTitle("");
        setMessage("");
        setLinkUrl("");
        setTargetId("");
        fetchData();
      } else {
        addToast({ title: "Failed to send notification", description: data.error || "Unknown error", type: "error" });
      }
    } catch {
      addToast({ title: "Error", description: "Failed to transmit notification payload", type: "error" });
    } finally {
      setIsSending(false);
    }
  };

  const getTargetBadge = (log: NotificationLog) => {
    switch (log.target_audience) {
      case "all_sellers":
        return <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-purple-200">All Verified Sellers</span>;
      case "seller":
        return (
          <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-indigo-200">
            Specific Seller — {log.recipient_name || "Seller"} {log.recipient_email ? `(${log.recipient_email})` : ""}
          </span>
        );
      case "all_customers":
        return <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">All Customers</span>;
      case "customer":
        return (
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
            Specific Customer — {log.recipient_name || "Customer"} {log.recipient_email ? `(${log.recipient_email})` : ""}
          </span>
        );
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{log.target_audience}</span>;
    }
  };

  const getPriorityBadge = (priorityVal: string) => {
    switch (priorityVal) {
      case "high":
        return <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">HIGH</span>;
      case "low":
        return <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">LOW</span>;
      default:
        return <span className="bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 rounded">MEDIUM</span>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" /> Admin Notification System
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispatch announcements, push updates, or individual alerts to sellers and customers.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh Logs
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Send Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Send className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-900 text-base">Send New Notification</h2>
          </div>

          <form onSubmit={handleSendNotification} className="space-y-4">
            {/* Target Audience */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Audience</label>
              <select
                value={targetAudience}
                onChange={(e) => {
                  setTargetAudience(e.target.value as "all_sellers" | "seller" | "all_customers" | "customer");
                  setTargetId("");
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all_sellers">📢 All Verified Sellers (Broadcast)</option>
                <option value="seller">🏬 Selected Seller (Direct)</option>
                <option value="all_customers">👥 All Customers (Broadcast)</option>
                <option value="customer">👤 Selected Customer (Direct)</option>
              </select>
            </div>

            {/* Target Selector if Single Seller */}
            {targetAudience === "seller" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Seller</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose Seller --</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.business_name || s.business_email || s.id} ({s.verification_status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Target Selector if Single Customer */}
            {targetAudience === "customer" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.email || c.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notification Title</label>
              <input
                type="text"
                placeholder="e.g., Platform Maintenance Update"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Message Content</label>
              <textarea
                rows={3}
                placeholder="Write the detailed notification message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Type & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category / Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="system">System</option>
                  <option value="approval">Approval</option>
                  <option value="inventory">Inventory</option>
                  <option value="warning">Warning</option>
                  <option value="offer">Offer / Promotion</option>
                  <option value="coupon">Coupon</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Action Link URL */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Link URL (Optional)</label>
              <input
                type="text"
                placeholder="e.g., /seller/membership or /products"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={isSending}
              className="w-full mt-2"
            >
              <Send className="w-4 h-4 mr-2" /> Dispatch Notification
            </Button>
          </form>
        </div>

        {/* History Log */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">Notification History Log</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">{history.length} records</span>
          </div>

          <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading notification history...</div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No notification logs recorded yet.</div>
            ) : (
              history.map((log) => (
                <div key={log.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getTargetBadge(log)}
                      {getPriorityBadge(log.priority)}
                      <span className="text-[10px] font-mono text-slate-400 uppercase">{log.type}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{log.title}</h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{log.message}</p>
                  </div>

                  {log.link_url && (
                    <div className="text-[11px] text-blue-600 font-mono underline truncate">
                      Link: {log.link_url}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    <span>Recipients: <strong className="text-slate-700">{log.recipient_count}</strong></span>
                    <span>Log ID: {log.id.slice(0, 8)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
