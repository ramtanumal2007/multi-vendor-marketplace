"use client";

import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { ArrowUpRight, ArrowDownRight, DollarSign, ShoppingCart, Users, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

export default function AdminDashboard() {
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);

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

    if (orders) {
      setTotalOrders(orders.length);
      setRecentOrders(orders.slice(0, 5));
      
      const rev = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
      setTotalRevenue(rev);

      // Generate dummy chart data for now but using real total scale
      setRevenueData([
        { name: "Mon", revenue: rev * 0.1 },
        { name: "Tue", revenue: rev * 0.15 },
        { name: "Wed", revenue: rev * 0.2 },
        { name: "Thu", revenue: rev * 0.1 },
        { name: "Fri", revenue: rev * 0.25 },
        { name: "Sat", revenue: rev * 0.15 },
        { name: "Sun", revenue: rev * 0.05 },
      ]);
    }
    
    setTotalCustomers(customerCount || 0);
    setIsLoading(false);
  };

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
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
          <h3 className="text-lg font-semibold mb-6">Revenue (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={3} dot={{ r: 4, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold mb-6">Top Selling Products</h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: "Premium T-Shirt", units: 120 },
                { name: "Minimal Watch", units: 85 },
                { name: "Leather Bag", units: 65 },
                { name: "Canvas Sneakers", units: 45 },
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

      {/* Recent Orders Table Placeholder */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Recent Orders</h3>
          <Link href="/admin/orders" className="text-sm font-medium text-accent hover:underline">View All</Link>
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

function KPICard({ title, value, icon: Icon, trend, trendUp }: { title: string, value: string, icon: any, trend: string, trendUp: boolean }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-slate-300 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-blue-50 rounded-lg text-accent group-hover:scale-110 transition-transform">
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
