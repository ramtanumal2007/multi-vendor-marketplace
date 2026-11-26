"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ImageUploader, UploadedImageItem } from "@/components/ui/ImageUploader";
import { generateMarketplaceSKU, getSKUPreview, normalizeSKU, checkSKUExists } from "@/lib/skuGenerator";
import { CategoryCombobox } from "@/components/seller/CategoryCombobox";
import { Loader2, Info, AlertTriangle, ShieldCheck, Zap } from "lucide-react";

export interface FeeRule {
  membership_plan: string;
  commission_rate: number;
  gst_rate: number;
  tcs_rate: number;
  tds_rate: number;
  min_payout_amount: number;
  escrow_hold_days: number;
}

export interface SellerProfileInfo {
  membership_plan?: string | null;
  membership_status?: string | null;
  membership_expires_at?: string | null;
}

export interface ProductFormProps {
  storeId: string;
  categories: Array<{ id: string; name: string }>;
  sellerProfile?: SellerProfileInfo | null;
  feeRules?: FeeRule[];
}

export default function ProductForm({
  storeId,
  categories,
  sellerProfile,
  feeRules = [],
}: ProductFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImageItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [regularPriceInput, setRegularPriceInput] = useState<string>("");
  const [salePriceInput, setSalePriceInput] = useState<string>("");
  const [stockQuantityInput, setStockQuantityInput] = useState<string>("0");
  const [status, setStatus] = useState<"pending_review" | "draft">("pending_review");

  const router = useRouter();
  const supabase = createClient();

  // Authoritative Membership & Fee Rule Resolution
  const rawPlan = (sellerProfile?.membership_plan || "BASIC").toUpperCase();
  const isExpired = sellerProfile?.membership_expires_at
    ? new Date(sellerProfile.membership_expires_at) < new Date()
    : false;
  const isStatusActive = (sellerProfile?.membership_status || "active").toLowerCase() === "active";
  const isActive = isStatusActive && !isExpired;

  // Fallback to BASIC per backend rules if membership is expired or inactive
  const effectivePlan = isActive ? rawPlan : "BASIC";
  const activeFeeRule = feeRules.find((r) => r.membership_plan === effectivePlan) || {
    membership_plan: effectivePlan,
    commission_rate: effectivePlan === "BUSINESS" ? 0.05 : effectivePlan === "PRO" ? 0.08 : 0.12,
    gst_rate: 0.18,
    tcs_rate: 0.005,
    tds_rate: 0.001,
    min_payout_amount: 1000,
    escrow_hold_days: 7,
  };

  // Real-time Earnings Calculation
  const regularPriceNum = parseFloat(regularPriceInput) || 0;
  const salePriceNum = parseFloat(salePriceInput) || 0;
  const stockQuantityNum = parseInt(stockQuantityInput, 10) || 0;

  const hasValidSalePrice = salePriceNum > 0 && salePriceNum < regularPriceNum;
  // According to marketplace rules, the customer pays the sale price if applicable
  const customerPayingPrice = hasValidSalePrice ? salePriceNum : regularPriceNum;

  const commissionRatePercent = (Number(activeFeeRule.commission_rate) * 100).toFixed(1);
  const commissionAmount = customerPayingPrice * Number(activeFeeRule.commission_rate);
  const gstOnCommission = commissionAmount * Number(activeFeeRule.gst_rate);
  const tcsAmount = customerPayingPrice * Number(activeFeeRule.tcs_rate);
  const tdsAmount = customerPayingPrice * Number(activeFeeRule.tds_rate);
  const totalPlatformDeductions = commissionAmount + gstOnCommission + tcsAmount + tdsAmount;
  const estimatedEarningsPerUnit = Math.max(0, customerPayingPrice - totalPlatformDeductions);
  const totalEstimatedEarnings = estimatedEarningsPerUnit * Math.max(0, stockQuantityNum);

  const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const title = (formData.get("title") as string || "").trim();

      // Check membership product limit
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: sellerProf } = await supabase
          .from("seller_profiles")
          .select("membership_plan")
          .eq("id", user.id)
          .single();
        const plan = sellerProf?.membership_plan || "BASIC";
        if (plan === "BASIC") {
          const { count } = await supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("store_id", storeId);
          if (count && count >= 10) {
            setError("Product limit reached (10/10) for your BASIC membership plan. Upgrade to PRO to add more products.");
            setLoading(false);
            return;
          }
        }
      }

      const description = (formData.get("description") as string || "").trim();
      const categoryId = selectedCategoryId || (formData.get("category_id") as string);
      const priceStr = formData.get("price") as string;
      const salePriceStr = (formData.get("sale_price") as string || "").trim();
      const skuStr = (formData.get("sku") as string || "").trim();
      const stockStr = formData.get("stock_quantity") as string;
      const rawStatus = (formData.get("status") as string || status || "").trim();
      // Enforce: only 'draft' if explicitly chosen, otherwise strictly 'pending_review'
      const finalStatus = rawStatus === "draft" ? "draft" : "pending_review";

      if (!title) {
        setError("Product title is required.");
        setLoading(false);
        return;
      }

      if (!categoryId) {
        setError("Please select a category.");
        setLoading(false);
        return;
      }

      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) {
        setError("Regular price must be greater than ₹0.");
        setLoading(false);
        return;
      }

      let salePrice: number | null = null;
      if (salePriceStr !== "") {
        salePrice = parseFloat(salePriceStr);
        if (isNaN(salePrice) || salePrice <= 0 || salePrice >= price) {
          setError("Sale price must be greater than ₹0 and strictly lower than the regular price.");
          setLoading(false);
          return;
        }
      }

      const stockQuantity = parseInt(stockStr, 10);
      if (isNaN(stockQuantity) || stockQuantity < 0) {
        setError("Stock quantity cannot be negative.");
        setLoading(false);
        return;
      }

      let finalSku = normalizeSKU(skuStr);
      if (finalSku) {
        const exists = await checkSKUExists(supabase, finalSku);
        if (exists) {
          setError(`SKU '${finalSku}' is already in use by another product.`);
          setLoading(false);
          return;
        }
      } else {
        const categoryObj = categories.find((c) => c.id === categoryId);
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 5) {
          finalSku = generateMarketplaceSKU({
            categoryName: categoryObj?.name,
          });
          const exists = await checkSKUExists(supabase, finalSku);
          if (!exists) {
            isUnique = true;
          }
          attempts++;
        }
      }

      const baseSlug = generateSlug(title);
      const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

      const data = {
        store_id: storeId,
        title,
        slug,
        description: description || null,
        category_id: categoryId,
        price,
        sale_price: salePrice,
        stock_quantity: stockQuantity,
        sku: finalSku,
        status: finalStatus, // strictly 'pending_review' or 'draft'
      };

      const { data: insertedProduct, error: insertError } = await supabase
        .from("products")
        .insert(data)
        .select()
        .single();

      if (insertError) throw insertError;

      if (insertedProduct && images.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || "unknown";

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          let finalUrl = img.url;

          if (img.file) {
            const filePath = `seller/${userId}/${insertedProduct.id}/${Date.now()}_${i}.webp`;
            const { error: uploadErr } = await supabase.storage
              .from("product-images")
              .upload(filePath, img.file, { contentType: "image/webp", upsert: true });

            if (uploadErr) {
              console.warn("Storage upload notice:", uploadErr.message);
            } else {
              const { data: pubData } = supabase.storage.from("product-images").getPublicUrl(filePath);
              if (pubData?.publicUrl) {
                finalUrl = pubData.publicUrl;
              }
            }
          }

          await supabase.from("product_images").insert({
            product_id: insertedProduct.id,
            image_url: finalUrl,
            sort_order: i,
          });
        }
      }

      router.refresh();
      router.push(`/seller/products`);
    } catch (err: unknown) {
      console.error(err);
      setError((err as Error).message || "An error occurred while saving the product.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-red-50 text-red-600 border border-red-200 p-3.5 rounded-xl text-sm font-medium flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Product Title *</label>
        <input
          type="text"
          name="title"
          id="title"
          required
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          placeholder="e.g. Premium Cotton Shirt"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          name="description"
          id="description"
          rows={4}
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
        />
      </div>

      {/* Multi-Image Uploader */}
      <div>
        <ImageUploader
          images={images}
          onChange={setImages}
          disabled={loading}
        />
      </div>

      {/* Price Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">Regular Price (₹) *</label>
          <input
            type="number"
            name="price"
            id="price"
            min="0.01"
            step="0.01"
            required
            value={regularPriceInput}
            onChange={(e) => setRegularPriceInput(e.target.value)}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="999.00"
          />
        </div>

        <div>
          <label htmlFor="sale_price" className="block text-sm font-medium text-gray-700">Sale Price (₹) (Optional)</label>
          <input
            type="number"
            name="sale_price"
            id="sale_price"
            min="0.01"
            step="0.01"
            value={salePriceInput}
            onChange={(e) => setSalePriceInput(e.target.value)}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="799.00"
          />
          <span className="text-xs text-gray-500 mt-1 block">Must be lower than Regular Price</span>
        </div>
      </div>

      {/* Searchable Category Combobox & SKU */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-1">
            Category *
          </label>
          <CategoryCombobox
            categories={categories}
            value={selectedCategoryId}
            onChange={(id) => {
              setSelectedCategoryId(id);
              if (error && error.includes("category")) setError(null);
            }}
            required
            placeholder="Search or select a category..."
          />
          {categories.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No categories available in database.</p>
          )}
        </div>

        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
            SKU (Auto-generated if blank)
          </label>
          <input
            type="text"
            name="sku"
            id="sku"
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border font-mono uppercase"
            placeholder={getSKUPreview({ categoryName: selectedCategoryObj?.name })}
          />
        </div>
      </div>

      {/* Stock & Initial Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="stock_quantity" className="block text-sm font-medium text-gray-700">Initial Stock</label>
          <input
            type="number"
            name="stock_quantity"
            id="stock_quantity"
            min="0"
            required
            value={stockQuantityInput}
            onChange={(e) => setStockQuantityInput(e.target.value)}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Initial Status</label>
          <select
            name="status"
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "pending_review" | "draft")}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white"
          >
            <option value="pending_review">Submit for Review</option>
            <option value="draft">Save as Draft</option>
          </select>
          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
            Your product will be submitted for Admin review. It will become visible on the storefront only after approval.
          </p>
        </div>
      </div>

      {/* PART 3: Live Read-Only Membership & Earnings Estimate */}
      <div className="mt-6 p-5 rounded-2xl bg-slate-50 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Membership & Earnings Estimate</h3>
              <p className="text-xs text-slate-500">Live projection based on your verified membership tier</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
              {rawPlan} Plan
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {isActive ? "Active" : isExpired ? "Expired" : "Inactive"}
            </span>
          </div>
        </div>

        {/* Expired / Inactive Warning Banner */}
        {!isActive && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <p>
              Your <strong>{rawPlan}</strong> membership is {isExpired ? "expired" : "inactive"}. Basic plan commission rates (12%) will apply to orders until renewed.
            </p>
          </div>
        )}

        {/* Real-time Financial Breakdown */}
        {customerPayingPrice > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200/60 shadow-xs">
              <div>
                <span className="block text-[11px] font-medium text-slate-500">Customer Price</span>
                <span className="text-sm font-bold text-slate-900">
                  ₹{customerPayingPrice.toFixed(2)}
                </span>
                {hasValidSalePrice && (
                  <span className="text-[10px] text-emerald-600 block">Sale Price applied</span>
                )}
              </div>

              <div>
                <span className="block text-[11px] font-medium text-slate-500">
                  Platform Commission ({commissionRatePercent}%)
                </span>
                <span className="text-sm font-bold text-blue-600">
                  -₹{commissionAmount.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400 block">+ ₹{gstOnCommission.toFixed(2)} GST (18%)</span>
              </div>

              <div>
                <span className="block text-[11px] font-medium text-slate-500">Statutory Deductions</span>
                <span className="text-sm font-bold text-slate-700">
                  -₹{(tcsAmount + tdsAmount).toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400 block">TCS (0.5%) + TDS (0.1%)</span>
              </div>

              <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                <span className="block text-[11px] font-semibold text-emerald-800">Est. Payout / Unit</span>
                <span className="text-base font-black text-emerald-700">
                  ₹{estimatedEarningsPerUnit.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Total Earnings for initial stock */}
            {stockQuantityNum > 1 && (
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs text-slate-700">
                <span className="font-medium">
                  Estimated Total for {stockQuantityNum} Units in Initial Stock:
                </span>
                <span className="font-extrabold text-sm text-slate-900">
                  ₹{totalEstimatedEarnings.toFixed(2)}
                </span>
              </div>
            )}

            {/* Bank Settlement Transparency Notice */}
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <p>
                Estimated per-unit seller payout based on your active {effectivePlan} plan. Final settlement may vary depending on actual order-level discounts, customer coupons, shipping, applicable taxes, returns/refunds, and payment gateway reconciliation.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-1">
            Enter a Regular Price or Sale Price above to calculate your estimated platform commission and seller earnings.
          </p>
        )}
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center py-2.5 px-6 border border-transparent shadow-sm text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
              <span>{status === "draft" ? "Saving draft..." : "Submitting for review..."}</span>
            </>
          ) : (
            <span>{status === "draft" ? "Save as Draft" : "Submit for Review"}</span>
          )}
        </button>
      </div>
    </form>
  );
}



