"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Package,
  Search,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

interface InventoryProductItem {
  id: string;
  title: string;
  sku?: string | null;
  price: number;
  sale_price?: number | null;
  stock_quantity: number;
  status: string;
  updated_at?: string;
  created_at?: string;
  product_images?: Array<{ image_url: string }>;
  categories?: { name: string } | null;
}

export default function SellerInventoryPage() {
  const [products, setProducts] = useState<InventoryProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [sortBy, setSortBy] = useState<"stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "name">("stock_asc");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [customStockInputs, setCustomStockInputs] = useState<Record<string, number>>({});

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchInventory = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("seller_id", user.id)
        .maybeSingle();

      if (!store?.id) {
        setProducts([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .select("id, title, sku, price, sale_price, stock_quantity, status, updated_at, created_at, product_images(image_url), categories(name)")
        .eq("store_id", store.id)
        .order("stock_quantity", { ascending: true });

      if (error) throw error;

      interface RawInventoryProduct {
        id: string;
        title: string;
        sku?: string | null;
        price: number;
        sale_price?: number | null;
        stock_quantity?: number | null;
        status: string;
        updated_at?: string;
        created_at?: string;
        product_images?: Array<{ image_url: string }>;
        categories?: { name: string } | { name: string }[] | null;
      }

      const parsed: InventoryProductItem[] = ((data || []) as RawInventoryProduct[]).map((p) => {
        const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
        return {
          id: p.id,
          title: p.title,
          sku: p.sku || "N/A",
          price: Number(p.price || 0),
          sale_price: p.sale_price !== null && p.sale_price !== undefined ? Number(p.sale_price) : null,
          stock_quantity: p.stock_quantity ?? 0,
          status: p.status || "active",
          updated_at: p.updated_at || p.created_at,
          created_at: p.created_at,
          product_images: p.product_images || [],
          categories: cat ? { name: cat.name } : null,
        };
      });

      setProducts(parsed);
      const initialInputs: Record<string, number> = {};
      parsed.forEach((p) => {
        initialInputs[p.id] = p.stock_quantity;
      });
      setCustomStockInputs(initialInputs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load inventory";
      addToast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, addToast]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Safe Stock Update Caller
  const handleUpdateStock = async (productId: string, newStock: number) => {
    if (newStock < 0) return;
    setUpdatingId(productId);

    try {
      const res = await fetch("/api/seller/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, newStock }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update stock");
      }

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stock_quantity: json.newStock, updated_at: json.updated_at } : p))
      );
      setCustomStockInputs((prev) => ({ ...prev, [productId]: json.newStock }));

      addToast({
        title: "Inventory Updated",
        description: `Stock level updated to ${json.newStock} units.`,
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Stock update failed.";
      addToast({ title: "Update Error", description: msg, type: "error" });
    } finally {
      setUpdatingId(null);
    }
  };

  // Quick Step (+1 / -1)
  const handleStepStock = (product: InventoryProductItem, delta: number) => {
    const current = product.stock_quantity;
    const target = Math.max(0, current + delta);
    if (target === current) return;
    handleUpdateStock(product.id, target);
  };

  // Counts for low stock and out of stock
  const outOfStockItems = useMemo(() => products.filter((p) => p.stock_quantity === 0), [products]);
  const lowStockItems = useMemo(() => products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 5), [products]);
  const healthyItems = useMemo(() => products.filter((p) => p.stock_quantity > 5), [products]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Search
        const matchesSearch =
          searchTerm.trim() === "" ||
          p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));

        // Filter Mode
        if (!matchesSearch) return false;
        if (filterMode === "out_of_stock") return p.stock_quantity === 0;
        if (filterMode === "low_stock") return p.stock_quantity > 0 && p.stock_quantity <= 5;
        if (filterMode === "in_stock") return p.stock_quantity > 5;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "stock_asc") return a.stock_quantity - b.stock_quantity;
        if (sortBy === "stock_desc") return b.stock_quantity - a.stock_quantity;
        if (sortBy === "price_asc") return a.price - b.price;
        if (sortBy === "price_desc") return b.price - a.price;
        if (sortBy === "name") return a.title.localeCompare(b.title);
        return 0;
      });
  }, [products, searchTerm, filterMode, sortBy]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor real-time warehouse stock levels, replenish units, and prevent stockouts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchInventory}
            disabled={isLoading}
            className="text-xs h-9 font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Link href="/seller/products/new">
            <Button variant="primary" size="sm" className="text-xs h-9 font-bold bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Low Stock & Out of Stock KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Out of Stock Alert Card */}
        <div
          onClick={() => setFilterMode("out_of_stock")}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            filterMode === "out_of_stock"
              ? "bg-red-50 border-red-400 ring-2 ring-red-400/20"
              : "bg-white border-slate-200 hover:border-red-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" /> Out of Stock
            </span>
            <span className="text-2xl font-black text-red-700">{outOfStockItems.length}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Items unavailable for customer purchase. Immediate restock needed.
          </p>
        </div>

        {/* Low Stock Alert Card */}
        <div
          onClick={() => setFilterMode("low_stock")}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            filterMode === "low_stock"
              ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400/20"
              : "bg-white border-slate-200 hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Low Stock Warning
            </span>
            <span className="text-2xl font-black text-amber-700">{lowStockItems.length}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            SKUs with 5 or fewer units remaining. Reorder soon.
          </p>
        </div>

        {/* Healthy Inventory Card */}
        <div
          onClick={() => setFilterMode("in_stock")}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            filterMode === "in_stock"
              ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20"
              : "bg-white border-slate-200 hover:border-emerald-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> In Stock &amp; Healthy
            </span>
            <span className="text-2xl font-black text-emerald-700">{healthyItems.length}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Products with sufficient stock quantity (&gt; 5 units).
          </p>
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              filterMode === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({products.length})
          </button>
          <button
            onClick={() => setFilterMode("low_stock")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              filterMode === "low_stock" ? "bg-amber-600 text-white" : "bg-slate-100 text-amber-700 hover:bg-amber-50"
            }`}
          >
            Low Stock ({lowStockItems.length})
          </button>
          <button
            onClick={() => setFilterMode("out_of_stock")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              filterMode === "out_of_stock" ? "bg-red-600 text-white" : "bg-slate-100 text-red-700 hover:bg-red-50"
            }`}
          >
            Out of Stock ({outOfStockItems.length})
          </button>
          <button
            onClick={() => setFilterMode("in_stock")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              filterMode === "in_stock" ? "bg-emerald-600 text-white" : "bg-slate-100 text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            Healthy ({healthyItems.length})
          </button>
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="stock_asc">Stock: Low to High</option>
            <option value="stock_desc">Stock: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name">Product Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading catalog inventory...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center gap-3">
          <Package className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-base text-slate-800">No inventory matches found</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {searchTerm
              ? `No products match "${searchTerm}". Try adjusting your search query.`
              : "No products found for the selected filter."}
          </p>
          {(searchTerm || filterMode !== "all") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setFilterMode("all");
              }}
              className="text-xs text-blue-600 font-bold hover:underline mt-2"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (320px - 767px) */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredProducts.map((product) => {
              const isUpdating = updatingId === product.id;
              const isOut = product.stock_quantity === 0;
              const isLow = !isOut && product.stock_quantity <= 5;
              const primaryImg = product.product_images?.[0]?.image_url || "/placeholder.jpg";

              return (
                <div
                  key={product.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                      <Image
                        src={primaryImg}
                        alt={product.title}
                        fill
                        className="object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          SKU: {product.sku}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isOut
                              ? "bg-red-100 text-red-700"
                              : isLow
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-slate-900 mt-1 line-clamp-1">
                        {product.title}
                      </h3>

                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-xs font-extrabold text-slate-900">
                          {formatCurrency(product.sale_price || product.price)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Updated {formatRelativeTime(product.updated_at || "")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stock Quantity Stepper & Quick Update on Mobile */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">Stock:</span>
                      <span
                        className={`text-sm font-black ${
                          isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-700"
                        }`}
                      >
                        {product.stock_quantity} units
                      </span>
                    </div>

                    {/* Quick Stepper */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleStepStock(product, -1)}
                        disabled={isUpdating || product.stock_quantity === 0}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm disabled:opacity-40 transition-colors"
                        title="Decrease stock by 1"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStepStock(product, +1)}
                        disabled={isUpdating}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm disabled:opacity-40 transition-colors"
                        title="Increase stock by 1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {/* Direct Edit input */}
                      <input
                        type="number"
                        min="0"
                        value={customStockInputs[product.id] ?? product.stock_quantity}
                        onChange={(e) =>
                          setCustomStockInputs((prev) => ({
                            ...prev,
                            [product.id]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                        className="w-14 h-8 px-1 text-center font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() =>
                          handleUpdateStock(
                            product.id,
                            customStockInputs[product.id] ?? product.stock_quantity
                          )
                        }
                        disabled={
                          isUpdating ||
                          customStockInputs[product.id] === product.stock_quantity
                        }
                        className="h-8 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors flex items-center justify-center"
                      >
                        {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Data Table (768px+) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Product Details</th>
                    <th className="px-4 py-4">SKU / Code</th>
                    <th className="px-4 py-4">Price</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Current Stock</th>
                    <th className="px-6 py-4 text-right">Quick Stock Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => {
                    const isUpdating = updatingId === product.id;
                    const isOut = product.stock_quantity === 0;
                    const isLow = !isOut && product.stock_quantity <= 5;
                    const primaryImg = product.product_images?.[0]?.image_url || "/placeholder.jpg";

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Product Info */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                              <Image
                                src={primaryImg}
                                alt={product.title}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div className="min-w-0 max-w-xs">
                              {product.categories?.name && (
                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                                  {product.categories.name}
                                </span>
                              )}
                              <p className="font-bold text-slate-900 line-clamp-1">{product.title}</p>
                              <span className="text-[11px] text-slate-400">
                                Updated {formatRelativeTime(product.updated_at || "")}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="px-4 py-4">
                          <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {product.sku}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-4 font-bold text-slate-900">
                          {formatCurrency(product.sale_price || product.price)}
                        </td>

                        {/* Stock Badge */}
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              isOut
                                ? "bg-red-100 text-red-700"
                                : isLow
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isOut ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : isLow ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>{isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}</span>
                          </span>
                        </td>

                        {/* Current Stock number */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`font-black text-base ${
                              isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-700"
                            }`}
                          >
                            {product.stock_quantity}
                          </span>
                          <span className="text-[10px] text-slate-400 block">units</span>
                        </td>

                        {/* Quick Stock Controls */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* -1 button */}
                            <button
                              onClick={() => handleStepStock(product, -1)}
                              disabled={isUpdating || product.stock_quantity === 0}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold disabled:opacity-30 transition-colors"
                              title="Decrease stock by 1"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            {/* +1 button */}
                            <button
                              onClick={() => handleStepStock(product, +1)}
                              disabled={isUpdating}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold disabled:opacity-30 transition-colors"
                              title="Increase stock by 1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Direct count input */}
                            <input
                              type="number"
                              min="0"
                              value={customStockInputs[product.id] ?? product.stock_quantity}
                              onChange={(e) =>
                                setCustomStockInputs((prev) => ({
                                  ...prev,
                                  [product.id]: Math.max(0, parseInt(e.target.value) || 0),
                                }))
                              }
                              className="w-16 h-8 px-2 text-center font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />

                            {/* Save button */}
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                handleUpdateStock(
                                  product.id,
                                  customStockInputs[product.id] ?? product.stock_quantity
                                )
                              }
                              disabled={
                                isUpdating ||
                                customStockInputs[product.id] === product.stock_quantity
                              }
                              className="h-8 text-xs px-3 font-bold bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                            </Button>
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
    </div>
  );
}
