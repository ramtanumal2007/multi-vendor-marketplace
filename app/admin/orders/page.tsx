"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { Search, Eye, Filter, RefreshCw, ShoppingCart, User, Store } from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  normalizeInternalStatus,
} from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface EnrichedOrder {
  id: string;
  order_number: string;
  total: number;
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

  const supabase = createClient();

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    setIsLoading(true);

    try {
      // 1. Fetch Orders
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("id, order_number, user_id, email, shipping_address, total, payment_status, fulfillment_status, created_at")
        .order("created_at", { ascending: false });

      if (orderErr) throw orderErr;

      if (orderData && orderData.length > 0) {
        const orderIds = orderData.map((o: any) => o.id);
        const userIds = orderData.map((o: any) => o.user_id).filter(Boolean);

        // 2. Fetch Customer Names
        let profilesMap = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds);

          (profiles || []).forEach((p: any) => {
            profilesMap.set(p.id, p.full_name || "");
          });
        }

        // 3. Fetch Store Names per Order & Order Timelines
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, stores(name)")
          .in("order_id", orderIds);

        const storeNameMap = new Map<string, Set<string>>();
        (itemsData || []).forEach((item: any) => {
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
        (timelineData || []).forEach((t: any) => {
          if (!timelineMap.has(t.order_id)) {
            timelineMap.set(t.order_id, t.status);
          }
        });

        const enriched: EnrichedOrder[] = orderData.map((ord: any) => {
          const ship = ord.shipping_address || {};
          const profileName = ord.user_id ? profilesMap.get(ord.user_id) : "";
          const customerName =
            profileName ||
            `${ship.first_name || ""} ${ship.last_name || ""}`.trim() ||
            "Guest Customer";

          const storesSet = storeNameMap.get(ord.id);
          const storeNames = storesSet ? Array.from(storesSet).join(", ") : "N/A";

          const internalStatus = normalizeInternalStatus(ord.internal_status || ord.fulfillment_status);

          return {
            id: ord.id,
            order_number: ord.order_number,
            total: Number(ord.total || 0),
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
  }

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

  const filteredOrders = orders.filter((ord) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      ord.order_number.toLowerCase().includes(term) ||
      ord.customer_name.toLowerCase().includes(term) ||
      ord.customer_email.toLowerCase().includes(term) ||
      ord.store_names.toLowerCase().includes(term);

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = ord.internal_status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full max-h-full space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketplace Orders</h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor all customer orders, store fulfillments, and delivery stages.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search order #, customer or store..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">All Internal Statuses</option>
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

            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              {filteredOrders.length} Orders
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
                    <td className="px-6 py-4 font-bold text-slate-900">#{order.order_number}</td>

                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-semibold text-slate-800">{formatExactDateTime(order.created_at)}</div>
                      <div className="text-[10px] text-slate-400">{formatRelativeTime(order.created_at)}</div>
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {order.customer_name}
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
