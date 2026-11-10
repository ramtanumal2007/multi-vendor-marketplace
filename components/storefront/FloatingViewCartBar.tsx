"use client";

import React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, ChevronRight } from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { formatCurrency } from "@/lib/utils";

export function FloatingViewCartBar() {
  const pathname = usePathname();
  const { items, itemCount, subtotal, openDrawer } = useCart();

  // Don't show on checkout, cart page, product detail pages, or admin/seller dashboards
  const isProductDetailPage = pathname.startsWith("/products/") && pathname !== "/products";
  const isHiddenPage =
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/seller") ||
    isProductDetailPage;

  const isVisible = itemCount > 0 && !isHiddenPage;

  // First item preview thumbnail if available
  const firstItem = items.length > 0 ? items[0] : null;
  const itemThumbnail = firstItem?.image;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          aria-label="Floating View Cart"
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 25, scale: 0.96 }}
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 32,
            mass: 0.8,
          }}
          className="fixed z-40 select-none pointer-events-none
            bottom-[calc(56px+env(safe-area-inset-bottom,0px)+12px)] left-0 right-0 px-3 flex justify-center
            md:bottom-6 md:right-8 md:left-auto md:w-auto md:px-0"
        >
          <div className="w-full max-w-[290px] sm:max-w-[320px] md:max-w-none flex justify-center md:justify-end">
            <button
              onClick={() => openDrawer()}
              className="pointer-events-auto group relative w-full sm:w-auto h-[44px] sm:h-[48px]
                bg-[#168a35] hover:bg-[#137b2f] active:scale-[0.98] text-white 
                rounded-full px-3 sm:px-4 py-1.5 flex items-center justify-between gap-3
                shadow-[0_8px_20px_rgba(22,138,53,0.32)] hover:shadow-[0_10px_25px_rgba(22,138,53,0.45)]
                border border-white/20 transition-all duration-200 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {/* Left Side: Thumbnail preview or Bag Icon */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0 border border-white/30 shadow-2xs">
                  {itemThumbnail ? (
                    <Image
                      src={itemThumbnail}
                      alt={firstItem?.title || "Cart product preview"}
                      width={32}
                      height={32}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  )}
                </div>

                {/* Center / Text details */}
                <div className="flex flex-col text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-xs sm:text-sm tracking-tight leading-none text-white whitespace-nowrap">
                      View Cart
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-white/25 text-white leading-none">
                      {itemCount}
                    </span>
                  </div>
                  {subtotal > 0 && (
                    <span className="text-[10px] sm:text-[11px] font-bold text-emerald-100 leading-none mt-0.5">
                      {formatCurrency(subtotal)}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Side: Circular Chevron */}
              <div className="flex items-center shrink-0">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                  <ChevronRight className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                </div>
              </div>
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
