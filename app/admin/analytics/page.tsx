"use client";

import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from "recharts";
import { DollarSign, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";

export default function AdminAnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    avgOrderValue: 0
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  
  const supabase = createClient();

  useEffect(() => {
    async function fetchAnalytics() {
      setIsLoading(true);

      // Fetch Orders
      const { data: orders } = await supabase
        .from("orders")
        .select("total, created_at")
        .order("created_at", { ascending: true });

      // Fetch Customers
      const { count: customerCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer");

      if (orders) {
        const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
        const totalOrders = orders.length;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        setStats({
          totalRevenue,
          totalOrders,
          totalCustomers: customerCount || 0,
          avgOrderValue
        });

        // Group by day for the chart (simplified for demo)
        const last7Days = Array.from({length: 7}, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
        });

        const dailyRevenue = last7Days.map(dateStr => {
          const dayOrders = orders.filter(o => o.created_at.startsWith(dateStr));
          const rev = dayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
          const shortName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(dateStr));
          return { name: shortName, fullDate: dateStr, revenue: rev, orders: dayOrders.length };
        });

        setRevenueData(dailyRevenue);
      }
      
      setIsLoading(false);
    }
    fetchAnalytics();
  }, []);

  if (isLoading) {
    return <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analytics & Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Detailed breakdown of your store's performance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={<DollarSign className="w-5 h-5" />} />
        <StatCard title="Total Orders" value={stats.totalOrders.toString()} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard title="Average Order Value" value={formatCurrency(stats.avgOrderValue)} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="Total Customers" value={stats.totalCustomers.toString()} icon={<Users className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        {/* Revenue Over Time */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Revenue Over Time (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 5, right: 0, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} tickFormatter={(val) => `₹${val}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders Over Time */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Orders Volume (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 5, right: 0, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="orders" fill="#0f172a" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <h4 className="text-slate-500 text-sm font-medium">{title}</h4>
        <div className="p-2 bg-slate-50 rounded-lg text-slate-700">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
