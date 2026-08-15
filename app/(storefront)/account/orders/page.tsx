"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { formatCurrency, mapInternalToCustomerStage } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { FileText } from "lucide-react";
import { InvoiceModal } from "@/components/checkout/InvoiceModal";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateString));
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState<any>(null);

  // Invoice Modal State
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<any>(null);
  const [activeInvoiceItems, setActiveInvoiceItems] = useState<any[]>([]);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function fetchOrders() {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setCustomerProfile(prof || null);

        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (data) setOrders(data);
      }
      setIsLoading(false);
    }
    fetchOrders();
  }, []);

  const handleOpenInvoice = async (order: any) => {
    setActiveInvoiceOrder(order);
    const { data: items } = await supabase
      .from("order_items")
      .select("*, stores(name)")
      .eq("order_id", order.id);
    setActiveInvoiceItems(items || []);
    setIsInvoiceOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-serif mb-2">Order History</h2>
        <p className="text-foreground-secondary">
          View and manage your recent orders.
        </p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-background-secondary text-foreground-secondary uppercase tracking-widest text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Order ID</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Items</th>
                <th className="px-6 py-4 font-medium text-right">Total</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="flex justify-center items-center">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-foreground-secondary">
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-t border-border hover:bg-background-secondary/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">#{order.order_number}</div>
                      <div className="text-[11px] font-mono text-foreground-secondary">
                        {order.invoice_number || `INV-${(order.order_number || "").replace("ORD-", "")}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-foreground-secondary">{formatDate(order.created_at)}</td>
                    <td className="px-6 py-4">
                      {(() => {
                        const custStage = mapInternalToCustomerStage(order.internal_status || order.fulfillment_status);
                        return (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            custStage === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                            custStage === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                            custStage === 'SHIPPED' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {custStage}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-foreground-secondary">-</td>
                    <td className="px-6 py-4 text-right font-medium text-foreground">{formatCurrency(order.total)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenInvoice(order)}
                          className="h-8 text-xs px-2.5 flex items-center gap-1 border-slate-300"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" /> Invoice
                        </Button>
                        <Link href={`/account/orders/${order.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs px-3">View Details</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeInvoiceOrder && (
        <InvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
          order={activeInvoiceOrder}
          items={activeInvoiceItems}
          customerProfile={customerProfile}
        />
      )}
    </div>
  );
}
