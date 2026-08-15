"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Search,
  Filter,
  UserCheck,
  MessageSquare,
  Send,
  Loader2,
  RefreshCw,
  Eye,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  formatCurrency,
  formatExactDateTime,
  formatRelativeTime,
  normalizeInternalStatus,
  formatOrderItemId,
} from "@/lib/utils";

interface SellerOrderItem {
  id: string;
  order_item_code?: string;
  product_id?: string;
  title: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface SellerOrder {
  id: string;
  order_number: string;
  customer_id_code: string;
  items: SellerOrderItem[];
  seller_total: number;
  payment_method?: string;
  payment_status: string;
  fulfillment_status: string;
  internal_status: string;
  created_at: string;
  timeline: any[];
}

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);

  // Product Click Drawer/Modal state
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [productContext, setProductContext] = useState<any>(null);
  const [productDetails, setProductDetails] = useState<any>(null);
  const [isLoadingProductDetails, setIsLoadingProductDetails] = useState(false);
  const [productFetchError, setProductFetchError] = useState<string | null>(null);
  const [copiedSku, setCopiedSku] = useState(false);
  const [copiedProductId, setCopiedProductId] = useState(false);

  const handleCopySku = (skuText: string) => {
    if (!skuText || skuText === "N/A") return;
    navigator.clipboard.writeText(skuText);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 2000);
  };

  const handleCopyProductId = (idText: string) => {
    if (!idText || idText === "N/A") return;
    navigator.clipboard.writeText(idText);
    setCopiedProductId(true);
    setTimeout(() => setCopiedProductId(false), 2000);
  };

  // Custom Note Input State
  const [customNote, setCustomNote] = useState("");
  const [isPostingNote, setIsPostingNote] = useState(false);
  const [updatingStatusTo, setUpdatingStatusTo] = useState("");

  const supabase = createClient();
  const { addToast } = useToast();

  const handleProductClick = async (orderItemId?: string, context?: any) => {
    setIsProductDrawerOpen(true);
    setProductContext(context || {});
    setProductFetchError(null);
    setProductDetails(null);

    if (!orderItemId) {
      setProductFetchError("Order item ID is not available.");
      return;
    }

    setIsLoadingProductDetails(true);
    try {
      const { data, error } = await supabase.rpc("get_seller_order_product_details", {
        p_order_item_id: orderItemId,
      });

      if (error) {
        setProductFetchError(error.message || "Failed to fetch seller store product details.");
      } else if (data && data.success === false) {
        setProductFetchError(data.error || "Order item does not belong to your seller store.");
      } else if (data) {
        setProductDetails(data);
      }
    } catch (err: any) {
      setProductFetchError(err.message || "Failed to load product listing details.");
    } finally {
      setIsLoadingProductDetails(false);
    }
  };

  const closeProductDrawer = () => {
    setIsProductDrawerOpen(false);
    setProductContext(null);
    setProductDetails(null);
    setIsLoadingProductDetails(false);
    setProductFetchError(null);
  };

  // Keyboard ESC support for Product Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isProductDrawerOpen) {
        closeProductDrawer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProductDrawerOpen]);

  useEffect(() => {
    fetchSellerOrders();

    const channel = supabase
      .channel("seller-orders-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchSellerOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_timeline" }, () => {
        fetchSellerOrders();
      })
      .subscribe();

    const interval = setInterval(() => {
      fetchSellerOrders();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const fetchSellerOrders = async () => {
    setIsLoading(true);

    try {
      // 1. Primary: Fetch anonymized seller orders via SECURITY DEFINER RPC (Zero Customer PII)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_seller_orders");

      if (!rpcErr && rpcData) {
        const compiled: SellerOrder[] = rpcData.map((row: any) => ({
          id: row.order_id,
          order_number: row.order_number,
          customer_id_code: row.customer_id_code || `CUS-${row.order_id.substring(0, 6).toUpperCase()}`,
          seller_total: Number(row.seller_total || 0),
          payment_method: row.payment_method || "COD",
          payment_status: row.payment_status || "pending",
          fulfillment_status: row.fulfillment_status || "pending",
          internal_status: normalizeInternalStatus(row.internal_status),
          created_at: row.created_at,
          items: Array.isArray(row.items) ? row.items : [],
          timeline: Array.isArray(row.timeline) ? row.timeline : [],
        }));

        setOrders(compiled);
        if (selectedOrder) {
          const refreshed = compiled.find((o) => o.id === selectedOrder.id);
          if (refreshed) setSelectedOrder(refreshed);
        }
        setIsLoading(false);
        return;
      }

      // 2. Fallback: Query order items by seller store ID without customer profile/address PII
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: storeData } = await supabase
        .from("stores")
        .select("id")
        .eq("seller_id", user.id)
        .single();

      if (!storeData?.id) {
        setOrders([]);
        setIsLoading(false);
        return;
      }

      const { data: itemsData } = await supabase
        .from("order_items")
        .select(
          "id, order_id, order_item_code, product_id, title, sku, quantity, unit_price, line_total, orders(id, order_number, user_id, payment_status, fulfillment_status, internal_status, created_at)"
        )
        .eq("store_id", storeData.id);

      if (itemsData && itemsData.length > 0) {
        const orderMap = new Map<string, { ord: any; items: SellerOrderItem[]; total: number }>();

        itemsData.forEach((item: any) => {
          const ord = Array.isArray(item.orders) ? item.orders[0] : item.orders;
          if (!ord) return;

          const current = orderMap.get(ord.id) || { ord, items: [], total: 0 };
          current.items.push({
            id: item.id,
            order_item_code: item.order_item_code,
            product_id: item.product_id,
            title: item.title,
            sku: item.sku,
            quantity: item.quantity,
            unit_price: Number(item.unit_price || 0),
            line_total: Number(item.line_total || 0),
          });
          current.total += Number(item.line_total || 0);
          orderMap.set(ord.id, current);
        });

        const orderIds = Array.from(orderMap.keys());

        const { data: timelinesData } = await supabase
          .from("order_timeline")
          .select("*")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });

        const timelineMap = new Map<string, any[]>();
        (timelinesData || []).forEach((t: any) => {
          const arr = timelineMap.get(t.order_id) || [];
          arr.push(t);
          timelineMap.set(t.order_id, arr);
        });

        const compiled: SellerOrder[] = Array.from(orderMap.values()).map(
          ({ ord, items, total }) => {
            const customerCode = `CUS-${ord.id.substring(0, 6).toUpperCase()}`;
            const internalStatus = normalizeInternalStatus(ord.internal_status || ord.fulfillment_status);

            return {
              id: ord.id,
              order_number: ord.order_number,
              customer_id_code: customerCode,
              items,
              seller_total: total,
              payment_status: ord.payment_status,
              fulfillment_status: ord.fulfillment_status,
              internal_status: internalStatus,
              created_at: ord.created_at,
              timeline: timelineMap.get(ord.id) || [],
            };
          }
        );

        compiled.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setOrders(compiled);
        if (selectedOrder) {
          const refreshed = compiled.find((o) => o.id === selectedOrder.id);
          if (refreshed) setSelectedOrder(refreshed);
        }
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to load seller orders.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Status transition handler for Seller 3-Step Lifecycle
  const handleUpdateStatus = async (orderObj: SellerOrder, newStatus: string) => {
    const currentStatus = orderObj.internal_status;

    // Validate Seller allowed transitions: ORDERED -> CONFIRMED -> READY TO DISPATCH
    if (
      !(
        (currentStatus === "ORDERED" && newStatus === "CONFIRMED") ||
        (currentStatus === "CONFIRMED" && newStatus === "READY TO DISPATCH")
      )
    ) {
      addToast({
        title: "Transition Not Allowed",
        description: `Sellers can only move ORDERED to CONFIRMED, or CONFIRMED to READY TO DISPATCH.`,
        type: "error",
      });
      return;
    }

    setUpdatingStatusTo(newStatus);

    try {
      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          internal_status: newStatus,
          fulfillment_status: newStatus === "READY TO DISPATCH" ? "shipped" : "processing",
        })
        .eq("id", orderObj.id);

      if (updateErr) throw updateErr;

      const noteText =
        newStatus === "CONFIRMED"
          ? "Order confirmed by seller. Packing in progress."
          : "Order packed and marked ready for logistics dispatch.";

      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("order_timeline").insert({
        order_id: orderObj.id,
        status: newStatus,
        note: noteText,
        created_by: user?.id,
      });

      addToast({
        title: "Status Updated",
        description: `Order #${orderObj.order_number} status changed to ${newStatus}.`,
        type: "success",
      });

      fetchSellerOrders();
    } catch (err: any) {
      addToast({
        title: "Update Failed",
        description: err.message || "Failed to update order status.",
        type: "error",
      });
    } finally {
      setUpdatingStatusTo("");
    }
  };

  // Custom Customer-facing Note handler
  const handlePostCustomNote = async (orderObj: SellerOrder) => {
    if (!customNote.trim()) return;

    if (!["ORDERED", "CONFIRMED", "READY TO DISPATCH"].includes(orderObj.internal_status)) {
      addToast({
        title: "Updates Locked",
        description: "Seller custom customer updates are locked once order moves beyond READY TO DISPATCH.",
        type: "error",
      });
      return;
    }

    setIsPostingNote(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("order_timeline").insert({
        order_id: orderObj.id,
        status: orderObj.internal_status,
        note: customNote.trim(),
        created_by: user?.id,
      });

      if (error) throw error;

      addToast({
        title: "Customer Update Posted",
        description: "Custom note published to customer tracking timeline.",
        type: "success",
      });

      setCustomNote("");
      fetchSellerOrders();
    } catch (err: any) {
      addToast({
        title: "Failed to Post Note",
        description: err.message || "Could not publish custom note.",
        type: "error",
      });
    } finally {
      setIsPostingNote(false);
    }
  };

  // Filter orders by search & status
  const filteredOrders = orders.filter((ord) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      ord.order_number.toLowerCase().includes(term) ||
      ord.customer_id_code.toLowerCase().includes(term) ||
      ord.items.some((i) => i.title.toLowerCase().includes(term));

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = ord.internal_status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col pb-12">
      {/* Privacy Notice Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store Orders</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-emerald-600 inline" />
            Marketplace Seller Portal — Strict Customer PII Protection Active
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSellerOrders} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by order #, Customer ID, or product title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">All Internal Statuses</option>
                <option value="ORDERED">ORDERED</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="READY TO DISPATCH">READY TO DISPATCH</option>
                <option value="SHIPPED">SHIPPED</option>
                <option value="IN TRANSIT">IN TRANSIT</option>
                <option value="OUT FOR DELIVERY">OUT FOR DELIVERY</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>
            </div>

            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              {filteredOrders.length} Orders
            </span>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-12 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[950px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-4">Order & Date</th>
                  <th className="p-4">Customer ID</th>
                  <th className="p-4">Products & Quantity</th>
                  <th className="p-4">Amount & Payment</th>
                  <th className="p-4">Current Status</th>
                  <th className="p-4 text-right">Actions & Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOrders.map((ord) => {
                  const normStatus = ord.internal_status;
                  const isSellerControlled = ["ORDERED", "CONFIRMED"].includes(normStatus);
                  const isReadyToDispatch = normStatus === "READY TO DISPATCH";

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-bold text-slate-900">#{ord.order_number}</div>
                        <div className="text-slate-500 text-xs mt-0.5">
                          {formatExactDateTime(ord.created_at)}
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          ({formatRelativeTime(ord.created_at)})
                        </div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 w-fit">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          {ord.customer_id_code}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Protected Customer Reference
                        </div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="space-y-2">
                          {ord.items.map((item, idx) => {
                            const itemCode =
                              item.order_item_code ||
                              formatOrderItemId(item.id, ord.order_number, idx);
                            const itemSku = item.sku || "N/A";

                            return (
                              <div key={item.id} className="text-slate-800 border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                                <div className="flex items-center gap-1.5 font-mono text-[10px] text-blue-700 font-bold">
                                  <span>{itemCode}</span>
                                  <span className="text-slate-400">|</span>
                                  <span className="text-slate-500 font-normal">SKU: {itemSku}</span>
                                </div>
                                <div className="mt-0.5">
                                  <button
                                    onClick={() =>
                                      handleProductClick(item.id, {
                                        orderItemCode: itemCode,
                                        orderNumber: ord.order_number,
                                        orderItemTitle: item.title,
                                        orderItemPrice: item.unit_price,
                                        quantity: item.quantity,
                                        sku: itemSku,
                                        productId: item.product_id,
                                      })
                                    }
                                    className="font-bold text-slate-900 hover:text-blue-600 hover:underline text-left cursor-pointer transition-colors"
                                    title="Click to view product details"
                                  >
                                    {item.title}
                                  </button>{" "}
                                  <span className="text-slate-500 font-bold">x{item.quantity}</span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {formatCurrency(item.unit_price)} / unit
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="p-4 align-top text-xs">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatCurrency(ord.seller_total)}
                        </div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize mt-1 ${
                            ord.payment_status === "paid"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {ord.payment_status}
                        </span>
                      </td>

                      <td className="p-4 align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            normStatus === "DELIVERED"
                              ? "bg-green-100 text-green-800 border border-green-200"
                              : normStatus === "CANCELLED"
                              ? "bg-red-100 text-red-800 border border-red-200"
                              : normStatus === "READY TO DISPATCH"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : normStatus === "CONFIRMED"
                              ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                              : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {normStatus}
                        </span>
                        {isReadyToDispatch && (
                          <div className="text-[10px] text-purple-700 font-semibold mt-1">
                            Ready for Shipping Pickup
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top text-right space-y-2">
                        <button
                          onClick={() => setSelectedOrder(ord)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details & Updates
                        </button>

                        {/* Seller Control Buttons */}
                        {isSellerControlled ? (
                          <div className="flex flex-col gap-1.5 items-end pt-1">
                            {normStatus === "ORDERED" && (
                              <button
                                disabled={updatingStatusTo === "CONFIRMED"}
                                onClick={() => handleUpdateStatus(ord, "CONFIRMED")}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                              >
                                {updatingStatusTo === "CONFIRMED" ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                Confirm Order
                              </button>
                            )}

                            {normStatus === "CONFIRMED" && (
                              <button
                                disabled={updatingStatusTo === "READY TO DISPATCH"}
                                onClick={() => handleUpdateStatus(ord, "READY TO DISPATCH")}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                              >
                                {updatingStatusTo === "READY TO DISPATCH" ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Truck className="w-3 h-3" />
                                )}
                                Mark Ready to Dispatch
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500 italic pt-1 font-medium">
                            Seller control locked ({normStatus})
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center text-slate-500">
              <Package className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No orders found</h3>
              <p className="text-xs text-slate-500">
                No orders match your current search query or status filter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Order Detailed Activity Drawer/Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 relative overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Order #{selectedOrder.order_number} Details & Activity
                </h2>
                <p className="text-xs text-slate-500">
                  Placed on {formatExactDateTime(selectedOrder.created_at)} (
                  {formatRelativeTime(selectedOrder.created_at)})
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
              {/* Order Info & Protected Customer Reference */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-medium">Customer ID</span>
                  <span className="font-bold text-slate-800 text-sm flex items-center gap-1 mt-0.5">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    {selectedOrder.customer_id_code}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Marketplace Anonymous Order ID
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Current Status</span>
                  <span className="font-bold text-blue-700 text-sm">{selectedOrder.internal_status}</span>
                  <span className="text-slate-500 block mt-1">
                    Store Total: <strong>{formatCurrency(selectedOrder.seller_total)}</strong>
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Purchased Products
                </h3>
                <div className="divide-y divide-slate-200">
                  {selectedOrder.items.map((item, idx) => {
                    const itemCode =
                      item.order_item_code ||
                      formatOrderItemId(item.id, selectedOrder.order_number, idx);
                    const itemSku = item.sku || "N/A";

                    return (
                      <div key={item.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-blue-700 font-bold mb-0.5">
                            <span>{itemCode}</span>
                            <span className="text-slate-400">|</span>
                            <span className="text-slate-500 font-normal">SKU: {itemSku}</span>
                          </div>
                          <button
                            onClick={() =>
                              handleProductClick(item.id, {
                                orderItemCode: itemCode,
                                orderNumber: selectedOrder.order_number,
                                orderItemTitle: item.title,
                                orderItemPrice: item.unit_price,
                                quantity: item.quantity,
                                sku: itemSku,
                                productId: item.product_id,
                              })
                            }
                            className="font-bold text-slate-800 hover:text-blue-600 hover:underline text-left text-xs cursor-pointer transition-colors"
                            title="Click to view product details"
                          >
                            {item.title}
                          </button>
                          <span className="text-slate-500 block text-[11px] mt-0.5">
                            Qty: {item.quantity} × {formatCurrency(item.unit_price)}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900 text-sm">
                          {formatCurrency(item.line_total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Customer Message Post Area (If seller control active for custom updates) */}
              {["ORDERED", "CONFIRMED", "READY TO DISPATCH"].includes(selectedOrder.internal_status) ? (
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-2">
                    <label className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                      Post Customer-Facing Status Update / Note
                    </label>

                    {/* Modal Status Action Button */}
                    {selectedOrder.internal_status === "ORDERED" && (
                      <button
                        disabled={updatingStatusTo === "CONFIRMED"}
                        onClick={() => handleUpdateStatus(selectedOrder, "CONFIRMED")}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs self-start sm:self-auto"
                      >
                        {updatingStatusTo === "CONFIRMED" ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        Confirm Order
                      </button>
                    )}

                    {selectedOrder.internal_status === "CONFIRMED" && (
                      <button
                        disabled={updatingStatusTo === "READY TO DISPATCH"}
                        onClick={() => handleUpdateStatus(selectedOrder, "READY TO DISPATCH")}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs self-start sm:self-auto"
                      >
                        {updatingStatusTo === "READY TO DISPATCH" ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Truck className="w-3 h-3" />
                        )}
                        Mark Ready to Dispatch
                      </button>
                    )}

                    {selectedOrder.internal_status === "READY TO DISPATCH" && (
                      <span className="text-[11px] text-purple-800 font-semibold bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-200">
                        Status Locked: READY TO DISPATCH
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    This note will be visible directly in the customer&apos;s tracking activity timeline (e.g. &quot;Package checked and prepared for handover&quot;). It does not alter the order status.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Your order is being freshly prepared..."
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePostCustomNote(selectedOrder)}
                      isLoading={isPostingNote}
                      disabled={!customNote.trim()}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Post Note
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 italic text-xs font-medium">
                  Seller control completed — Admin / Logistics control active
                </div>
              )}

              {/* Timeline History */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Full Order Timeline History
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedOrder.timeline.length === 0 ? (
                    <div className="p-3 text-slate-400 border border-dashed rounded-lg text-center">
                      No custom events logged yet.
                    </div>
                  ) : (
                    selectedOrder.timeline.map((event) => (
                      <div key={event.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">{event.status}</span>
                          <span className="text-slate-400 text-[10px]">
                            {formatExactDateTime(event.created_at)} ({formatRelativeTime(event.created_at)})
                          </span>
                        </div>
                        {event.note && <p className="text-slate-600 text-xs italic">&quot;{event.note}&quot;</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Seller Product Details Drawer / Modal */}
      {isProductDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end items-end sm:items-stretch bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          {/* Overlay backdrop click to close */}
          <div
            className="absolute inset-0 -z-10"
            onClick={closeProductDrawer}
            aria-label="Close product drawer overlay"
          />

          {/* Drawer Container: Responsive Right-side drawer on desktop, bottom sheet on mobile */}
          <div className="bg-white w-full sm:max-w-md h-[90vh] sm:h-full border-t sm:border-t-0 sm:border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden rounded-t-2xl sm:rounded-none animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 relative z-10">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 flex-shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                  Seller Store Product
                </span>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg mt-1 line-clamp-1">
                  {productDetails?.product_name || productContext?.orderItemTitle || "Product Details"}
                </h3>
              </div>
              <button
                onClick={closeProductDrawer}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors ml-2"
                aria-label="Close Drawer"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isLoadingProductDetails ? (
                <div className="py-24 flex flex-col items-center justify-center space-y-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-xs font-semibold text-slate-500">Loading store listing details...</span>
                </div>
              ) : productFetchError ? (
                <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-3 bg-red-50/50 rounded-2xl border border-red-100">
                  <ShieldAlert className="w-10 h-10 text-red-500" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-red-900 text-sm">Product Not Available</h4>
                    <p className="text-xs text-red-600 max-w-xs">{productFetchError}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Historical Snapshot Warning if product listing is inactive/deleted */}
                  {productDetails?.product_exists === false && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-900">
                      <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div>
                        <span className="font-bold block">Live Product Listing Unavailable</span>
                        <span className="text-[11px] text-amber-800">
                          Showing historical purchase-time snapshot recorded for this order item.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Product Image Display */}
                  <div className="w-full h-52 bg-slate-100/80 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200 relative p-2">
                    {productDetails?.image_url ? (
                      <img
                        src={productDetails.image_url}
                        alt={productDetails?.product_name || "Product"}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center space-y-2 text-slate-400">
                        <Package className="w-12 h-12 stroke-[1.5]" />
                        <span className="text-[11px] font-medium">No product image available</span>
                      </div>
                    )}

                    <span
                      className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-xs border ${
                        productDetails?.is_active
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : "bg-slate-700 text-white border-slate-600"
                      }`}
                    >
                      {productDetails?.product_exists
                        ? productDetails?.is_active
                          ? "Active Listing"
                          : "Inactive"
                        : "Snapshot Only"}
                    </span>
                  </div>

                  {/* Pricing & Order Context Banner */}
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-500">Unit Purchase Price</span>
                      <span className="font-extrabold text-slate-900 text-lg">
                        {formatCurrency(productDetails?.unit_price ?? productContext?.orderItemPrice ?? 0)}
                      </span>
                    </div>
                  </div>

                  {/* Associated Order Item Context */}
                  <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-1 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                      Associated Order Context
                    </span>
                    <div className="flex items-center justify-between font-mono text-slate-800">
                      <span className="font-bold text-blue-900">
                        Order: {productDetails?.order_number || productContext?.orderNumber}
                      </span>
                      <span className="font-bold text-slate-700">
                        Item ID: {productDetails?.order_item_code || productContext?.orderItemCode}
                      </span>
                    </div>
                  </div>

                  {/* Product Specifications Grid */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Product & Store Inventory Specs
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* Full SKU with Copy Button */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1 col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px] font-medium">SKU</span>
                          {(productDetails?.sku || productContext?.sku) && (
                            <button
                              onClick={() =>
                                handleCopySku(productDetails?.sku || productContext?.sku || "")
                              }
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                              title="Copy complete SKU"
                            >
                              {copiedSku ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-blue-600" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-xs break-all block leading-tight">
                          {productDetails?.sku || productContext?.sku || "N/A"}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span className="text-slate-400 text-[11px] font-medium block">Category</span>
                        <span className="font-bold text-slate-800 truncate block">
                          {productDetails?.category_name || "General"}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span className="text-slate-400 text-[11px] font-medium block">Store Name</span>
                        <span className="font-bold text-blue-900 text-xs truncate block">
                          {productDetails?.store_name || "Seller Store"}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span className="text-slate-400 text-[11px] font-medium block">Ordered Quantity</span>
                        <span className="font-bold text-slate-900 text-xs block">
                          {productDetails?.ordered_quantity ?? productContext?.quantity ?? 1} units
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span className="text-slate-400 text-[11px] font-medium block">Current Stock</span>
                        <span className="font-bold text-emerald-700 text-xs block">
                          {productDetails?.product_exists
                            ? `${productDetails?.current_stock ?? "0"} units`
                            : "N/A (Historical)"}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span className="text-slate-400 text-[11px] font-medium block">Product Status</span>
                        <span className="font-bold text-slate-800 text-xs truncate block capitalize">
                          {productDetails?.status || "active"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Product ID Section with Full UUID and Copy Button */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">Product ID</span>
                      {(productDetails?.product_id || productContext?.productId) && (
                        <button
                          onClick={() =>
                            handleCopyProductId(
                              productDetails?.product_id || productContext?.productId || ""
                            )
                          }
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                          title="Copy full Product ID"
                        >
                          {copiedProductId ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700 font-bold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-blue-600" />
                              <span>Copy ID</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="font-mono font-bold text-slate-800 text-xs break-all leading-normal bg-white p-2.5 rounded-lg border border-slate-200 select-all">
                      {productDetails?.product_id || productContext?.productId || "N/A"}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end flex-shrink-0">
              <Button variant="outline" size="sm" onClick={closeProductDrawer} className="h-9 px-5 font-bold text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
