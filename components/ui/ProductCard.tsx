"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import {
  Heart,
  ShoppingCart,
  Check,
  Star,
  ShieldCheck,
  Loader2,
  Zap,
  Sparkles,
  Plus,
  ArrowDown,
  Package,
} from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { useCart } from "@/lib/context/CartContext";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { calculateFlipkartDiscount } from "@/lib/search";

export interface FlipkartPriceRowProps {
  originalPrice: number;
  sellingPrice: number;
  hasDiscount: boolean;
  discountPercent: number;
  savingsAmount?: number;
  size?: "compact" | "normal" | "large";
  showSavings?: boolean;
}

/**
 * Exact Flipkart-inspired inline price row presentation:
 * Compact badge: ↓ {discountPercent}% OFF
 * Grey strikethrough original price: ~~₹{originalPrice}~~
 * Bold current selling price: ₹{sellingPrice}
 * Savings amount: Save ₹{savingsAmount}
 */
export function FlipkartPriceRow({
  originalPrice,
  sellingPrice,
  hasDiscount,
  discountPercent,
  savingsAmount,
  size = "normal",
  showSavings = true,
}: FlipkartPriceRowProps) {
  if (hasDiscount && discountPercent > 0 && originalPrice > sellingPrice) {
    const isCompact = size === "compact";
    const isLarge = size === "large";
    const savings = savingsAmount !== undefined ? savingsAmount : Math.max(0, originalPrice - sellingPrice);

    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Compact discount badge: ↓ 20% OFF */}
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shrink-0 ${
              isCompact ? "text-[9px] sm:text-[10px]" : isLarge ? "text-xs sm:text-sm px-2 py-1" : "text-[10px] sm:text-xs"
            }`}
          >
            <ArrowDown className={isCompact ? "w-2.5 h-2.5 stroke-[2.5]" : "w-3 h-3 stroke-[2.5]"} />
            <span>{discountPercent}% OFF</span>
          </span>

          {/* Strikethrough original price */}
          <span
            className={`text-slate-400 dark:text-slate-500 line-through font-normal shrink-0 ${
              isCompact ? "text-[10px] sm:text-[11px]" : isLarge ? "text-sm sm:text-base" : "text-xs sm:text-sm"
            }`}
          >
            {formatCurrency(originalPrice)}
          </span>

          {/* Bold current selling price */}
          <span
            className={`font-black text-slate-900 dark:text-white tracking-tight shrink-0 ${
              isCompact ? "text-xs sm:text-sm" : isLarge ? "text-lg sm:text-2xl" : "text-sm sm:text-base"
            }`}
          >
            {formatCurrency(sellingPrice)}
          </span>
        </div>

        {/* Savings amount: Save ₹100 */}
        {showSavings && savings > 0 && (
          <span
            className={`font-semibold text-emerald-600 dark:text-emerald-400 ${
              isCompact ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-[11px]"
            }`}
          >
            Save {formatCurrency(savings)}
          </span>
        )}
      </div>
    );
  }

  return (
    <span
      className={`font-black text-slate-900 dark:text-white tracking-tight ${
        size === "compact" ? "text-xs sm:text-sm" : size === "large" ? "text-lg sm:text-2xl" : "text-sm sm:text-base"
      }`}
    >
      {formatCurrency(sellingPrice)}
    </span>
  );
}

export type ProductDisplayStyle =
  | "standard"
  | "compact"
  | "deal"
  | "featured"
  | "horizontal"
  | "minimal";

export interface ProductCardProps {
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
  rating?: number | null;
  reviewCount?: number | null;
  reviews_count?: number | null;
  storeName?: string;
  isVerifiedStore?: boolean;
  displayStyle?: ProductDisplayStyle | string;
  stock_quantity?: number | null;
  track_inventory?: boolean;
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
  category,
  rating,
  reviewCount,
  reviews_count,
  displayStyle = "standard",
  stock_quantity,
  track_inventory,
  onQuickAdd,
}: ProductCardProps) {
  const targetSlug = slug && typeof slug === "string" && slug.trim() !== "" ? slug.trim() : id;
  const displayImage = primaryImage || image || "/placeholder.jpg";
  const [isHovered, setIsHovered] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isJustAdded, setIsJustAdded] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const cardImageRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { addItem, setBuyNowItem } = useCart();
  const supabase = createClient();
  const router = useRouter();

  // Out of Stock & Custom Cake
  const isOutOfStock = Boolean(
    track_inventory && stock_quantity !== undefined && stock_quantity !== null && stock_quantity <= 0
  );
  const isCustomCake = Boolean(
    category && category.toLowerCase().includes("cake")
  );

  // Price calculations using central Flipkart discount engine
  const effectiveSalePrice = salePrice !== undefined ? salePrice : sale_price;
  const {
    hasDiscount,
    discountPercent,
    savingsAmount,
    finalPrice,
    originalPrice,
  } = calculateFlipkartDiscount(price, effectiveSalePrice);

  // Real ratings & reviews
  const realReviewsCount =
    typeof reviewCount === "number"
      ? reviewCount
      : typeof reviews_count === "number"
      ? reviews_count
      : 0;
  const hasReviews = realReviewsCount > 0 && typeof rating === "number" && rating > 0;
  const displayRating = hasReviews ? rating : null;

  // Normalized display style
  const validStyles: ProductDisplayStyle[] = [
    "standard",
    "compact",
    "deal",
    "featured",
    "horizontal",
    "minimal",
  ];
  const activeStyle: ProductDisplayStyle = validStyles.includes(
    displayStyle?.toLowerCase() as ProductDisplayStyle
  )
    ? (displayStyle.toLowerCase() as ProductDisplayStyle)
    : "standard";

  // Check wishlist status
  useEffect(() => {
    if (user && id) {
      supabase
        .from("wishlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", id)
        .maybeSingle()
        .then(({ data }: { data: { id: string } | null }) => {
          if (data) setIsWishlisted(true);
        });
    }
  }, [user, id, supabase]);

  const toggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/products/${targetSlug}`)}`);
      return;
    }
    if (isWishlistLoading) return;

    setIsWishlistLoading(true);
    try {
      if (isWishlisted) {
        await supabase.from("wishlist").delete().eq("user_id", user.id).eq("product_id", id);
        setIsWishlisted(false);
      } else {
        await supabase.from("wishlist").insert({ user_id: user.id, product_id: id });
        setIsWishlisted(true);
      }
    } catch (err) {
      console.warn("Wishlist toggle error:", err);
    } finally {
      setIsWishlistLoading(false);
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock || isAdding || isJustAdded) return;

    setIsAdding(true);
    addItem(
      {
        id,
        productId: id,
        title,
        price: finalPrice,
        mrp: originalPrice,
        image: displayImage,
      },
      1,
      false
    );

    setTimeout(() => {
      setIsAdding(false);
      setIsJustAdded(true);
      onQuickAdd?.();
    }, 300);

    setTimeout(() => {
      setIsJustAdded(false);
    }, 2000);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock || isBuyingNow) return;

    setIsBuyingNow(true);
    setBuyNowItem({
      id,
      productId: id,
      title,
      price: finalPrice,
      mrp: originalPrice,
      quantity: 1,
      image: displayImage,
    });

    setTimeout(() => {
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent("/checkout?mode=buy_now")}`);
      } else {
        router.push("/checkout?mode=buy_now");
      }
      setIsBuyingNow(false);
    }, 350);
  };

  // Reusable Wishlist Button Component
  const WishlistButton = ({ className = "" }: { className?: string }) => (
    <button
      onClick={toggleWishlist}
      disabled={isWishlistLoading}
      aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      className={`p-2 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-red-500 transition-colors shadow-xs z-30 ${className}`}
    >
      {isWishlistLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Heart
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
            isWishlisted ? "fill-red-500 text-red-500" : ""
          }`}
        />
      )}
    </button>
  );

  // Reusable Seller Privacy Trust Badge
  const VerifiedBadge = () => (
    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
      <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      <span className="truncate">Verified Merchant Partner</span>
    </div>
  );

  // =========================================================================
  // VARIANT 5: HORIZONTAL / WIDE CARD
  // =========================================================================
  if (activeStyle === "horizontal") {
    return (
      <div
        className="group relative flex flex-row items-center bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl shadow-xs border border-slate-200/90 dark:border-slate-800 hover:shadow-lg hover:border-accent/40 transition-all duration-300 w-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={cardImageRef}
          className="relative w-28 sm:w-36 h-28 sm:h-36 overflow-hidden bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0"
        >
          <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
            <Image
              src={displayImage}
              alt={title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 120px, 160px"
            />
          </Link>
          <div className="absolute top-1.5 right-1.5">
            <WishlistButton className="p-1.5" />
          </div>
        </div>

        <div className="flex flex-col flex-1 pl-3 sm:pl-4 justify-between min-w-0 h-full py-0.5">
          <div>
            <div className="mb-1">
              <VerifiedBadge />
            </div>

            <Link href={`/products/${targetSlug}`}>
              <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 hover:text-accent transition-colors line-clamp-2 leading-snug">
                {title}
              </h3>
            </Link>

            {hasReviews ? (
              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                <div className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold border border-amber-200/60 text-[10px]">
                  <span>{displayRating?.toFixed(1)}</span>
                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                </div>
                <span>({realReviewsCount})</span>
              </div>
            ) : isNew ? (
              <span className="text-[10px] font-extrabold uppercase text-accent mt-1 inline-block">
                ★ New
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
            <FlipkartPriceRow
              originalPrice={originalPrice}
              sellingPrice={finalPrice}
              hasDiscount={hasDiscount}
              discountPercent={discountPercent}
              savingsAmount={savingsAmount}
              size="normal"
            />

            <div className="flex items-center gap-1.5">
              {isOutOfStock ? (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 select-none">
                  Out of Stock
                </span>
              ) : isCustomCake ? (
                <Link
                  href="/customize-cake"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                >
                  Customize
                </Link>
              ) : (
                <>
                  <button
                    onClick={handleAddToCart}
                    disabled={isAdding}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                      isJustAdded
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {isJustAdded ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                    <span>{isJustAdded ? "Added" : "Add"}</span>
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={isBuyingNow}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center gap-1 shadow-xs hover:brightness-105 active:scale-95 transition-transform"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Buy</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VARIANT 2: COMPACT CARD
  // =========================================================================
  if (activeStyle === "compact") {
    return (
      <div
        className="group relative flex flex-col bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 hover:shadow-md hover:border-accent/40 transition-all duration-200 h-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={cardImageRef}
          className="relative aspect-square w-full overflow-hidden bg-slate-50 dark:bg-slate-800/60 rounded-lg mb-1.5"
        >
          <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
            <Image
              src={displayImage}
              alt={title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 40vw, 20vw"
            />
          </Link>
          <div className="absolute top-1 right-1">
            <WishlistButton className="p-1" />
          </div>
        </div>

        <div className="flex flex-col flex-1 justify-between gap-1">
          <div>
            <VerifiedBadge />
            <Link href={`/products/${targetSlug}`}>
              <h3 className="font-semibold text-xs leading-snug text-slate-900 dark:text-slate-100 hover:text-accent transition-colors line-clamp-1 mt-0.5">
                {title}
              </h3>
            </Link>
          </div>

          <div className="flex items-end justify-between gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
            <FlipkartPriceRow
              originalPrice={originalPrice}
              sellingPrice={finalPrice}
              hasDiscount={hasDiscount}
              discountPercent={discountPercent}
              savingsAmount={savingsAmount}
              size="compact"
              showSavings={false}
            />

            {!isOutOfStock && !isCustomCake && (
              <button
                onClick={handleAddToCart}
                disabled={isAdding}
                aria-label="Add to cart"
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  isJustAdded
                    ? "bg-emerald-600 text-white"
                    : "bg-accent hover:bg-accent-hover text-white shadow-xs"
                }`}
              >
                {isJustAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VARIANT 3: DEAL CARD
  // =========================================================================
  if (activeStyle === "deal") {
    return (
      <div
        className="group relative flex flex-col bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-2xl shadow-xs border-2 border-amber-400/60 dark:border-amber-600/60 hover:shadow-xl hover:border-amber-500 transition-all duration-300 h-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={cardImageRef}
          className="relative aspect-square w-full overflow-hidden bg-amber-50/40 dark:bg-slate-800/80 rounded-xl mb-2"
        >
          <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
            <Image
              src={displayImage}
              alt={title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
          </Link>

          <div className="absolute top-2 left-2 z-20">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-600 text-white shadow-md flex items-center gap-1">
              <Zap className="w-3 h-3 fill-current" /> Hot Deal
            </span>
          </div>

          <div className="absolute top-2 right-2 z-20">
            <WishlistButton />
          </div>
        </div>

        <div className="flex flex-col flex-1 justify-between gap-1.5">
          <div>
            <VerifiedBadge />
            <Link href={`/products/${targetSlug}`}>
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 hover:text-accent transition-colors line-clamp-2 mt-0.5">
                {title}
              </h3>
            </Link>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <FlipkartPriceRow
              originalPrice={originalPrice}
              sellingPrice={finalPrice}
              hasDiscount={hasDiscount}
              discountPercent={discountPercent}
              savingsAmount={savingsAmount}
              size="normal"
            />

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleAddToCart}
                disabled={isAdding || isOutOfStock}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                  isJustAdded
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-slate-100"
                }`}
              >
                {isJustAdded ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                <span>{isJustAdded ? "Added" : "Cart"}</span>
              </button>
              <button
                onClick={handleBuyNow}
                disabled={isBuyingNow || isOutOfStock}
                className="py-2 px-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-center gap-1 shadow-md hover:brightness-105 active:scale-95 transition-transform"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Buy Now</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VARIANT 4: FEATURED CARD
  // =========================================================================
  if (activeStyle === "featured") {
    return (
      <div
        className="group relative flex flex-col bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-3xl shadow-md border border-slate-200/90 dark:border-slate-800 hover:shadow-2xl hover:border-accent/50 transition-all duration-300 h-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={cardImageRef}
          className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 rounded-2xl mb-3"
        >
          <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
            <Image
              src={displayImage}
              alt={title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-108"
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </Link>

          <div className="absolute top-2.5 left-2.5 z-20">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-accent text-white shadow-md flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Featured
            </span>
          </div>

          <div className="absolute top-2.5 right-2.5 z-20">
            <WishlistButton />
          </div>
        </div>

        <div className="flex flex-col flex-1 justify-between gap-2">
          <div>
            <VerifiedBadge />
            <Link href={`/products/${targetSlug}`}>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 hover:text-accent transition-colors line-clamp-2 mt-0.5">
                {title}
              </h3>
            </Link>

            {hasReviews && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold border border-amber-200/60 text-[11px]">
                  <span>{displayRating?.toFixed(1)}</span>
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                </div>
                <span className="text-slate-400">({realReviewsCount} reviews)</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <FlipkartPriceRow
              originalPrice={originalPrice}
              sellingPrice={finalPrice}
              hasDiscount={hasDiscount}
              discountPercent={discountPercent}
              savingsAmount={savingsAmount}
              size="normal"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleAddToCart}
                disabled={isAdding || isOutOfStock}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  isJustAdded
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-slate-100"
                }`}
              >
                {isJustAdded ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                <span>{isJustAdded ? "Added" : "Add to Cart"}</span>
              </button>
              <button
                onClick={handleBuyNow}
                disabled={isBuyingNow || isOutOfStock}
                className="py-2.5 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-center gap-1.5 shadow-md hover:brightness-105 active:scale-95 transition-transform"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Buy Now</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VARIANT 6: MINIMAL CARD
  // =========================================================================
  if (activeStyle === "minimal") {
    return (
      <div
        className="group relative flex flex-col bg-white dark:bg-slate-900 rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 h-full border border-slate-100 dark:border-slate-800/80 p-2"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={cardImageRef}
          className="relative aspect-square w-full overflow-hidden bg-slate-50 dark:bg-slate-800 rounded-lg mb-2"
        >
          <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
            <Image
              src={displayImage}
              alt={title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-104"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
          </Link>
          <div className="absolute top-1.5 right-1.5">
            <WishlistButton className="p-1" />
          </div>
        </div>

        <div className="flex flex-col flex-1 justify-between px-1 pb-1">
          <div>
            <VerifiedBadge />
            <Link href={`/products/${targetSlug}`}>
              <h3 className="font-normal text-xs sm:text-sm text-slate-800 dark:text-slate-200 hover:text-accent transition-colors line-clamp-1 mt-0.5">
                {title}
              </h3>
            </Link>
          </div>

          <div className="flex items-center justify-between gap-1 pt-1.5 mt-auto">
            <FlipkartPriceRow
              originalPrice={originalPrice}
              sellingPrice={finalPrice}
              hasDiscount={hasDiscount}
              discountPercent={discountPercent}
              savingsAmount={savingsAmount}
              size="compact"
              showSavings={false}
            />

            {!isOutOfStock && !isCustomCake && (
              <button
                onClick={handleAddToCart}
                disabled={isAdding}
                aria-label="Add to cart"
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  isJustAdded
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90"
                }`}
              >
                {isJustAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VARIANT 1: STANDARD CARD (Default marketplace standard)
  // =========================================================================
  return (
    <div
      className="group relative flex flex-col bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-xs border border-slate-200/90 dark:border-slate-800 hover:shadow-xl hover:border-accent/40 dark:hover:border-accent/40 transition-all duration-300 h-full hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Container */}
      <div
        ref={cardImageRef}
        className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800/80 rounded-lg sm:rounded-xl mb-2 sm:mb-2.5"
      >
        <Link href={`/products/${targetSlug}`} className="block absolute inset-0 w-full h-full">
          <motion.div
            animate={{ scale: isHovered ? 1.05 : 1 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
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

          {secondaryImage && isHovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
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
        </Link>

        {/* Top Badges */}
        <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 z-20 flex flex-col gap-1 items-start pointer-events-none">
          {isNew && (
            <div className="flex h-4 sm:h-5 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-1.5 sm:px-2 text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider shadow-xs">
              New
            </div>
          )}
        </div>

        {/* Wishlist Button */}
        <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 z-20">
          <WishlistButton />
        </div>

        {/* Quick Out-of-Stock / Customize Badge on Image */}
        {isOutOfStock && (
          <div className="absolute bottom-2 left-2 z-20">
            <span className="px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-bold bg-slate-900/85 text-white backdrop-blur-md shadow-xs select-none">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Product Details Section */}
      <div className="flex flex-col gap-1 sm:gap-1.5 flex-1 px-0.5 justify-between">
        <div>
          {/* Verified Merchant Reassurance */}
          <VerifiedBadge />

          {/* Title */}
          <Link href={`/products/${targetSlug}`}>
            <h3 className="font-semibold text-xs sm:text-sm leading-tight sm:leading-snug text-slate-900 dark:text-slate-100 hover:text-accent transition-colors line-clamp-2 mt-0.5">
              {title}
            </h3>
          </Link>

          {/* Real Rating & Review Count */}
          {hasReviews ? (
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-1">
              <div className="flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] sm:text-[11px] border border-amber-200/60 dark:border-amber-900/50">
                <span>{displayRating?.toFixed(1)}</span>
                <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-500 text-amber-500" />
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
                ({realReviewsCount})
              </span>
            </div>
          ) : isNew ? (
            <div className="text-[10px] font-semibold text-accent mt-0.5">
              ★ New Arrival
            </div>
          ) : null}
        </div>

        {/* Pricing & Actions */}
        <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
          {/* Flipkart-inspired Inline Pricing in Indian Rupee (₹) */}
          <FlipkartPriceRow
            originalPrice={originalPrice}
            sellingPrice={finalPrice}
            hasDiscount={hasDiscount}
            discountPercent={discountPercent}
            savingsAmount={savingsAmount}
            size="normal"
          />

          {/* Action Buttons: Add to Cart & Buy Now */}
          {isCustomCake ? (
            <Link
              href="/customize-cake"
              className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 text-center flex items-center justify-center gap-1.5"
            >
              <span>Customize Cake →</span>
            </Link>
          ) : isOutOfStock ? (
            <button
              disabled
              className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold text-center cursor-not-allowed select-none"
            >
              Out of Stock
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleAddToCart}
                disabled={isAdding}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                  isJustAdded
                    ? "bg-emerald-600 text-white shadow-xs"
                    : isAdding
                    ? "bg-accent/80 text-white cursor-wait"
                    : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200"
                }`}
                title="Add to Shopping Cart"
              >
                {isJustAdded ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Added</span>
                  </>
                ) : isAdding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </>
                )}
              </button>

              <button
                onClick={handleBuyNow}
                disabled={isBuyingNow}
                className="py-2 px-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-center gap-1 shadow-xs hover:brightness-105 active:scale-95 transition-transform"
                title="Instant Buy Now"
              >
                {isBuyingNow ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Buy</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
