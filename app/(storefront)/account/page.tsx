"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Package, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateString));
}

export default function AccountDashboard() {
  const [user, setUser] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        fetchOrders(data.user.id);
      }
    });
  }, []);

  async function fetchOrders(userId: string) {
    const { data, count } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (data) {
      setRecentOrders(data.slice(0, 5));
    }
    if (count !== null) {
      setTotalOrders(count);
    }
  }


  if (!user) return <div className="animate-pulse h-40 bg-background-secondary rounded-lg" />;

  return (
    <div className="flex flex-col gap-12">
      <div>
        <h2 className="text-3xl font-bold mb-2">Welcome back!</h2>
        <p className="text-foreground-secondary">
          Logged in as <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-background-secondary p-6 rounded-2xl border border-border">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-foreground-secondary uppercase tracking-wider text-sm">Total Orders</h3>
            <Package className="w-5 h-5 text-accent" />
          </div>
          <p className="text-3xl font-bold">{totalOrders}</p>
        </div>
        <div className="bg-background-secondary p-6 rounded-2xl border border-border">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-foreground-secondary uppercase tracking-wider text-sm">Active Deliveries</h3>
            <div className="w-2 h-2 rounded-full bg-success animate-pulse mt-1.5" />
          </div>
          <p className="text-3xl font-bold">{recentOrders.filter(o => o.fulfillment_status !== 'delivered' && o.fulfillment_status !== 'cancelled').length}</p>
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold">Recent Orders</h3>
          <Link href="/account/orders" className="text-sm font-medium text-accent hover:underline flex items-center gap-1">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-background-secondary text-foreground-secondary uppercase tracking-widest text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Order</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-foreground-secondary">
                    No orders found.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-border hover:bg-background-secondary/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">
                      <Link href={`/account/orders/${order.id}`} className="hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-foreground-secondary">{formatDate(order.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold capitalize ${
                        order.fulfillment_status === 'pending' ? 'bg-yellow-500/20 text-yellow-600' :
                        order.fulfillment_status === 'delivered' ? 'bg-success/20 text-success' :
                        order.fulfillment_status === 'cancelled' ? 'bg-destructive/20 text-destructive' :
                        'bg-accent/20 text-accent'
                      }`}>
                        {order.fulfillment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(order.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
