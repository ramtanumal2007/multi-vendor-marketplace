"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { Heart, ShoppingCart, Check, Star, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface ProductCardProps {
  id: string;
  slug?: string;
  title: string;
  price: number;
  salePrice?: number | null;
  sale_price?: number | null;
  primaryImage?: string;
  image?: string;
  secondaryImage?: string;
  isNew?: boolean;
  category?: string;
  rating?: number;
  reviewCount?: number;
  reviews_count?: number;
  storeName?: string;
  isVerifiedStore?: boolean;
  onQuickAdd?: () => void;
}

export function ProductCard({
  id,
  slug,
  title,
  price,
  salePrice,
  sale_price,
  primaryImage,
  image,
  secondaryImage,
  isNew,
  rating,
  reviewCount,
  reviews_count,
  storeName,
  isVerifiedStore = true,
  onQuickAdd,
}: ProductCardProps) {
  const targetSlug = slug && typeof slug === "string" && slug.trim() !== "" ? slug.trim() : id;
  const displayImage = primaryImage || image || "/placeholder.jpg";
  const [isHovered, setIsHovered] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isJustAdded, setIsJustAdded] = useState(false);
  const cardImageRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const effectiveSalePrice = salePrice !== undefined ? salePrice : sale_price;
  const hasDiscount = Boolean(
    effectiveSalePrice && effectiveSalePrice > 0 && effectiveSalePrice < price
  );
  const discountPercent = hasDiscount
    ? Math.round(((price - (effectiveSalePrice as number)) / price) * 100)
    : 0;

  // Stable rating display
  const displayRating = rating || 4.5;
  const displayReviews = reviewCount || reviews_count || 32;

  React.useEffect(() => {
    if (user && id) {
      supabase
        .from("wishlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", id)
        .single()
        .then(({ data }: { data: { id: string } | null }) => {
          if (data) setIsWishlisted(true);
        });
    }
  }, [user, id, supabase]);

  const toggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      router.push("/login?redirect=/wishlist");
      return;
    }
    if (isWishlistLoading) return;

    setIsWishlistLoading(true);
    if (isWishlisted) {
      await supabase.from("wishlist").delete().eq("user_id", user.id).eq("product_id", id);
      setIsWishlisted(false);
    } else {
      await supabase.from("wishlist").insert({ user_id: user.id, product_id: id });
      setIsWishlisted(true);
    }
    setIsWishlistLoading(false);
  };

  const handleQuickAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAdding || isJustAdded) return;

    setIsAdding(true);

    const productImgEl = cardImageRef.current;
    const cartButton =
      document.getElementById("header-cart-button") ||
      document.querySelector('button[aria-label="View shopping cart"]');

    if (productImgEl && displayImage) {
      const rect = productImgEl.getBoundingClientRect();
      const cartRect = cartButton?.getBoundingClientRect();

      const ghost = document.createElement("img");
      ghost.src = displayImage;
      ghost.style.position = "fixed";
      ghost.style.left = `${rect.left + rect.width / 4}px`;
      ghost.style.top = `${rect.top + rect.height / 4}px`;
      ghost.style.width = `${Math.min(rect.width / 2, 90)}px`;
      ghost.style.height = `${Math.min(rect.height / 2, 90)}px`;
      ghost.style.objectFit = "cover";
      ghost.style.borderRadius = "12px";
      ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.22)";
      ghost.style.zIndex = "9999";
      ghost.style.pointerEvents = "none";
      ghost.style.transition = "all 0.52s cubic-bezier(0.2, 0.8, 0.2, 1)";
      document.body.appendChild(ghost);

      // Start flight toward cart icon
      setTimeout(() => {
        const destX = cartRect ? cartRect.left + cartRect.width / 2 - 15 : window.innerWidth - 70;
        const destY = cartRect ? cartRect.top + cartRect.height / 2 - 15 : 25;
        ghost.style.transform = "scale(0.12) rotate(12deg)";
        ghost.style.left = `${destX}px`;
        ghost.style.top = `${destY}px`;
        ghost.style.opacity = "0.2";
      }, 120);

      // Lands at cart
      setTimeout(() => {
        if (document.body.contains(ghost)) {
          document.body.removeChild(ghost);
        }
        setIsAdding(false);
        setIsJustAdded(true);
        onQuickAdd?.();
      }, 650);

      setTimeout(() => {
        setIsJustAdded(false);
      }, 2200);
    } else {
      setIsAdding(false);
      setIsJustAdded(true);
      onQuickAdd?.();
      setTimeout(() => setIsJustAdded(false), 1600);
    }
  };

  return (
    <div
      className="group relative flex flex-col bg-white dark:bg-slate-900 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-xs border border-slate-200/90 dark:border-slate-800 hover:shadow-xl hover:border-accent/40 dark:hover:border-accent/40 transition-all duration-300 h-full hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Premium Image Container */}
      <div
        ref={cardImageRef}
        className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800/80 rounded-lg sm:rounded-xl mb-1.5 sm:mb-2.5"
      >
        <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
          {/* Primary Image with smooth hover zoom */}
          <motion.div
            animate={{ scale: isHovered ? 1.06 : 1 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 h-full w-full"
          >
            <Image
              src={displayImage}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          </motion.div>

          {/* Secondary Image crossfade */}
          {secondaryImage && (
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 h-full w-full"
                >
                  <Image
                    src={secondaryImage}
                    alt={`${title} alternate`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </Link>

        {/* Top Badges */}
        <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 z-20 flex flex-col gap-1 items-start pointer-events-none">
          {isNew && (
            <div className="flex h-4 sm:h-5 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-1.5 sm:px-2 text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider shadow-xs">
              New
            </div>
          )}
          {hasDiscount && discountPercent > 0 && (
            <div className="flex h-4 sm:h-5 items-center justify-center rounded sm:rounded-md bg-emerald-600 text-white px-1 sm:px-1.5 text-[8px] sm:text-[10px] font-bold shadow-xs">
              {discountPercent}% OFF
            </div>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleWishlist(e);
          }}
          disabled={isWishlistLoading}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 z-30 p-1.5 sm:p-2 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-md hover:bg-white dark:hover:bg-black/70 text-slate-600 dark:text-white/80 hover:text-red-500 transition-colors shadow-xs"
        >
          <Heart className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isWishlisted ? "fill-red-500 text-red-500" : ""}`} />
        </button>

        {/* Quick Add Button */}
        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2.5 sm:right-2.5 z-20">
          <button
            className={`w-7 h-7 sm:w-10 sm:h-10 ${
              isJustAdded
                ? "bg-emerald-600 text-white scale-105 shadow-emerald-500/30"
                : isAdding
                ? "bg-accent/80 text-white cursor-wait"
                : "bg-accent text-white hover:bg-accent-hover hover:scale-105 active:scale-95 shadow-md shadow-accent/25"
            } rounded-full flex items-center justify-center transition-all duration-200`}
            onClick={handleQuickAddClick}
            aria-label={isJustAdded ? "Added to Cart" : "Add to Cart"}
            title="Quick Add to Cart"
          >
            {isJustAdded ? (
              <Check className="w-3.5 h-3.5 sm:w-5 sm:h-5 animate-in zoom-in-75 duration-200" />
            ) : isAdding ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <ShoppingCart className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Product Details Section */}
      <div className="flex flex-col gap-1 sm:gap-1.5 flex-1 px-0.5">
        {/* Verified Store Badge */}
        <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">{storeName || (isVerifiedStore ? "Verified Store" : "Marketplace Store")}</span>
        </div>

        {/* Title */}
        <Link href={`/products/${targetSlug}`}>
          <h3 className="font-semibold text-[11px] sm:text-sm leading-tight sm:leading-snug text-slate-900 dark:text-slate-100 hover:text-accent transition-colors line-clamp-2">
            {title}
          </h3>
        </Link>

        {/* Rating & Review Count */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-0.5">
          <div className="flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] sm:text-[11px] border border-amber-200/60 dark:border-amber-900/50">
            <span>{displayRating.toFixed(1)}</span>
            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-500 text-amber-500" />
          </div>
          <span className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
            ({displayReviews})
          </span>
        </div>

        {/* Pricing in Indian Rupee (₹) */}
        <div className="mt-auto pt-1 flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
          {hasDiscount && effectiveSalePrice ? (
            <>
              <span className="text-accent font-extrabold text-xs sm:text-base leading-none">
                {formatCurrency(effectiveSalePrice)}
              </span>
              <span className="text-slate-400 line-through text-[10px] sm:text-xs font-normal">
                {formatCurrency(price)}
              </span>
            </>
          ) : (
            <span className="text-slate-900 dark:text-slate-100 font-extrabold text-xs sm:text-base leading-none">
              {formatCurrency(price)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
