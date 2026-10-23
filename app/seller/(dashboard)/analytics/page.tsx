"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Package,
  RefreshCw,
  Loader2,
  Award,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";

interface AnalyticsOrderItem {
  id: string;
  title: string;
  product_id?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  order_id: string;
  created_at: string;
  payment_status: string;
  fulfillment_status: string;
}

interface DailyTrendItem {
  date: string;
  dayLabel: string;
  revenue: number;
  orders: number;
}

interface TopProductItem {
  id: string;
  title: string;
  sku?: string;
  unitsSold: number;
  revenue: number;
  orderCount: number;
}

export default function SellerAnalyticsPage() {
  const [timeframeDays, setTimeframeDays] = useState<7 | 30 | 90>(30);
  const [items, setItems] = useState<AnalyticsOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchAnalyticsData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("seller_id", user.id)
        .maybeSingle();

      if (!store?.id) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      // Calculate cutoff date based on timeframe
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

      // Fetch seller order items with parent orders
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id,
          title,
          product_id,
          sku,
          quantity,
          unit_price,
          line_total,
          order_id,
          orders (
            id,
            created_at,
            payment_status,
            fulfillment_status
          )
        `)
        .eq("store_id", store.id);

      if (error) throw error;

      interface RawItemWithOrder {
        id: string;
        title: string;
        product_id?: string;
        sku?: string;
        quantity: number;
        unit_price: number;
        line_total: number;
        order_id: string;
        orders?: {
          id: string;
          created_at: string;
          payment_status: string;
          fulfillment_status: string;
        } | {
          id: string;
          created_at: string;
          payment_status: string;
          fulfillment_status: string;
        }[] | null;
      }

      const parsed: AnalyticsOrderItem[] = ((data || []) as RawItemWithOrder[])
        .map((row) => {
          const ord = Array.isArray(row.orders) ? row.orders[0] : row.orders;
          if (!ord) return null;

          return {
            id: row.id,
            title: row.title,
            product_id: row.product_id,
            sku: row.sku || "N/A",
            quantity: Number(row.quantity || 1),
            unit_price: Number(row.unit_price || 0),
            line_total: Number(row.line_total || 0),
            order_id: ord.id,
            created_at: ord.created_at,
            payment_status: ord.payment_status,
            fulfillment_status: ord.fulfillment_status,
          };
        })
        .filter(Boolean) as AnalyticsOrderItem[];

      // Filter by timeframe
      const filtered = parsed.filter(
        (i) => new Date(i.created_at).getTime() >= cutoffDate.getTime()
      );

      setItems(filtered);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load seller analytics.";
      addToast({ title: "Analytics Error", description: msg, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, timeframeDays, addToast]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Real Metric Calculations
  const metrics = useMemo(() => {
    const totalRevenue = items.reduce((sum, i) => sum + i.line_total, 0);
    const uniqueOrders = new Set(items.map((i) => i.order_id));
    const totalOrders = uniqueOrders.size;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

    return {
      totalRevenue,
      totalOrders,
      aov,
      totalUnits,
    };
  }, [items]);

  // Daily Trend aggregation for Recharts
  const dailyTrends = useMemo(() => {
    const map = new Map<string, { revenue: number; orderIds: Set<string> }>();

    // Pre-populate all days in timeframe for smooth charts
    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      map.set(key, { revenue: 0, orderIds: new Set<string>() });
    }

    items.forEach((item) => {
      const key = item.created_at.split("T")[0];
      const entry = map.get(key) || { revenue: 0, orderIds: new Set<string>() };
      entry.revenue += item.line_total;
      entry.orderIds.add(item.order_id);
      map.set(key, entry);
    });

    const result: DailyTrendItem[] = [];
    map.forEach((val, dateStr) => {
      const dateObj = new Date(dateStr);
      const dayLabel = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      result.push({
        date: dateStr,
        dayLabel,
        revenue: Math.round(val.revenue),
        orders: val.orderIds.size,
      });
    });

    return result;
  }, [items, timeframeDays]);

  // Top Products breakdown
  const topProducts = useMemo(() => {
    const prodMap = new Map<string, TopProductItem>();

    items.forEach((item) => {
      const key = item.product_id || item.title;
      const existing = prodMap.get(key) || {
        id: key,
        title: item.title,
        sku: item.sku,
        unitsSold: 0,
        revenue: 0,
        orderCount: 0,
      };

      existing.unitsSold += item.quantity;
      existing.revenue += item.line_total;
      existing.orderCount += 1;
      prodMap.set(key, existing);
    });

    return Array.from(prodMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [items]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Seller Performance &amp; Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time verified revenue, order volumes, and top-performing merchandise.
          </p>
        </div>

        {/* Timeframe Presets */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setTimeframeDays(7)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                timeframeDays === 7
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeframeDays(30)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                timeframeDays === 30
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeframeDays(90)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                timeframeDays === 90
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              90 Days
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalyticsData}
            disabled={isLoading}
            className="h-9 text-xs px-2.5"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Revenue */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Gross Store Sales
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {formatCurrency(metrics.totalRevenue)}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Verified orders in the last {timeframeDays} days
            </p>
          </div>
        </div>

        {/* Total Orders */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Orders
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">{metrics.totalOrders}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Unique customer checkouts
            </p>
          </div>
        </div>

        {/* Average Order Value */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Avg. Order Value (AOV)
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {formatCurrency(metrics.aov)}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Average spend per order
            </p>
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Units Dispatched
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">{metrics.totalUnits}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Individual items shipped
            </p>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      {isLoading ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Computing analytics metrics...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Over Time Chart */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Daily Sales Trend</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gross sales trajectory over the last {timeframeDays} days
                </p>
              </div>
              <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                ₹{metrics.totalRevenue.toLocaleString()}
              </span>
            </div>

            <div className="h-64 sm:h-72 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyTrends}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [formatCurrency(Number(val) || 0), "Sales"]}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Orders Over Time Chart */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Daily Order Volume</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Number of verified orders placed per day
                </p>
              </div>
              <span className="text-xs font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                {metrics.totalOrders} Orders
              </span>
            </div>

            <div className="h-64 sm:h-72 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyTrends}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [Number(val) || 0, "Orders"]}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Top Products Performance Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Top Performing Products</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ranked by total revenue generated in the selected {timeframeDays}-day window
            </p>
          </div>
          <Award className="w-5 h-5 text-amber-500" />
        </div>

        {topProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No sales recorded in the last {timeframeDays} days.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Product Title</th>
                  <th className="px-4 py-3.5">SKU</th>
                  <th className="px-4 py-3.5 text-center">Units Sold</th>
                  <th className="px-4 py-3.5 text-center">Orders</th>
                  <th className="px-6 py-3.5 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topProducts.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 line-clamp-1">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600">{p.sku}</td>
                    <td className="px-4 py-4 text-center font-bold text-slate-800">{p.unitsSold}</td>
                    <td className="px-4 py-4 text-center text-slate-600">{p.orderCount}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-900">
                      {formatCurrency(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
