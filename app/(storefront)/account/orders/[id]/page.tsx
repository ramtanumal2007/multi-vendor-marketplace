"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Package, Clock, CheckCircle2, Truck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/context/AuthContext";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(dateString));
}

const ORDER_FLOW = ["Ordered", "Confirmed", "Processing", "Shipped", "Delivered"];

export default function CustomerOrderDetailsPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const supabase = createClient();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    
    if (user) {
      fetchOrderDetails();
      
      // Setup Realtime Subscription
      const channel = supabase
        .channel(`order_updates_${params.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'order_timeline', filter: `order_id=eq.${params.id}` },
          (payload) => {
            console.log('Realtime timeline update!', payload);
            setTimeline(prev => [payload.new, ...prev]);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${params.id}` },
          (payload) => {
            console.log('Realtime order update!', payload);
            setOrder(payload.new);
          }
        )
        .subscribe();
        
      // Polling fallback every 10 seconds in case realtime isn't enabled
      const interval = setInterval(() => {
        fetchOrderDetails(false); // background fetch
      }, 10000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [params.id, user, authLoading]);

  async function fetchOrderDetails(showLoading = true) {
    if (showLoading) setIsLoading(true);
    
    // Fetch Order
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user?.id) // Security check
      .single();
      
    if (orderData) {
      // Fetch Items
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", params.id);
        
      // Fetch Timeline
      const { data: timelineData } = await supabase
        .from("order_timeline")
        .select("*")
        .eq("order_id", params.id)
        .order("created_at", { ascending: false });

      setOrder(orderData);
      setItems(itemsData || []);
      setTimeline(timelineData || []);
    }
    
    if (showLoading) setIsLoading(false);
  }

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'Ordered': return <Package className="w-5 h-5 text-blue-500" />;
      case 'Confirmed': return <CheckCircle2 className="w-5 h-5 text-indigo-500" />;
      case 'Processing': return <Clock className="w-5 h-5 text-orange-500" />;
      case 'Shipped': return <Truck className="w-5 h-5 text-purple-500" />;
      case 'Delivered': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'Cancelled': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <Package className="w-5 h-5 text-slate-500" />;
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <h1 className="text-3xl font-serif mb-4">Order Not Found</h1>
        <p className="text-foreground-secondary mb-8">We couldn't find this order or you don't have access to it.</p>
        <Link href="/account">
          <Button variant="primary">Back to Account</Button>
        </Link>
      </div>
    );
  }

  const currentStatus = timeline.length > 0 
    ? timeline[0].status 
    : (order.fulfillment_status === 'pending' ? 'Ordered' : 
       order.fulfillment_status === 'processing' ? 'Processing' : 
       order.fulfillment_status === 'shipped' ? 'Shipped' : 
       order.fulfillment_status === 'delivered' ? 'Delivered' : 
       order.fulfillment_status === 'cancelled' ? 'Cancelled' : 
       "Ordered");
  const currentStepIndex = ORDER_FLOW.indexOf(currentStatus);
  const isCancelled = currentStatus === "Cancelled";

  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-12 w-full flex flex-col gap-10">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/account" className="p-2 border border-border rounded-lg hover:bg-background-secondary transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Order #{order.order_number}</h1>
            <p className="text-foreground-secondary mt-1 font-medium">Placed on {formatDate(order.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Visual Tracking Bar */}
      <div className="bg-background-secondary/50 p-6 md:p-8 rounded-2xl border border-border">
        <h2 className="text-xl font-bold mb-8">Tracking Status</h2>
        
        {isCancelled ? (
          <div className="flex items-center gap-4 text-red-500">
            <XCircle className="w-8 h-8" />
            <div>
              <p className="text-xl font-medium">Order Cancelled</p>
              <p className="text-sm">This order has been cancelled.</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-5 left-0 w-full h-1 bg-border rounded-full z-0"></div>
            
            {currentStepIndex >= 0 && (
              <motion.div 
                className="absolute top-5 left-0 h-1 bg-accent rounded-full z-0"
                initial={{ width: "0%" }}
                animate={{ width: `${(currentStepIndex / (ORDER_FLOW.length - 1)) * 100}%` }}
                transition={{ duration: 1, ease: "easeInOut" }}
              />
            )}

            <div className="relative z-10 flex justify-between">
              {ORDER_FLOW.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                
                return (
                  <div key={step} className="flex flex-col items-center gap-3">
                    <motion.div 
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted ? "bg-accent border-accent text-white" : "bg-white border-border text-border"
                      }`}
                      initial={false}
                      animate={{
                        scale: isCurrent ? 1.1 : 1,
                      }}
                    >
                      {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <div className="w-3 h-3 rounded-full bg-border" />}
                    </motion.div>
                    <span className={`text-sm font-medium ${isCompleted ? "text-foreground" : "text-foreground-secondary"}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Left: Items */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          <div className="border border-border rounded-2xl p-6 bg-background">
            <h2 className="text-xl font-bold mb-6">Order Items</h2>
            <div className="flex flex-col gap-6">
              {items.map(item => (
                <div key={item.id} className="flex justify-between items-center pb-6 border-b border-border last:border-0 last:pb-0">
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-16 bg-background-secondary rounded flex items-center justify-center">
                      <Package className="w-6 h-6 text-foreground-secondary" />
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-foreground-secondary mt-1">Quantity: {item.quantity}</p>
                    </div>
                  </div>
                  <div className="font-medium">{formatCurrency(item.line_total)}</div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 border-t border-border pt-6 flex flex-col gap-3 text-sm">
              <div className="flex justify-between text-foreground-secondary">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-foreground-secondary">
                <span>Shipping ({order.shipping_method})</span>
                <span>{formatCurrency(order.shipping_cost)}</span>
              </div>
              <div className="flex justify-between text-foreground-secondary">
                <span>Estimated Tax</span>
                <span>{formatCurrency(order.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-medium text-lg mt-3 pt-3 border-t border-border">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex flex-col gap-8">
          
          {/* Timeline Details */}
          <div className="border border-border rounded-2xl p-6 bg-background">
            <h2 className="text-xl font-bold mb-6">Update History</h2>
            <div className="flex flex-col gap-6">
              {timeline.map((event, i) => (
                <div key={event.id} className="flex gap-4 relative">
                  {i !== timeline.length - 1 && (
                    <div className="absolute top-8 bottom-[-24px] left-[19px] w-px bg-border"></div>
                  )}
                  <div className="w-10 h-10 rounded-full bg-background-secondary border border-border flex items-center justify-center flex-shrink-0 z-10">
                    {getStatusIcon(event.status)}
                  </div>
                  <div className="pt-2">
                    <p className="font-medium">{event.status}</p>
                    <p className="text-sm text-foreground-secondary">{formatDate(event.created_at)}</p>
                    {event.note && <p className="text-sm mt-1">{event.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="border border-border rounded-2xl p-6 bg-background">
            <h2 className="text-xl font-bold mb-4">Shipping Details</h2>
            <div className="text-sm flex flex-col gap-1 text-foreground-secondary">
              <p className="font-medium text-foreground">{order.shipping_address?.first_name} {order.shipping_address?.last_name}</p>
              <p>{order.shipping_address?.address_line1}</p>
              {order.shipping_address?.address_line2 && <p>{order.shipping_address?.address_line2}</p>}
              <p>{order.shipping_address?.city}, {order.shipping_address?.postal_code}</p>
              <p>{order.shipping_address?.country}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
