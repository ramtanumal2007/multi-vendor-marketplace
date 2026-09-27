"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { formatCurrency, mapInternalToCustomerStage } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { FileText, RotateCcw, Loader2, Package } from "lucide-react";
import { InvoiceModal } from "@/components/checkout/InvoiceModal";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import { executeReorder } from "@/lib/reorderHelper";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateString));
}

interface CustomerOrder {
  id: string;
  order_number: string;
  invoice_number?: string;
  created_at: string;
  internal_status?: string;
  fulfillment_status: string;
  payment_status: string;
  total: number;
  subtotal?: number;
  tax_amount?: number;
  delivery_charge?: number;
  tip_amount?: number;
  coupon_discount?: number;
  applied_coupon_code?: string;
  payment_method?: string;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone?: string;
  };
  email?: string;
  [key: string]: unknown;
}

interface CustomerProfileRow {
  id: string;
  customer_id_code?: string;
  full_name?: string;
  phone?: string;
  email?: string;
}

interface InvoiceItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  sku?: string;
  stores?: { name?: string } | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfileRow | null>(null);

  // Invoice Modal State
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<CustomerOrder | null>(null);
  const [activeInvoiceItems, setActiveInvoiceItems] = useState<InvoiceItem[]>([]);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);

  const { addItem, openDrawer } = useCart();
  const { addToast } = useToast();
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
  }, [supabase]);

  const handleOpenInvoice = async (order: CustomerOrder) => {
    setActiveInvoiceOrder(order);
    const { data: items } = await supabase
      .from("order_items")
      .select("*, stores(name)")
      .eq("order_id", order.id);
    setActiveInvoiceItems(items || []);
    setIsInvoiceOpen(true);
  };

  const handleReorderOrder = async (orderId: string) => {
    setReorderingOrderId(orderId);
    try {
      const res = await executeReorder(supabase, orderId, addItem, openDrawer);
      if (res.addedCount > 0) {
        addToast({
          title: "Added to Cart",
          description: `Successfully added ${res.addedCount} product(s) to your cart.`,
          type: "success",
        });
      }
      if (res.unavailableCount > 0 && res.messages.length > 0) {
        addToast({
          title: "Availability Notice",
          description: res.messages[0],
          type: "info",
        });
      }
    } catch {
      addToast({
        title: "Reorder Failed",
        description: "Could not add items to cart. Please try again.",
        type: "error",
      });
    } finally {
      setReorderingOrderId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-serif font-bold text-foreground mb-1">Order History</h2>
        <p className="text-sm text-foreground-secondary">
          Track shipments, review past invoices, and reorder favourite items.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3 bg-card rounded-2xl border border-border">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-foreground-secondary">Loading your orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3 bg-card rounded-2xl border border-dashed border-border">
          <Package className="w-12 h-12 text-foreground-secondary/40" />
          <h3 className="font-serif font-bold text-lg text-foreground">No orders yet</h3>
          <p className="text-xs text-foreground-secondary max-w-sm">
            Once you place an order, you will be able to track status and reorder items directly from here.
          </p>
          <Link href="/products" className="mt-2">
            <Button variant="primary" size="sm">Start Shopping</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile Cards (Hidden on md+) */}
          <div className="flex flex-col gap-4 md:hidden">
            {orders.map((order) => {
              const custStage = mapInternalToCustomerStage(order.internal_status || order.fulfillment_status);
              const isReordering = reorderingOrderId === order.id;

              return (
                <div
                  key={order.id}
                  className="bg-card border border-border rounded-2xl p-5 shadow-xs flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                    <div>
                      <div className="font-bold text-sm text-foreground">
                        Order #{order.order_number}
                      </div>
                      <div className="text-[11px] font-mono text-foreground-secondary">
                        {formatDate(order.created_at)}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        custStage === "DELIVERED"
                          ? "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300"
                          : custStage === "CANCELLED"
                          ? "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300"
                          : custStage === "SHIPPED"
                          ? "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300"
                          : "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300"
                      }`}
                    >
                      {custStage}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground-secondary text-xs">Total Amount</span>
                    <span className="font-black text-base text-foreground">
                      {formatCurrency(order.total)}
                    </span>
                  </div>

                  {/* Mobile Actions */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReorderOrder(order.id)}
                      disabled={isReordering}
                      className="text-xs h-9 font-bold flex items-center justify-center gap-1 border-accent/40 text-accent hover:bg-accent/10"
                    >
                      {isReordering ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Buy Again</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenInvoice(order)}
                      className="text-xs h-9 font-medium flex items-center justify-center gap-1 border-border"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span>Invoice</span>
                    </Button>

                    <Link href={`/account/orders/${order.id}`}>
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full text-xs h-9 font-bold flex items-center justify-center gap-1"
                      >
                        <span>Details</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (Hidden on mobile) */}
          <div className="hidden md:block border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-background-secondary text-foreground-secondary uppercase tracking-wider text-[11px] font-bold">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Order</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Total</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => {
                    const custStage = mapInternalToCustomerStage(
                      order.internal_status || order.fulfillment_status
                    );
                    const isReordering = reorderingOrderId === order.id;

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-background-secondary/40 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-foreground">
                            #{order.order_number}
                          </div>
                          <div className="text-[11px] font-mono text-foreground-secondary">
                            {order.invoice_number || `INV-${(order.order_number || "").replace("ORD-", "")}`}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-foreground-secondary text-xs">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              custStage === "DELIVERED"
                                ? "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300"
                                : custStage === "CANCELLED"
                                ? "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300"
                                : custStage === "SHIPPED"
                                ? "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300"
                                : "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300"
                            }`}
                          >
                            {custStage}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-foreground">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReorderOrder(order.id)}
                              disabled={isReordering}
                              className="h-8 text-xs px-2.5 font-bold flex items-center gap-1.5 border-accent/40 text-accent hover:bg-accent/10"
                            >
                              {isReordering ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              <span>Buy Again</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenInvoice(order)}
                              className="h-8 text-xs px-2.5 flex items-center gap-1 border-border font-medium"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-600" />
                              <span>Invoice</span>
                            </Button>
                            <Link href={`/account/orders/${order.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs px-3 font-semibold"
                              >
                                Details
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

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
