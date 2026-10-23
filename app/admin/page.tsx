"use client";

import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Package, 
  Briefcase, 
  LifeBuoy, 
  AlertTriangle, 
  RotateCcw,
  RefreshCw,
  Download,
  ArrowRight,
  ShieldAlert
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { downloadCsv } from "@/lib/exportCsv";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface DashboardOrder {
  id: string;
  order_number: string;
  email: string;
  created_at: string;
  fulfillment_status: string;
  total: number;
}

interface RevenueDataPoint {
  name: string;
  revenue: number;
}

interface ActionCounters {
  pendingSellers: number;
  pendingProducts: number;
  openTickets: number;
  lowStockAlerts: number;
  pendingReturns: number;
}

export default function AdminDashboard() {
  const [recentOrders, setRecentOrders] = useState<DashboardOrder[]>([]);
  const [allOrders, setAllOrders] = useState<DashboardOrder[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [actionCounters, setActionCounters] = useState<ActionCounters>({
    pendingSellers: 0,
    pendingProducts: 0,
    openTickets: 0,
    lowStockAlerts: 0,
    pendingReturns: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const fetchDashboardData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      // 1. Fetch Orders
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      // 2. Fetch Customers (Profiles)
      const { count: customerCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer");

      // 3. Operational Action Counters (Real Live Counts)
      const [
        { count: pendingSellersCount },
        { count: pendingProductsCount },
        { count: lowStockCount },
        { count: returnsCount },
      ] = await Promise.all([
        supabase
          .from("seller_profiles")
          .select("*", { count: "exact", head: true })
          .eq("verification_status", "pending"),
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .lte("stock_quantity", 5),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .in("fulfillment_status", ["return_requested", "refund_pending", "replacement_requested"]),
      ]);

      // Open Support Tickets
      let openTicketsCount = 0;
      try {
        const { count: tickets } = await supabase
          .from("support_tickets")
          .select("*", { count: "exact", head: true })
          .in("status", ["OPEN", "UNDER_REVIEW", "open", "under_review"]);
        openTicketsCount = tickets || 0;
      } catch {
        openTicketsCount = 0;
      }

      setActionCounters({
        pendingSellers: pendingSellersCount || 0,
        pendingProducts: pendingProductsCount || 0,
        openTickets: openTicketsCount,
        lowStockAlerts: lowStockCount || 0,
        pendingReturns: returnsCount || 0,
      });

      if (orders) {
        setAllOrders(orders as DashboardOrder[]);
        setTotalOrders(orders.length);
        setRecentOrders(orders.slice(0, 5) as DashboardOrder[]);
        
        const rev = orders.reduce((sum: number, order: { total: number | string | null }) => sum + (Number(order.total) || 0), 0);
        setTotalRevenue(rev);

        // Calculate last 7 days daily revenue dynamically
        const daysMap: Record<string, number> = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = d.toLocaleDateString("en-US", { weekday: "short" });
          daysMap[key] = 0;
        }

        orders.forEach((ord: { created_at: string; total: number | null }) => {
          const orderDate = new Date(ord.created_at);
          const diffDays = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays < 7) {
            const dayKey = orderDate.toLocaleDateString("en-US", { weekday: "short" });
            if (daysMap[dayKey] !== undefined) {
              daysMap[dayKey] += Number(ord.total) || 0;
            }
          }
        });

        const revData = Object.entries(daysMap).map(([name, revenue]) => ({
          name,
          revenue,
        }));
        setRevenueData(revData);
      }
      
      setTotalCustomers(customerCount || 0);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const handleExportSalesSummary = () => {
    const summaryMap: Record<string, { count: number; total: number }> = {};
    allOrders.forEach((o) => {
      const dateKey = o.created_at.split("T")[0];
      if (!summaryMap[dateKey]) {
        summaryMap[dateKey] = { count: 0, total: 0 };
      }
      summaryMap[dateKey].count += 1;
      summaryMap[dateKey].total += Number(o.total) || 0;
    });

    const headers = ["Date", "Orders Count", "Total Revenue (INR)", "Avg Order Value (INR)"];
    const rows = Object.entries(summaryMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, stats]) => [
        date,
        stats.count,
        stats.total.toFixed(2),
        (stats.count > 0 ? stats.total / stats.count : 0).toFixed(2),
      ]);

    downloadCsv("sales_summary", headers, rows);
  };

  const totalActionItems = 
    actionCounters.pendingSellers + 
    actionCounters.pendingProducts + 
    actionCounters.openTickets + 
    actionCounters.lowStockAlerts + 
    actionCounters.pendingReturns;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      {/* Top Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time marketplace revenue, operational queue, and performance metrics.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportSalesSummary}
            disabled={allOrders.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export Sales CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Feature 20: Operational Action Center (Real Action Counters) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${totalActionItems > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Operational Attention Center</h2>
              <p className="text-xs text-slate-500">Live operational queues requiring admin review or moderation</p>
            </div>
          </div>
          {totalActionItems > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {totalActionItems} Pending Actions
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              All Queues Clear
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Pending Sellers */}
          <Link
            href="/admin/sellers"
            className="group flex flex-col p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <Briefcase className="w-4 h-4 group-hover:text-blue-600 transition-colors" />
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              {actionCounters.pendingSellers}
            </span>
            <span className="text-xs text-slate-600 font-medium mt-0.5 truncate">
              Pending Sellers
            </span>
          </Link>

          {/* Pending Products */}
          <Link
            href="/admin/products"
            className="group flex flex-col p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <Package className="w-4 h-4 group-hover:text-blue-600 transition-colors" />
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              {actionCounters.pendingProducts}
            </span>
            <span className="text-xs text-slate-600 font-medium mt-0.5 truncate">
              Pending Products
            </span>
          </Link>

          {/* Open Tickets */}
          <Link
            href="/admin/support"
            className="group flex flex-col p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <LifeBuoy className="w-4 h-4 group-hover:text-blue-600 transition-colors" />
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              {actionCounters.openTickets}
            </span>
            <span className="text-xs text-slate-600 font-medium mt-0.5 truncate">
              Open Tickets
            </span>
          </Link>

          {/* Low Stock Alerts */}
          <Link
            href="/admin/products"
            className="group flex flex-col p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <AlertTriangle className="w-4 h-4 group-hover:text-amber-600 transition-colors" />
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              {actionCounters.lowStockAlerts}
            </span>
            <span className="text-xs text-slate-600 font-medium mt-0.5 truncate">
              Low Stock Alerts
            </span>
          </Link>

          {/* Pending Returns / Refunds */}
          <Link
            href="/admin/orders"
            className="group flex flex-col p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <RotateCcw className="w-4 h-4 group-hover:text-blue-600 transition-colors" />
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              {actionCounters.pendingReturns}
            </span>
            <span className="text-xs text-slate-600 font-medium mt-0.5 truncate">
              Returns / Refunds
            </span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={DollarSign} trend="+20.1%" trendUp={true} />
        <KPICard title="Total Orders" value={totalOrders.toString()} icon={ShoppingCart} trend="+12.5%" trendUp={true} />
        <KPICard title="Total Customers" value={totalCustomers.toString()} icon={Users} trend="+5.2%" trendUp={true} />
        <KPICard title="Avg Order Value" value={formatCurrency(avgOrderValue)} icon={Package} trend="-2.4%" trendUp={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 lg:col-span-2 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Revenue Trend (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} tickFormatter={(value) => `₹${value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: unknown) => [formatCurrency(Number(value) || 0), "Revenue"]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={3} dot={{ r: 4, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold mb-6">Top Selling Categories</h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: "Electronics", units: 120 },
                { name: "Fashion", units: 85 },
                { name: "Home & Kitchen", units: 65 },
                { name: "Beauty", units: 45 },
              ]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="units" fill="#2563EB" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900">Recent Orders</h3>
          <Link href="/admin/orders" className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{order.order_number}</td>
                  <td className="px-6 py-4 text-slate-600">{order.email}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(order.created_at))}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                      order.fulfillment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.fulfillment_status === 'delivered' ? 'bg-green-100 text-green-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {order.fulfillment_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-slate-900">{formatCurrency(order.total)}</td>
                </tr>
              ))}
              {recentOrders.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon: Icon, trend, trendUp }: { title: string, value: string, icon: React.ComponentType<{ className?: string }>, trend: string, trendUp: boolean }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-slate-300 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:scale-110 transition-transform">
          <Icon className="w-5 h-5" />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div>
        <h4 className="text-slate-500 text-sm font-medium mb-1">{title}</h4>
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
