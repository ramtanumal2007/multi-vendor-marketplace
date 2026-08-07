"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, Trash2, Tag, Layers, User, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { CreateCouponModal } from "@/components/admin/CreateCouponModal";

export default function AdminCouponsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [coupons, setCoupons] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const supabase = createClient();

  const fetchCoupons = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCoupons(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this coupon?")) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (!error) {
      fetchCoupons();
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("coupons")
      .update({ is_active: !currentStatus })
      .eq("id", id);

    if (!error) {
      fetchCoupons();
    }
  };

  const filteredCoupons = coupons.filter(
    (c) =>
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.target_type && c.target_type.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getTargetBadge = (targetType: string, plans: string[]) => {
    switch (targetType) {
      case "seller":
        return <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded font-medium">Selected Sellers</span>;
      case "membership_plan":
        return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-medium">Plans ({plans?.join(", ") || "ALL"})</span>;
      case "category":
        return <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-medium">Specific Categories</span>;
      case "product":
        return <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-medium">Specific Products</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded font-medium">Entire Marketplace</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Coupon Management</h1>
          <p className="text-sm text-slate-500 mt-1">Create discount codes targeting marketplace tiers, categories, sellers, and products.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} variant="primary" className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Coupon
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search coupons by code or target scope..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={fetchCoupons}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh List"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Discount</th>
                <th className="px-6 py-3">Target Scope</th>
                <th className="px-6 py-3">Redemptions</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-4">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading coupons...
                  </td>
                </tr>
              ) : filteredCoupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 font-bold text-slate-900 font-mono flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-600" />
                    {coupon.code}
                    {coupon.is_first_order_only && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 font-sans border border-blue-200 px-1.5 py-0.5 rounded">
                        1st Order
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-800 font-semibold">
                    {coupon.type === "percentage" ? `${coupon.value}% OFF` : formatCurrency(coupon.value)}
                  </td>
                  <td className="px-6 py-4">
                    {getTargetBadge(coupon.target_type || "all", coupon.target_membership_plans)}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {coupon.times_used || 0} / {coupon.max_total_redemptions || coupon.usage_limit || "∞"}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleActive(coupon.id, coupon.is_active)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                        coupon.is_active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {coupon.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(coupon.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete Coupon"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredCoupons.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-700">No coupons found</p>
                    <p className="text-xs text-slate-400 mt-1">Create your first database-driven coupon code.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateCouponModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchCoupons}
      />
    </div>
  );
}
