"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  ArrowLeft
} from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const { items, subtotal, itemCount, updateQuantity, removeItem, clearCart } = useCart();

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 py-8 md:py-12 w-full flex-1 flex flex-col">
      {/* Header Breadcrumb / Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-xs text-foreground-secondary mb-1">
            <Link href="/" className="hover:text-accent transition-colors">Home</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Cart</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-black tracking-tight text-foreground flex items-center gap-3">
            <span>Your Shopping Cart</span>
            {itemCount > 0 && (
              <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}
          </h1>
        </div>

        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-foreground-secondary hover:text-destructive transition-colors flex items-center gap-1.5 self-start sm:self-auto font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Entire Cart</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        /* Empty Cart State */
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 bg-background-secondary/20 rounded-3xl border border-dashed border-border my-6">
          <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mb-6 text-accent">
            <ShoppingBag className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Your Cart is Empty</h2>
          <p className="text-foreground-secondary text-sm max-w-md mx-auto mb-8 leading-relaxed">
            Looks like you haven&apos;t added any products to your cart yet. Discover amazing verified local sellers and trending products.
          </p>
          <Link href="/products">
            <Button variant="primary" size="lg" className="font-bold px-8 shadow-md">
              Start Shopping
            </Button>
          </Link>
        </div>
      ) : (
        /* Active Cart Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Main Column: Items Table / List */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Free Delivery Reassurance Banner */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300">
              <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                <strong>Verified Seller Guarantee:</strong> Products dispatch directly from local registered vendor warehouses.
              </span>
            </div>

            {/* Cart Items List */}
            <div className="bg-card rounded-2xl border border-border shadow-xs divide-y divide-border overflow-hidden">
              <AnimatePresence mode="popLayout">
                {items.map((item) => {
                  const hasDiscount = Boolean(item.mrp && item.mrp > item.price);
                  const discountPct = hasDiscount && item.mrp ? Math.round(((item.mrp - item.price) / item.mrp) * 100) : 0;

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      {/* Product Thumbnail & Details */}
                      <div className="flex items-center gap-4 flex-1 min-w-0 w-full sm:w-auto">
                        <Link
                          href={`/products/${item.productId}`}
                          className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-background-secondary overflow-hidden flex-shrink-0 border border-border/60 hover:opacity-90 transition-opacity"
                        >
                          <Image
                            src={item.image || "/placeholder.jpg"}
                            alt={item.title}
                            fill
                            className="object-cover"
                          />
                        </Link>

                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/products/${item.productId}`}
                            className="font-bold text-sm sm:text-base text-foreground hover:text-accent transition-colors line-clamp-2 leading-tight"
                          >
                            {item.title}
                          </Link>

                          {item.variantInfo && (
                            <p className="text-xs text-foreground-secondary mt-1 font-medium bg-background-secondary/60 px-2 py-0.5 rounded inline-block">
                              {item.variantInfo}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-2">
                            <span className="font-extrabold text-sm sm:text-base text-foreground">
                              {formatCurrency(item.price)}
                            </span>
                            {hasDiscount && (
                              <>
                                <span className="text-xs text-foreground-secondary line-through">
                                  {formatCurrency(item.mrp || item.price)}
                                </span>
                                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded">
                                  {discountPct}% OFF
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quantity & Actions Row */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-none border-border/60">
                        {/* Quantity Controls */}
                        <div className="flex items-center border border-border rounded-xl bg-background overflow-hidden shadow-2xs">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-2 hover:bg-background-secondary text-foreground-secondary hover:text-foreground transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-10 text-center font-bold text-xs select-none">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-2 hover:bg-background-secondary text-foreground-secondary hover:text-foreground transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Item Total */}
                        <div className="text-right min-w-[80px]">
                          <span className="font-extrabold text-sm sm:text-base text-foreground">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </div>

                        {/* Remove Action */}
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-foreground-secondary hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                          title="Remove item"
                          aria-label={`Remove ${item.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Back to Shopping Link */}
            <div className="pt-2">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 text-xs font-bold text-accent hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Continue Shopping &amp; Discover More</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Order Summary Sidebar */}
          <div className="lg:col-span-4 w-full sticky top-24">
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-5">
              <h2 className="text-lg font-bold text-foreground border-b border-border pb-3">
                Order Summary
              </h2>

              <div className="flex flex-col gap-3 text-sm text-foreground-secondary">
                <div className="flex justify-between items-center">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
                  <span className="font-bold text-foreground">{formatCurrency(subtotal)}</span>
                </div>

                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span>Delivery Charges</span>
                    <span className="text-[11px] text-foreground-secondary/80">
                      Calculated at checkout by location
                    </span>
                  </div>
                  <span className="text-xs font-medium text-foreground-secondary">TBD</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span>Applicable Taxes</span>
                  <span>Included in prices</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-baseline">
                <div>
                  <span className="font-bold text-base text-foreground">Estimated Total</span>
                  <p className="text-[11px] text-foreground-secondary">Excludes delivery fee</p>
                </div>
                <span className="text-2xl font-black text-foreground">
                  {formatCurrency(subtotal)}
                </span>
              </div>

              {/* Checkout Action CTA */}
              <Link href="/checkout" className="w-full">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full h-13 text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              {/* Trust Badges */}
              <div className="pt-4 border-t border-border/80 flex flex-col gap-2.5 text-xs text-foreground-secondary">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>100% Secure Checkout &amp; Data Protection</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4 text-accent flex-shrink-0" />
                  <span>Express Dispatch from Verified Local Stores</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <RotateCcw className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span>Easy Return &amp; Replacement Assurance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
