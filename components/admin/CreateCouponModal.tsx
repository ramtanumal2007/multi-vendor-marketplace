"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface CreateCouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateCouponModal({ isOpen, onClose, onSuccess }: CreateCouponModalProps) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [targetType, setTargetType] = useState<"all" | "seller" | "membership_plan" | "category" | "product">("all");
  const [selectedPlans, setSelectedPlans] = useState<string[]>(["BASIC", "PRO", "BUSINESS"]);
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isFirstOrderOnly, setIsFirstOrderOnly] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const [stackable, setStackable] = useState(false);
  const [maxTotalRedemptions, setMaxTotalRedemptions] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("1");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [isActive] = useState(true);

  const [sellersList, setSellersList] = useState<Array<{ id: string; business_name?: string; seller_id_code?: string }>>([]);
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string }>>([]);
  const [productsList, setProductsList] = useState<Array<{ id: string; title: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = createClient();

  useEffect(() => {
    if (!isOpen) return;
    async function loadDropdowns() {
      const { data: sellers } = await supabase.from("seller_profiles").select("id, business_name, seller_id_code").eq("verification_status", "approved");
      const { data: categories } = await supabase.from("categories").select("id, name");
      const { data: products } = await supabase.from("products").select("id, title");

      if (sellers) setSellersList(sellers);
      if (categories) setCategoriesList(categories);
      if (products) setProductsList(products);
    }
    loadDropdowns();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!code.trim()) {
      setErrorMsg("Coupon code is required.");
      return;
    }
    if (!value || parseFloat(value) <= 0) {
      setErrorMsg("Please provide a valid discount value.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        type,
        value: parseFloat(value),
        min_order_amount: parseFloat(minOrderAmount || "0"),
        target_type: targetType,
        target_sellers: targetType === "seller" ? selectedSellers : null,
        target_membership_plans: targetType === "membership_plan" ? selectedPlans : null,
        applicable_categories: targetType === "category" ? selectedCategories : null,
        applicable_products: targetType === "product" ? selectedProducts : null,
        is_first_order_only: isFirstOrderOnly,
        auto_apply: autoApply,
        stackable: stackable,
        max_total_redemptions: maxTotalRedemptions ? parseInt(maxTotalRedemptions) : null,
        usage_limit: maxTotalRedemptions ? parseInt(maxTotalRedemptions) : null,
        per_customer_limit: perCustomerLimit ? parseInt(perCustomerLimit) : 1,
        valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        valid_to: validTo ? new Date(validTo).toISOString() : null,
        is_active: isActive,
      };

      const { error } = await supabase.from("coupons").insert(payload);
      if (error) throw error;

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create coupon.";
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePlan = (p: string) => {
    setSelectedPlans((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Admin Coupon">
      <form onSubmit={handleSubmit} className="space-y-4 text-slate-800 text-sm max-h-[75vh] overflow-y-auto pr-1">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Coupon Code *</label>
            <input
              type="text"
              required
              placeholder="e.g. SUMMER50"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border rounded-lg uppercase font-mono text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Discount Type *</label>
            <select
              value={type}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setType(e.target.value as "percentage" | "fixed")}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="percentage">Percentage (%) Off</option>
              <option value="fixed">Fixed Amount Off</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Discount Value *</label>
            <input
              type="number"
              required
              step="0.01"
              placeholder={type === "percentage" ? "e.g. 20 for 20%" : "e.g. 15 for $15"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Min Order Amount ($)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={minOrderAmount}
              onChange={(e) => setMinOrderAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Target Scope */}
        <div className="border-t pt-3">
          <label className="block text-xs font-bold text-slate-700 mb-1">Coupon Target Scope</label>
          <select
            value={targetType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetType(e.target.value as "all" | "seller" | "membership_plan" | "category" | "product")}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="all">Entire Marketplace (All Orders)</option>
            <option value="seller">Specific Approved Sellers</option>
            <option value="membership_plan">Specific Membership Plans (BASIC, PRO, BUSINESS)</option>
            <option value="category">Specific Categories</option>
            <option value="product">Specific Products</option>
          </select>
        </div>

        {/* Membership Plans Targeting */}
        {targetType === "membership_plan" && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2">Select Target Plans:</label>
            <div className="flex gap-4">
              {["BASIC", "PRO", "BUSINESS"].map((plan) => (
                <label key={plan} className="flex items-center space-x-2 text-xs cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={selectedPlans.includes(plan)}
                    onChange={() => togglePlan(plan)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>{plan}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Specific Sellers Targeting */}
        {targetType === "seller" && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2">Select Target Sellers:</label>
            <select
              multiple
              value={selectedSellers}
              onChange={(e) => setSelectedSellers(Array.from(e.target.selectedOptions, (item) => item.value))}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white h-24"
            >
              {sellersList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.business_name || "Seller"} ({s.seller_id_code})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple sellers.</p>
          </div>
        )}

        {/* Specific Categories Targeting */}
        {targetType === "category" && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2">Select Target Categories:</label>
            <select
              multiple
              value={selectedCategories}
              onChange={(e) => setSelectedCategories(Array.from(e.target.selectedOptions, (item) => item.value))}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white h-24"
            >
              {categoriesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Specific Products Targeting */}
        {targetType === "product" && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2">Select Target Products:</label>
            <select
              multiple
              value={selectedProducts}
              onChange={(e) => setSelectedProducts(Array.from(e.target.selectedOptions, (item) => item.value))}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white h-24"
            >
              {productsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Redemption Limits & Rules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Max Total Redemptions</label>
            <input
              type="number"
              placeholder="Unlimited if empty"
              value={maxTotalRedemptions}
              onChange={(e) => setMaxTotalRedemptions(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Limit Per Customer</label>
            <input
              type="number"
              value={perCustomerLimit}
              onChange={(e) => setPerCustomerLimit(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t pt-3">
          <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              id="firstOrder"
              checked={isFirstOrderOnly}
              onChange={(e) => setIsFirstOrderOnly(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>First Order Only</span>
          </label>

          <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              id="autoApply"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Auto-Apply at Checkout</span>
          </label>

          <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              id="stackable"
              checked={stackable}
              onChange={(e) => setStackable(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Stackable with other discounts</span>
          </label>
        </div>

        {/* Valid Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Coupon
          </button>
        </div>
      </form>
    </Modal>
  );
}
