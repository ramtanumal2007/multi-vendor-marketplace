"use client";

import React, { useState, useEffect } from "react";
import { Search, Mail, ShieldAlert, Eye, Phone, Calendar, UserCheck, Package, ShoppingBag, X, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";

interface CustomerProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  order_count?: number;
  total_spent?: number;
}

interface CustomerOrder {
  id: string;
  order_number: string;
  total: number;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
}

export default function AdminCustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const supabase = createClient();

  const fetchCustomers = async () => {
    setIsLoading(true);

    // Fetch profiles
    const { data: profilesData, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && profilesData) {
      // Fetch order counts per user
      const { data: ordersData } = await supabase
        .from("orders")
        .select("user_id, total");

      const orderStatsMap = new Map<string, { count: number; spent: number }>();
      (ordersData || []).forEach((ord) => {
        if (ord.user_id) {
          const current = orderStatsMap.get(ord.user_id) || { count: 0, spent: 0 };
          orderStatsMap.set(ord.user_id, {
            count: current.count + 1,
            spent: current.spent + (Number(ord.total) || 0),
          });
        }
      });

      const enrichedProfiles: CustomerProfile[] = profilesData.map((p) => {
        const stats = orderStatsMap.get(p.id) || { count: 0, spent: 0 };
        return {
          ...p,
          order_count: stats.count,
          total_spent: stats.spent,
        };
      });

      setCustomers(enrichedProfiles);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openCustomerDetails = async (customer: CustomerProfile) => {
    setSelectedCustomer(customer);
    setLoadingOrders(true);
    setCustomerOrders([]);

    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_number, total, payment_status, fulfillment_status, created_at")
      .eq("user_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (orders) {
      setCustomerOrders(orders as CustomerOrder[]);
    }
    setLoadingOrders(false);
  };

  const filteredCustomers = customers.filter(c => 
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) || 
    (c.full_name && c.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.phone && c.phone.includes(searchTerm)) ||
    c.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
          <p className="text-sm text-slate-500 mt-1">View registered customer profiles, verification status, and order history.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCustomers} isLoading={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by name, email, phone or customer ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <span className="text-xs font-semibold text-slate-500">{filteredCustomers.length} Customers</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Customer Name & Email</th>
                <th className="px-6 py-3.5">Phone</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Orders</th>
                <th className="px-6 py-3.5">Registered On</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-3">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading customer profiles...
                  </td>
                </tr>
              ) : filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold overflow-hidden flex-shrink-0 text-sm">
                        {customer.avatar_url ? (
                          <img src={customer.avatar_url} alt={customer.full_name || 'User'} className="w-full h-full object-cover" />
                        ) : (
                          (customer.full_name || customer.email || "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{customer.full_name || "Guest Customer"}</div>
                        <div className="text-slate-500 text-xs truncate">{customer.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-xs">
                    {customer.phone || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                      customer.role === "admin" 
                        ? "bg-purple-100 text-purple-800 border border-purple-200" 
                        : customer.role === "seller"
                        ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}>
                      {customer.role === 'admin' && <ShieldAlert className="w-3 h-3 mr-1" />}
                      {customer.role || "customer"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700 text-xs">
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                      {customer.order_count || 0} orders
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {new Date(customer.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openCustomerDetails(customer)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-sm">No customers matched your search query.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedCustomer(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-6 relative overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Customer profile details"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg overflow-hidden flex-shrink-0">
                  {selectedCustomer.avatar_url ? (
                    <img src={selectedCustomer.avatar_url} alt={selectedCustomer.full_name || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    (selectedCustomer.full_name || selectedCustomer.email || "?").charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedCustomer.full_name || "Customer Profile"}</h2>
                  <p className="text-xs text-slate-500 font-mono">{selectedCustomer.email}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Info Cards */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 font-medium block">Phone / Mobile</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {selectedCustomer.phone || "Not provided"}
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 font-medium block">Registration Date</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(selectedCustomer.created_at).toLocaleString()}
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 font-medium block">Account Role & Status</span>
                <span className="font-bold uppercase text-blue-700 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  {selectedCustomer.role || "Customer"} (Active)
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 font-medium block">Total Orders Placed</span>
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                  {selectedCustomer.order_count || 0} orders (₹{selectedCustomer.total_spent?.toLocaleString() || 0})
                </span>
              </div>
            </div>

            {/* Unique Customer ID */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Customer ID:</span>
              <code className="font-mono text-slate-800 text-[11px] font-bold">{selectedCustomer.id}</code>
            </div>

            {/* Recent Orders List */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-blue-600" /> Recent Customer Orders
              </h3>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {loadingOrders ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-medium">Loading orders...</div>
                ) : customerOrders.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    No orders placed by this customer yet.
                  </div>
                ) : (
                  customerOrders.map((ord) => (
                    <div key={ord.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900">#{ord.order_number}</span>
                        <span className="text-slate-400 text-[10px] block mt-0.5">
                          {new Date(ord.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          ord.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {ord.payment_status}
                        </span>
                        <span className="font-bold text-slate-900">₹{Number(ord.total).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <a
                href={`mailto:${selectedCustomer.email}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                <Mail className="w-4 h-4" /> Send Direct Email
              </a>

              <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
