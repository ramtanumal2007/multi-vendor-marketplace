"use client";

import React from "react";
import { Package, AlertCircle, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface InventoryHealthCardProps {
  products: Array<{ stock_quantity: number }>;
}

export function InventoryHealthCard({ products }: InventoryHealthCardProps) {
  const inStock = products.filter((p) => p.stock_quantity > 5).length;
  const lowStock = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 5).length;
  const outOfStock = products.filter((p) => p.stock_quantity === 0).length;
  const total = products.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" /> Inventory Health
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Real-time stock status across {total} product listings</p>
        </div>
        <Link href="/seller/products" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center">
          Manage Inventory <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* In Stock */}
        <div className="bg-emerald-50/50 border border-emerald-200/60 p-4 rounded-lg flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-900">{inStock}</div>
            <div className="text-xs font-medium text-emerald-700">In Stock</div>
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-amber-50/50 border border-amber-200/60 p-4 rounded-lg flex items-center space-x-3">
          <div className="p-2.5 bg-amber-100 text-amber-600 rounded-lg">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-900">{lowStock}</div>
            <div className="text-xs font-medium text-amber-700">Low Stock (&le; 5 units)</div>
          </div>
        </div>

        {/* Out of Stock */}
        <div className="bg-red-50/50 border border-red-200/60 p-4 rounded-lg flex items-center space-x-3">
          <div className="p-2.5 bg-red-100 text-red-600 rounded-lg">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-red-900">{outOfStock}</div>
            <div className="text-xs font-medium text-red-700">Out of Stock</div>
          </div>
        </div>
      </div>
    </div>
  );
}
