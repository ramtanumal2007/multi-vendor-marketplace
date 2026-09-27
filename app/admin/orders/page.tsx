"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import {
  Search,
  Eye,
  Filter,
  RefreshCw,
  ShoppingCart,
  User,
  Store,
  Download,
  Calendar,
  CreditCard,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  normalizeInternalStatus,
} from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { downloadCsv } from "@/lib/exportCsv";

interface EnrichedOrder {
  id: string;
  order_number: string;
  invoice_number?: string;
  customer_id_code?: string;
  total: number;
  payment_method?: string;
  payment_status: string;
  fulfillment_status: string;
  internal_status: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  store_names: string;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchOrders = React.useCallback(async () => {
    setIsLoading(true);

    try {
      // 1. Fetch Orders
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("id, order_number, invoice_number, user_id, email, shipping_address, total, payment_method, payment_status, fulfillment_status, internal_status, created_at")
        .order("created_at", { ascending: false });

      if (orderErr) throw orderErr;

      if (orderData && orderData.length > 0) {
        const orderIds = orderData.map((o: { id: string }) => o.id);
        const userIds = orderData.map((o: { user_id?: string | null }) => o.user_id).filter(Boolean) as string[];

        // 2. Fetch Customer Names & Customer Code
        const profilesMap = new Map<string, { name: string; code: string }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, customer_id_code")
            .in("id", userIds);

          (profiles || []).forEach((p: { id: string; full_name?: string | null; customer_id_code?: string | null }) => {
            profilesMap.set(p.id, {
              name: p.full_name || "",
              code: p.customer_id_code || "",
            });
          });
        }

        // 3. Fetch Store Names per Order & Order Timelines
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, stores(name)")
          .in("order_id", orderIds);

        const storeNameMap = new Map<string, Set<string>>();
        (itemsData || []).forEach((item: { order_id: string; stores?: { name?: string } | { name?: string }[] | null }) => {
          const store = Array.isArray(item.stores) ? item.stores[0] : item.stores;
          if (store?.name) {
            const set = storeNameMap.get(item.order_id) || new Set<string>();
            set.add(store.name);
            storeNameMap.set(item.order_id, set);
          }
        });

        const { data: timelineData } = await supabase
          .from("order_timeline")
          .select("order_id, status, created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });

        const timelineMap = new Map<string, string>();
        (timelineData || []).forEach((t: { order_id: string; status: string; created_at: string }) => {
          if (!timelineMap.has(t.order_id)) {
            timelineMap.set(t.order_id, t.status);
          }
        });

        const enriched: EnrichedOrder[] = orderData.map((ord: { id: string; order_number: string; invoice_number?: string | null; user_id?: string | null; email: string; shipping_address?: { first_name?: string; last_name?: string } | null; total: number | string | null; payment_method?: string | null; payment_status: string; fulfillment_status: string; internal_status?: string | null; created_at: string }) => {
          const ship = ord.shipping_address || {};
          const profileObj = ord.user_id ? profilesMap.get(ord.user_id) : null;
          const customerName =
            profileObj?.name ||
            `${ship.first_name || ""} ${ship.last_name || ""}`.trim() ||
            "Guest Customer";

          const storesSet = storeNameMap.get(ord.id);
          const storeNames = storesSet ? Array.from(storesSet).join(", ") : "N/A";

          const internalStatus = normalizeInternalStatus(ord.internal_status || ord.fulfillment_status);

          return {
            id: ord.id,
            order_number: ord.order_number,
            invoice_number: ord.invoice_number || `INV-${ord.order_number.replace("ORD-", "")}`,
            customer_id_code: profileObj?.code || "CUS-001",
            total: Number(ord.total || 0),
            payment_method: ord.payment_method || "COD",
            payment_status: ord.payment_status,
            fulfillment_status: ord.fulfillment_status,
            internal_status: internalStatus,
            created_at: ord.created_at,
            customer_name: customerName,
            customer_email: ord.email,
            store_names: storeNames,
          };
        });

        setOrders(enriched);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const allStores = React.useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => {
      if (o.store_names && o.store_names !== "N/A") {
        o.store_names.split(", ").forEach((name) => s.add(name));
      }
    });
    return Array.from(s).sort();
  }, [orders]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">DELIVERED</span>;
      case "CANCELLED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">CANCELLED</span>;
      case "READY TO DISPATCH":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">READY TO DISPATCH</span>;
      case "CONFIRMED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">CONFIRMED</span>;
      case "SHIPPED":
      case "IN TRANSIT":
      case "OUT FOR DELIVERY":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">{status}</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">ORDERED</span>;
    }
  };

  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      addToast({
        title: "No Data to Export",
        description: "No orders match the current filter selection.",
        type: "info",
      });
      return;
    }

    const headers = [
      "Order Number",
      "Invoice Number",
      "Date & Time",
      "Customer Code",
      "Customer Name",
      "Customer Email",
      "Merchant Stores",
      "Total (INR)",
      "Payment Method",
      "Payment Status",
      "Internal Status",
    ];

    const rows = filteredOrders.map((o) => [
      o.order_number,
      o.invoice_number || "",
      formatExactDateTime(o.created_at),
      o.customer_id_code || "",
      o.customer_name,
      o.customer_email,
      o.store_names,
      o.total,
      o.payment_method || "COD",
      o.payment_status,
      o.internal_status,
    ]);

    downloadCsv(`orders_${dateFilter}`, headers, rows);
    addToast({
      title: "Orders Exported",
      description: `Exported ${filteredOrders.length} order(s) successfully.`,
      type: "success",
    });
  };

  const filteredOrders = orders.filter((ord) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      ord.order_number.toLowerCase().includes(term) ||
      (ord.invoice_number && ord.invoice_number.toLowerCase().includes(term)) ||
      (ord.customer_id_code && ord.customer_id_code.toLowerCase().includes(term)) ||
      ord.customer_name.toLowerCase().includes(term) ||
      ord.customer_email.toLowerCase().includes(term) ||
      ord.store_names.toLowerCase().includes(term);

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = ord.internal_status === statusFilter;
    }

    let matchesPaymentStatus = true;
    if (paymentStatusFilter !== "all") {
      matchesPaymentStatus = ord.payment_status.toLowerCase() === paymentStatusFilter.toLowerCase();
    }

    let matchesPaymentMethod = true;
    if (paymentMethodFilter !== "all") {
      matchesPaymentMethod = (ord.payment_method || "").toLowerCase() === paymentMethodFilter.toLowerCase();
    }

    let matchesStore = true;
    if (storeFilter !== "all") {
      matchesStore = ord.store_names.includes(storeFilter);
    }

    let matchesDate = true;
    const ordDate = new Date(ord.created_at).getTime();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;

    if (dateFilter === "today") {
      matchesDate = ordDate >= startOfToday;
    } else if (dateFilter === "yesterday") {
      matchesDate = ordDate >= startOfYesterday && ordDate < startOfToday;
    } else if (dateFilter === "7d") {
      matchesDate = ordDate >= now.getTime() - 7 * 86400000;
    } else if (dateFilter === "30d") {
      matchesDate = ordDate >= now.getTime() - 30 * 86400000;
    } else if (dateFilter === "custom") {
      if (customStartDate) {
        const start = new Date(customStartDate).getTime();
        if (ordDate < start) matchesDate = false;
      }
      if (customEndDate) {
        const end = new Date(customEndDate).getTime() + 86400000;
        if (ordDate >= end) matchesDate = false;
      }
    }

    return matchesSearch && matchesStatus && matchesPaymentStatus && matchesPaymentMethod && matchesStore && matchesDate;
  });

  const hasActiveFilters =
    statusFilter !== "all" ||
    paymentStatusFilter !== "all" ||
    paymentMethodFilter !== "all" ||
    storeFilter !== "all" ||
    dateFilter !== "all" ||
    searchTerm.trim() !== "";

  const handleClearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setPaymentStatusFilter("all");
    setPaymentMethodFilter("all");
    setStoreFilter("all");
    setDateFilter("all");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  return (
    <div className="flex flex-col h-full max-h-full space-y-6 max-w-7xl mx-auto w-full pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketplace Orders</h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor and audit all customer orders, payments, logistics, and store fulfillments.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="flex items-center gap-2 text-slate-700 bg-white hover:bg-slate-50 border-slate-300 rounded-xl text-xs font-bold h-9"
          >
            <Download className="w-4 h-4 text-slate-500" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrders} isLoading={isLoading} className="h-9 rounded-xl text-xs font-semibold">
            <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden shadow-sm">
        {/* Toolbar with Full Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col gap-3 bg-slate-50/50">
          <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search order #, invoice, customer, or store..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as "all" | "today" | "yesterday" | "7d" | "30d" | "custom")}
                  className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Order Status */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="ORDERED">ORDERED</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="READY TO DISPATCH">READY TO DISPATCH</option>
                  <option value="SHIPPED">SHIPPED</option>
                  <option value="IN TRANSIT">IN TRANSIT</option>
                  <option value="OUT FOR DELIVERY">OUT FOR DELIVERY</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              {/* Payment Method */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="all">All Payment Modes</option>
                  <option value="cod">Cash on Delivery (COD)</option>
                  <option value="cashfree">Online (Cashfree)</option>
                </select>
              </div>

              {/* Merchant Store Filter */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
                <Store className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  <option value="all">All Stores</option>
                  {allStores.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={handleClearAllFilters}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Custom Date Inputs if Custom Range selected */}
          {dateFilter === "custom" && (
            <div className="flex items-center gap-3 pt-1 border-t border-slate-200/60 text-xs">
              <span className="text-slate-500 font-medium">Custom Range:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[11px]">From</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[11px]">To</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-500 flex justify-between items-center pt-1 border-t border-slate-100">
            <span>
              Showing <strong>{filteredOrders.length}</strong> of {orders.length} orders
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full p-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 p-12">
              <ShoppingCart className="w-12 h-12 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No orders found.</p>
              <p className="text-xs text-slate-400">Try adjusting your search or status filter.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse min-w-[900px]">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="px-6 py-3.5">Order Number</th>
                  <th className="px-6 py-3.5">Date & Exact Time</th>
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Seller / Store</th>
                  <th className="px-6 py-3.5">Total Amount</th>
                  <th className="px-6 py-3.5">Payment</th>
                  <th className="px-6 py-3.5">Internal Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">#{order.order_number}</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5 font-bold">
                        {order.invoice_number}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-semibold text-slate-800">{formatExactDateTime(order.created_at)}</div>
                      <div className="text-[10px] text-slate-400">{formatRelativeTime(order.created_at)}</div>
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                          {order.customer_name}
                        </span>
                        <span className="text-[11px] font-mono text-blue-700 font-bold">
                          {order.customer_id_code}
                        </span>
                        <span className="text-[11px] text-slate-400">{order.customer_email}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-700">
                      <div className="font-medium flex items-center gap-1">
                        <Store className="w-3.5 h-3.5 text-slate-400" />
                        {order.store_names}
                      </div>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">
                      {formatCurrency(order.total)}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          order.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {order.payment_status}
                      </span>
                    </td>

                    <td className="px-6 py-4">{getStatusBadge(order.internal_status)}</td>

                    <td className="px-6 py-4 text-right">
                      <Link href={`/admin/orders/${order.id}`}>
                        <button className="px-3 py-1.5 text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold">
                          <Eye className="w-3.5 h-3.5" /> View Order
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
