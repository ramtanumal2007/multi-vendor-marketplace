"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";

export function CartDrawer() {
  const { isDrawerOpen, closeDrawer, items, updateQuantity, removeItem, subtotal } = useCart();

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-[70] w-full max-w-[400px] bg-background shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-serif flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" /> Your Cart
              </h2>
              <button
                onClick={closeDrawer}
                className="p-2 hover:bg-background-secondary rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                    <ShoppingBag className="w-10 h-10 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold">Your cart is empty</h3>
                  <p className="text-foreground-secondary text-sm px-4">
                    Looks like you haven't added anything yet. Discover amazing local products!
                  </p>
                  <Button variant="primary" className="mt-4 px-8 font-bold" onClick={closeDrawer}>
                    Start Shopping
                  </Button>
                </div>
              ) : (
                <motion.div
                  variants={{
                    show: { transition: { staggerChildren: 0.05 } },
                  }}
                  initial="hidden"
                  animate="show"
                  className="flex flex-col gap-6"
                >
                    <div className="bg-brand-grocery/10 border border-brand-grocery/20 px-3 py-2 rounded-lg flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-grocery animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-grocery">Items from Local Express</span>
                    </div>
                  <AnimatePresence mode="popLayout">
                    {items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: 50, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: "auto" }}
                        exit={{ opacity: 0, x: 50, height: 0 }}
                        className="flex gap-4"
                      >
                        <div className="relative w-20 h-24 rounded bg-background-secondary overflow-hidden flex-shrink-0">
                          <Image
                            src={item.image}
                            alt={item.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div className="flex flex-col flex-1 py-1 justify-between">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-medium text-sm leading-tight">{item.title}</h4>
                              {item.variantInfo && (
                                <p className="text-xs text-foreground-secondary mt-1">{item.variantInfo}</p>
                              )}
                            </div>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-foreground-secondary hover:text-destructive"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center border border-border rounded">
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="p-1 hover:bg-background-secondary transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center text-sm">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="p-1 hover:bg-background-secondary transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="font-medium text-sm">
                              {formatCurrency(item.price * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-6 border-t border-border bg-background-secondary/50">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-foreground-secondary font-medium">Subtotal</span>
                  <span className="text-xl font-bold">{formatCurrency(subtotal)}</span>
                </div>
                <div className="bg-background rounded-lg p-3 mb-6 border border-border flex items-start gap-3">
                  <div className="bg-success/10 text-success p-1.5 rounded-md mt-0.5"><ShoppingBag className="w-4 h-4" /></div>
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    By proceeding, you agree to our terms. Shipping, taxes, and discounts calculated at checkout.
                  </p>
                </div>
                <Link href="/checkout" onClick={closeDrawer}>
                  <Button variant="primary" className="w-full h-14 text-lg font-bold shadow-lg">
                    Proceed to Checkout
                  </Button>
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
