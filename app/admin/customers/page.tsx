"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import {
  Search,
  Mail,
  ShieldAlert,
  Eye,
  Phone,
  Calendar,
  UserCheck,
  Package,
  ShoppingBag,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Filter,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime, formatRelativeTime, formatSequentialCustomerId } from "@/lib/utils";
import { CustomerDetailsModal } from "@/components/admin/CustomerDetailsModal";
import { SellerDetailsModal } from "@/components/admin/SellerDetailsModal";

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
  order_count?: number;
  total_spent?: number;
  last_order_at?: string | null;
  is_verified?: boolean;
}

export default function AdminCustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal navigation states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchCustomers = async () => {
    setIsLoading(true);

    try {
      // 1. Fetch strictly customer profiles only (exclude sellers & admins)
      const { data: profilesData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "customer")
        .order("created_at", { ascending: false });

      if (!error && profilesData) {
        // 2. Fetch aggregate order stats per user
        const { data: ordersData } = await supabase
          .from("orders")
          .select("user_id, total, created_at")
          .order("created_at", { ascending: false });

        const orderStatsMap = new Map<
          string,
          { count: number; spent: number; last_order_at: string | null }
        >();

        (ordersData || []).forEach((ord) => {
          if (ord.user_id) {
            const current = orderStatsMap.get(ord.user_id) || {
              count: 0,
              spent: 0,
              last_order_at: null,
            };

            orderStatsMap.set(ord.user_id, {
              count: current.count + 1,
              spent: current.spent + (Number(ord.total) || 0),
              last_order_at: current.last_order_at || ord.created_at,
            });
          }
        });

        const enrichedProfiles: CustomerProfile[] = profilesData.map((p) => {
          const stats = orderStatsMap.get(p.id) || { count: 0, spent: 0, last_order_at: null };
          return {
            ...p,
            order_count: stats.count,
            total_spent: stats.spent,
            last_order_at: stats.last_order_at,
            is_verified: true, // Email confirmed status placeholder for auth profiles
          };
        });

        setCustomers(enrichedProfiles);
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Filter customers by search term and status
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.full_name && c.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.customer_id_code && c.customer_id_code.toLowerCase().includes(searchTerm.toLowerCase()));

    const cStatus = c.status || "active";
    let matchesStatus = true;
    if (statusFilter === "active") matchesStatus = cStatus === "active";
    if (statusFilter === "suspended") matchesStatus = cStatus === "suspended" || cStatus === "inactive";
    if (statusFilter === "verified") matchesStatus = c.is_verified === true;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            View registered customer profiles, verification status, and order history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCustomers} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone or customer ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
                <option value="verified">Verified Only</option>
              </select>
            </div>

            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              {filteredCustomers.length} Customers
            </span>
          </div>
        </div>

        {/* Customer Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left min-w-[900px]">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Customer & ID</th>
                <th className="px-6 py-3.5">Contact Details</th>
                <th className="px-6 py-3.5">Status & Role</th>
                <th className="px-6 py-3.5">Total Orders</th>
                <th className="px-6 py-3.5">Total Spent</th>
                <th className="px-6 py-3.5">Last Order / Registered</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-3">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading customer profiles...
                  </td>
                </tr>
              ) : filteredCustomers.map((customer, index) => {
                const cStatus = customer.status || "active";

                return (
                  <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold overflow-hidden flex-shrink-0 text-sm">
                          {customer.avatar_url ? (
                            <img
                              src={customer.avatar_url}
                              alt={customer.full_name || "User"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (customer.full_name || customer.email || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">
                            {customer.full_name || "Guest Customer"}
                          </div>
                          <div className="font-mono text-[10px] font-semibold text-blue-600 truncate">
                            ID: {formatSequentialCustomerId(index, customer.customer_id_code)}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs">
                      <div className="font-medium text-slate-800">{customer.email}</div>
                      <div className="text-slate-500">{customer.phone || "No phone"}</div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            cStatus === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {cStatus}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {customer.role || "customer"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700 text-xs">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        {customer.order_count || 0} orders
                      </span>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-900 text-xs">
                      {formatCurrency(customer.total_spent || 0)}
                    </td>

                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {customer.last_order_at ? (
                        <div>
                          <div className="font-semibold text-slate-800">
                            {formatExactDateTime(customer.last_order_at)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {formatRelativeTime(customer.last_order_at)}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-slate-600">No orders</div>
                          <div className="text-[10px] text-slate-400">
                            Reg: {formatExactDateTime(customer.created_at)}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedCustomerId(customer.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Details
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredCustomers.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500 text-sm">
                    No customers matched your search query or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerId && (
        <CustomerDetailsModal
          customerId={selectedCustomerId}
          isOpen={!!selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onSelectSeller={(sellerId) => {
            setSelectedCustomerId(null);
            setSelectedSellerId(sellerId);
          }}
        />
      )}

      {/* Seller Details Modal (Opened from customer order history) */}
      {selectedSellerId && (
        <SellerDetailsModal
          sellerId={selectedSellerId}
          isOpen={!!selectedSellerId}
          onClose={() => setSelectedSellerId(null)}
          onSelectCustomer={(custUserId) => {
            setSelectedSellerId(null);
            setSelectedCustomerId(custUserId);
          }}
        />
      )}
    </div>
  );
}
