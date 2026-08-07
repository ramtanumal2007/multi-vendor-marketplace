"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Package, Clock, CheckCircle2, Truck, XCircle, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(dateString));
}

const STATUSES = ["Ordered", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];

export default function AdminOrderDetailsPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingTo, setUpdatingTo] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  
  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    fetchOrderDetails();

    const channel = supabase.channel(`order-${params.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${params.id}` },
        (payload) => {
          setOrder(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_timeline', filter: `order_id=eq.${params.id}` },
        (payload) => {
          setTimeline(prev => {
            if (prev.some(t => t.id === payload.new.id)) return prev;
            
            const ts = payload.new.status;
            setCurrentStatus(ts.charAt(0).toUpperCase() + ts.slice(1).toLowerCase());
            
            return [payload.new, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.id]);

  async function fetchOrderDetails() {
    setIsLoading(true);
    
    // Fetch Order
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("id", params.id)
      .single();
      
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

    if (orderData) {
      setOrder(orderData);
      setItems(itemsData || []);
      setTimeline(timelineData || []);
      
      if (timelineData && timelineData.length > 0) {
        const ts = timelineData[0].status;
        setCurrentStatus(ts.charAt(0).toUpperCase() + ts.slice(1).toLowerCase());
      } else {
        const fs = orderData.fulfillment_status;
        const statusMap: Record<string, string> = {
          'pending': 'Ordered',
          'processing': 'Processing',
          'shipped': 'Shipped',
          'delivered': 'Delivered',
          'cancelled': 'Cancelled'
        };
        setCurrentStatus(statusMap[fs] || 'Ordered');
      }
    }
    
    setIsLoading(false);
  }

  const updateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    setUpdatingTo(newStatus);
    
    // Map to db fulfillment_status
    let dbStatus = "pending";
    if (newStatus === "Confirmed" || newStatus === "Processing") dbStatus = "processing";
    if (newStatus === "Shipped") dbStatus = "shipped";
    if (newStatus === "Delivered") dbStatus = "delivered";
    if (newStatus === "Cancelled") dbStatus = "cancelled";

    // 1. Update Order Table
    const { data: updatedOrder, error: orderError } = await supabase
      .from("orders")
      .update({ fulfillment_status: dbStatus })
      .eq("id", params.id)
      .select()
      .single();

    if (orderError) {
      addToast({ title: "Error", description: "Failed to update status", type: "error" });
      setIsUpdating(false);
      setUpdatingTo("");
      return;
    }

    // 2. Add Timeline Event
    const { data: newTimelineEvent, error: timelineError } = await supabase
      .from("order_timeline")
      .insert({
        order_id: params.id,
        status: newStatus,
        note: `Order status updated to ${newStatus}`
      })
      .select()
      .single();

    if (!timelineError) {
      addToast({ title: "Success", description: `Order status changed to ${newStatus}`, type: "success" });
      setOrder(updatedOrder);
      setCurrentStatus(newStatus); // Instantly update active highlight
      
      if (newTimelineEvent) {
        setTimeline(prev => {
          if (prev.some(t => t.id === newTimelineEvent.id)) return prev;
          return [newTimelineEvent, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });
      }
    }
    
    setIsUpdating(false);
    setUpdatingTo("");
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!order) {
    return <div>Order not found.</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Link href="/admin/orders" className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </Link>
        <div>
          <h2 className="text-2xl font-serif">Order {order.order_number}</h2>
          <p className="text-slate-500 mt-1">{formatDate(order.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Order Items */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-6">
            <h3 className="font-semibold mb-4">Items</h3>
            <div className="flex flex-col gap-4">
              {items.map(item => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center">
                      <Package className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-slate-500">Qty: {item.quantity}</p>
                    </div>
                  </div>
                  <div className="font-medium">{formatCurrency(item.line_total)}</div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 border-t border-slate-100 pt-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Shipping ({order.shipping_method})</span>
                <span>{formatCurrency(order.shipping_cost)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span>{formatCurrency(order.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-slate-100">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-6">
            <h3 className="font-semibold mb-6">Timeline</h3>
            <div className="flex flex-col gap-6">
              {timeline.map((event, i) => (
                <div key={event.id} className="flex gap-4 relative">
                  {i !== timeline.length - 1 && (
                    <div className="absolute top-8 bottom-[-24px] left-5 w-px bg-slate-200"></div>
                  )}
                  <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 z-10">
                    {getStatusIcon(event.status)}
                  </div>
                  <div className="pt-2">
                    <p className="font-medium">{event.status}</p>
                    <p className="text-sm text-slate-500">{formatDate(event.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          
          {/* Status Control */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-6">
            <h3 className="font-semibold mb-4">Update Status</h3>
            <div className="flex flex-col gap-3">
              {STATUSES.map(status => {
                const isActive = currentStatus.toLowerCase() === status.toLowerCase();
                const isThisUpdating = updatingTo.toLowerCase() === status.toLowerCase();
                
                let activeClasses = "border-accent bg-accent text-white shadow-md";
                let hoverClasses = "hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm";
                
                if (status === "Delivered") {
                  activeClasses = "border-green-500 bg-green-500 text-white shadow-md";
                } else if (status === "Cancelled") {
                  activeClasses = "border-red-500 bg-red-500 text-white shadow-md";
                  hoverClasses = "hover:border-red-300 hover:bg-red-50 hover:text-red-700 hover:shadow-sm";
                }

                return (
                  <button 
                    key={status}
                    disabled={isUpdating}
                    onClick={() => updateStatus(status)}
                    className={`flex items-center justify-start gap-3 p-4 rounded-lg border text-sm font-medium transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? activeClasses 
                        : "border-slate-200 bg-white text-slate-700 " + hoverClasses + " hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-700"
                    }`}
                  >
                    {isActive && !isThisUpdating && <CheckCircle2 className="w-5 h-5 text-white" />}
                    {isThisUpdating && <Loader2 className="w-5 h-5 animate-spin" />}
                    {!isActive && !isThisUpdating && <div className="w-5 h-5" />}
                    <span>{isThisUpdating ? "Updating..." : status}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm p-6">
            <h3 className="font-semibold mb-4">Customer</h3>
            <div className="text-sm flex flex-col gap-1 text-slate-600">
              <p className="font-medium text-slate-900">{order.shipping_address?.first_name} {order.shipping_address?.last_name}</p>
              <p>{order.email}</p>
            </div>
            
            <h3 className="font-semibold mt-6 mb-2">Shipping Address</h3>
            <div className="text-sm flex flex-col text-slate-600">
              <p>{order.shipping_address?.address_line1}</p>
              {order.shipping_address?.address_line2 && <p>{order.shipping_address?.address_line2}</p>}
              <p>{order.shipping_address?.city}, {order.shipping_address?.postal_code}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
