"use client";

import React, { useState } from "react";
import { DollarSign, ShoppingBag, Eye, TrendingUp, Wallet, Clock, Truck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SellerAnalyticsWidgetProps {
  summaryStats?: {
    totalRevenue: number;
    totalOrders: number;
    conversionRate: number;
    pendingPayout: number;
    completedPayouts: number;
  };
  todayStats?: {
    todaySales: number;
    todayOrders: number;
    todayVisitors: number;
    pendingShipments: number;
  };
  weeklyStats?: {
    weeklyRevenue: number;
    weeklyOrders: number;
    weeklyViews: number;
  };
  monthlyStats?: {
    monthlyRevenue: number;
    monthlyOrders: number;
    monthlyViews: number;
  };
  stats?: {
    totalRevenue?: number;
    totalOrders?: number;
    catalogViews?: number;
    conversionRate?: number;
    pendingPayout?: number;
    completedPayouts?: number;
    todaySales?: number;
    todayOrders?: number;
    todayVisitors?: number;
    pendingShipments?: number;
  };
}

export function SellerAnalyticsWidget({
  summaryStats,
  todayStats,
  weeklyStats,
  monthlyStats,
  stats,
}: SellerAnalyticsWidgetProps) {
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("monthly");

  const revenue = summaryStats?.totalRevenue ?? stats?.totalRevenue ?? 0;
  const pendingPayout = summaryStats?.pendingPayout ?? stats?.pendingPayout ?? 0;
  const completedPayouts = summaryStats?.completedPayouts ?? stats?.completedPayouts ?? 0;
  const conversion = summaryStats?.conversionRate ?? stats?.conversionRate ?? 0;

  const todaySales = todayStats?.todaySales ?? stats?.todaySales ?? 0;
  const todayOrders = todayStats?.todayOrders ?? stats?.todayOrders ?? 0;
  const todayVisitors = todayStats?.todayVisitors ?? stats?.todayVisitors ?? 0;
  const pendingShipments = todayStats?.pendingShipments ?? stats?.pendingShipments ?? 0;

  // Active Timeframe values derived from dedicated RPCs/queries
  let displayRevenueVal = revenue;
  let displayOrdersVal = summaryStats?.totalOrders ?? stats?.totalOrders ?? 0;
  let displayViewsVal = stats?.catalogViews ?? 0;

  if (timeframe === "daily") {
    displayRevenueVal = todaySales;
    displayOrdersVal = todayOrders;
    displayViewsVal = todayVisitors;
  } else if (timeframe === "weekly") {
    displayRevenueVal = weeklyStats?.weeklyRevenue ?? 0;
    displayOrdersVal = weeklyStats?.weeklyOrders ?? 0;
    displayViewsVal = weeklyStats?.weeklyViews ?? 0;
  } else if (timeframe === "monthly") {
    displayRevenueVal = monthlyStats?.monthlyRevenue ?? revenue;
    displayOrdersVal = monthlyStats?.monthlyOrders ?? (summaryStats?.totalOrders ?? 0);
    displayViewsVal = monthlyStats?.monthlyViews ?? 0;
  }

  const metricCards = [
    {
      title: `${timeframe.toUpperCase()} Revenue`,
      value: formatCurrency(displayRevenueVal),
      subtitle: `Gross sales (${timeframe})`,
      icon: DollarSign,
      color: "text-emerald-600 bg-emerald-100",
    },
    {
      title: `${timeframe.toUpperCase()} Orders`,
      value: displayOrdersVal.toString(),
      subtitle: `Completed sales (${timeframe})`,
      icon: ShoppingBag,
      color: "text-blue-600 bg-blue-100",
    },
    {
      title: `${timeframe.toUpperCase()} Store Views`,
      value: displayViewsVal.toString(),
      subtitle: `Catalog impressions (${timeframe})`,
      icon: Eye,
      color: "text-indigo-600 bg-indigo-100",
    },
    {
      title: "Conversion Rate",
      value: `${conversion}%`,
      subtitle: "Visitor to order ratio",
      icon: TrendingUp,
      color: "text-purple-600 bg-purple-100",
    },
  ];

  return (
    <div className="mb-8 space-y-6">
      {/* Today's Snapshot Card */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-md border border-blue-800/60">
        <div className="flex items-center justify-between mb-4 border-b border-blue-700/60 pb-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" /> Today&apos;s Store Snapshot
          </h3>
          <span className="text-xs font-semibold bg-blue-800/80 text-blue-200 px-3 py-1 rounded-full border border-blue-700">
            Real-time Activity
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-950/60 border border-blue-700/40 p-4 rounded-xl">
            <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Today&apos;s Sales</div>
            <div className="text-xl font-bold text-white mt-1">{formatCurrency(todaySales)}</div>
          </div>

          <div className="bg-blue-950/60 border border-blue-700/40 p-4 rounded-xl">
            <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Today&apos;s Orders</div>
            <div className="text-xl font-bold text-white mt-1">{todayOrders}</div>
          </div>

          <div className="bg-blue-950/60 border border-blue-700/40 p-4 rounded-xl">
            <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Today&apos;s Visitors</div>
            <div className="text-xl font-bold text-white mt-1">{todayVisitors}</div>
          </div>

          <div className="bg-blue-950/60 border border-blue-700/40 p-4 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Pending Shipments</div>
              <div className="text-xl font-bold text-amber-300 mt-1">{pendingShipments}</div>
            </div>
            <Truck className="w-6 h-6 text-amber-400 opacity-80" />
          </div>
        </div>
      </div>

      {/* Analytics Architecture with Timeframe Toggle */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" /> Store Performance Analytics
          </h2>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            {(["daily", "weekly", "monthly"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  timeframe === tf ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {metricCards.map((card, i) => (
            <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.title}</p>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{card.value}</h3>
                <p className="text-xs text-slate-400 mt-1">{card.subtitle}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payout & Earnings Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-md border border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="p-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl">
            <Wallet className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Earnings Overview</h4>
            <div className="text-2xl font-bold text-white mt-0.5">{formatCurrency(revenue)}</div>
            <p className="text-xs text-slate-400 mt-0.5">Net seller earnings after marketplace fees</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-700">
          <div className="text-left md:text-right">
            <div className="text-xs text-slate-400">Pending Payout</div>
            <div className="text-lg font-bold text-amber-400">{formatCurrency(pendingPayout)}</div>
          </div>

          <div className="text-left md:text-right">
            <div className="text-xs text-slate-400">Completed Payouts</div>
            <div className="text-lg font-bold text-emerald-400">{completedPayouts}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
