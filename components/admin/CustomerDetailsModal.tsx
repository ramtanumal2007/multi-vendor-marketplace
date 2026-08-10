"use client";

import React, { useState, useEffect } from "react";
import { X, Mail, Phone, Calendar, UserCheck, Package, ShoppingBag, Store, ExternalLink, ShieldAlert, Edit2, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatExactDateTime, formatRelativeTime, formatSequentialCustomerId, normalizeInternalStatus } from "@/lib/utils";
import Link from "next/link";

interface CustomerDetailsModalProps {
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSeller?: (sellerId: string) => void;
  onSelectOrder?: (orderId: string) => void;
}

interface CustomerProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  status?: string;
  created_at: string;
  customer_id_code?: string;
}

interface EnrichedOrder {
  id: string;
  order_number: string;
  total: number;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
  store_name?: string;
  seller_id?: string;
  items_summary?: string;
}

export function CustomerDetailsModal({
  customerId,
  isOpen,
  onClose,
  onSelectSeller,
  onSelectOrder,
}: CustomerDetailsModalProps) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen && customerId) {
      fetchCustomerData(customerId);
    } else {
      setProfile(null);
      setOrders([]);
      setIsEditing(false);
    }
  }, [isOpen, customerId]);

  const fetchCustomerData = async (id: string) => {
    setIsLoading(true);

    try {
      // 1. Fetch Customer Profile
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (profileErr) throw profileErr;
      setProfile(profileData);
      setEditFullName(profileData.full_name || "");
      setEditPhone(profileData.phone || "");
      setEditStatus(profileData.status || "active");

      // 2. Fetch Customer Orders
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("id, order_number, total, payment_status, fulfillment_status, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false });

      if (ordersErr) throw ordersErr;

      // Enrich orders with seller store info & item titles
      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map((o: any) => o.id);
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, title, quantity, store_id, stores(id, name, seller_id)")
          .in("order_id", orderIds);

        const orderStoreMap = new Map<string, { store_name: string; seller_id: string; summary: string }>();

        (itemsData || []).forEach((item: any) => {
          const store = Array.isArray(item.stores) ? item.stores[0] : item.stores;
          const current = orderStoreMap.get(item.order_id) || {
            store_name: store?.name || "Multiple / Store",
            seller_id: store?.seller_id || "",
            summary: "",
          };

          const itemDesc = `${item.title} (${item.quantity}x)`;
          const newSummary = current.summary ? `${current.summary}, ${itemDesc}` : itemDesc;

          orderStoreMap.set(item.order_id, {
            store_name: store?.name || current.store_name,
            seller_id: store?.seller_id || current.seller_id,
            summary: newSummary,
          });
        });

        const enriched: EnrichedOrder[] = ordersData.map((ord: any) => {
          const info = orderStoreMap.get(ord.id);
          return {
            ...ord,
            store_name: info?.store_name || "N/A",
            seller_id: info?.seller_id || "",
            items_summary: info?.summary || "Items details",
          };
        });

        setOrders(enriched);
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to load customer profile.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editFullName.trim() || null,
          phone: editPhone.trim() || null,
          status: editStatus,
        })
        .eq("id", profile.id);

      if (error) throw error;

      setProfile({
        ...profile,
        full_name: editFullName.trim() || null,
        phone: editPhone.trim() || null,
        status: editStatus,
      });

      setIsEditing(false);
      addToast({
        title: "Saved",
        description: "Customer profile updated successfully.",
        type: "success",
      });
    } catch (err: any) {
      addToast({
        title: "Update Failed",
        description: err.message || "Could not update customer.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Aggregate order metrics
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const pendingOrders = orders.filter((o) =>
    ["pending", "processing", "ORDERED", "CONFIRMED", "READY TO DISPATCH"].includes(o.fulfillment_status)
  ).length;
  const deliveredOrders = orders.filter(
    (o) => o.fulfillment_status === "delivered" || o.fulfillment_status === "DELIVERED"
  ).length;
  const cancelledOrders = orders.filter(
    (o) => o.fulfillment_status === "cancelled" || o.fulfillment_status === "CANCELLED"
  ).length;
  const lastOrderDate = orders[0]?.created_at;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-6 relative overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Customer Profile Details"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg overflow-hidden flex-shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  className="w-full h-full object-cover"
                />
              ) : (
                (profile?.full_name || profile?.email || "?").charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {profile?.full_name || "Customer Profile"}
                </h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    (profile?.status || "active") === "active"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {profile?.status || "active"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">{profile?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Profile
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading customer details...
            </div>
          ) : profile ? (
            <>
              {/* Admin Edit Form */}
              {isEditing && (
                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                    Edit Customer Profile
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Account Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveProfile}
                      isLoading={isSaving}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Save Changes
                    </Button>
                  </div>
                </div>
              )}

              {/* Profile Info Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-medium block">Phone / Mobile</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {profile.phone || "Not provided"}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-medium block">Registration Date</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {formatExactDateTime(profile.created_at)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-medium block">Account Role</span>
                  <span className="font-bold uppercase text-blue-700 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    {profile.role || "Customer"}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-medium block">Customer ID</span>
                  <code className="font-mono text-[11px] font-bold text-blue-700 block truncate">
                    {formatSequentialCustomerId(0, profile.customer_id_code)}
                  </code>
                </div>
              </div>

              {/* Order Summary Cards */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" /> Order Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Total Spent</div>
                    <div className="font-bold text-emerald-700 text-sm mt-0.5">
                      {formatCurrency(totalSpent)}
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Total Orders</div>
                    <div className="font-bold text-blue-700 text-sm mt-0.5">{totalOrders}</div>
                  </div>
                  <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Pending</div>
                    <div className="font-bold text-amber-700 text-sm mt-0.5">{pendingOrders}</div>
                  </div>
                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Delivered</div>
                    <div className="font-bold text-emerald-700 text-sm mt-0.5">
                      {deliveredOrders}
                    </div>
                  </div>
                  <div className="p-3 bg-red-50/60 border border-red-100 rounded-xl text-center">
                    <div className="text-slate-500 font-medium">Cancelled</div>
                    <div className="font-bold text-red-700 text-sm mt-0.5">{cancelledOrders}</div>
                  </div>
                </div>

                {lastOrderDate && (
                  <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between px-1">
                    <span>Last Order: {formatExactDateTime(lastOrderDate)}</span>
                    <span className="font-medium text-slate-700">
                      ({formatRelativeTime(lastOrderDate)})
                    </span>
                  </div>
                )}
              </div>

              {/* Order History */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" /> Customer Order History ({orders.length})
                </h3>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {orders.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No orders placed by this customer yet.
                    </div>
                  ) : (
                    orders.map((ord) => {
                      const normStatus = normalizeInternalStatus(ord.fulfillment_status);

                      return (
                        <div
                          key={ord.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:bg-slate-100/80 transition-colors"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">#{ord.order_number}</span>
                              <span className="text-slate-400 text-[11px]">
                                • {formatExactDateTime(ord.created_at)}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                ({formatRelativeTime(ord.created_at)})
                              </span>
                            </div>

                            <div className="text-slate-600 text-[11px] truncate">
                              {ord.items_summary}
                            </div>

                            {/* Seller / Store Link */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <Store className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-500 font-medium">Seller:</span>
                              {ord.seller_id ? (
                                <button
                                  onClick={() => onSelectSeller && onSelectSeller(ord.seller_id!)}
                                  className="font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                >
                                  {ord.store_name}
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              ) : (
                                <span className="font-semibold text-slate-700">
                                  {ord.store_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    ord.payment_status === "paid"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {ord.payment_status}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    normStatus === "DELIVERED"
                                      ? "bg-green-100 text-green-800"
                                      : normStatus === "CANCELLED"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-blue-100 text-blue-800"
                                  }`}
                                >
                                  {normStatus}
                                </span>
                              </div>
                              <span className="font-bold text-slate-900 text-sm">
                                {formatCurrency(Number(ord.total))}
                              </span>
                            </div>

                            <Link href={`/admin/orders/${ord.id}`}>
                              <Button variant="outline" size="sm">
                                View Order
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">Customer profile not found.</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100 flex-shrink-0">
          {profile?.email ? (
            <a
              href={`mailto:${profile.email}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <Mail className="w-4 h-4" /> Send Email
            </a>
          ) : (
            <div />
          )}

          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
