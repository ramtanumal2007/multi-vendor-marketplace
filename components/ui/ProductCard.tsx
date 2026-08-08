"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { Button } from "./Button";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

import { ShoppingCart } from "lucide-react";

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
  onQuickAdd?: () => void;
}

export function ProductCard({
  id,
  slug = id,
  title,
  price,
  salePrice,
  sale_price,
  primaryImage,
  image,
  secondaryImage,
  isNew,
  onQuickAdd,
}: ProductCardProps) {
  const displayImage = primaryImage || image || "/placeholder.jpg";
  const [isHovered, setIsHovered] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const effectiveSalePrice = salePrice !== undefined ? salePrice : sale_price;

  React.useEffect(() => {
    if (user && id) {
      supabase.from("wishlist").select("id").eq("user_id", user.id).eq("product_id", id).single()
        .then(({ data }) => {
          if (data) setIsWishlisted(true);
        });
    }
  }, [user, id]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className="group relative flex flex-col gap-3 bg-card p-3 rounded-2xl shadow-sm border border-border hover:shadow-md hover:border-accent/30 transition-all h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/products/${slug}`} className="block relative aspect-square w-full overflow-hidden bg-background-secondary rounded-xl mb-1">
        {isNew && (
          <div className="absolute top-3 left-3 z-20 flex h-6 items-center justify-center rounded-full bg-foreground px-2 text-[10px] font-bold uppercase tracking-widest text-background">
            New
            {/* Pulse effect */}
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 rounded-full border border-foreground"
            />
          </div>
        )}

        {/* Wishlist Button */}
        <button
          onClick={toggleWishlist}
          disabled={isWishlistLoading}
          className="absolute top-3 right-3 z-30 p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 text-white/70 hover:text-white transition-colors shadow-sm"
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? "fill-accent text-accent" : ""}`} />
        </button>

        {/* Primary Image */}
        <motion.div
          animate={{ scale: isHovered ? 1.05 : 1 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 h-full w-full"
        >
          <Image
            src={displayImage}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        </motion.div>

        {/* Secondary Image */}
        {secondaryImage && (
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 h-full w-full"
              >
                <Image
                  src={secondaryImage}
                  alt={`${title} alternate`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Quick Add Button (Mobile friendly) */}
        <div className="absolute bottom-3 right-3 z-20">
          <button
            className="w-10 h-10 bg-accent text-white rounded-full flex items-center justify-center shadow-lg hover:bg-accent-hover hover:scale-105 active:scale-95 transition-all"
            onClick={(e) => {
              e.preventDefault();
              onQuickAdd?.();
            }}
            aria-label="Add to Cart"
          >
            <ShoppingCart className="w-5 h-5" />
          </button>
        </div>
      </Link>

      <div className="flex flex-col gap-1.5 flex-1 px-1">
        <Link href={`/products/${slug}`}>
          <h3 className="font-medium text-[15px] leading-tight text-foreground hover:text-accent transition-colors line-clamp-2">
            {title}
          </h3>
        </Link>
        <div className="mt-auto flex items-baseline gap-2 text-[15px]">
          {effectiveSalePrice && effectiveSalePrice > 0 && effectiveSalePrice < price ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-accent font-bold leading-none">{formatCurrency(effectiveSalePrice)}</span>
                <span className="text-slate-400 line-through text-xs font-normal">
                  {formatCurrency(price)}
                </span>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {Math.round(((price - effectiveSalePrice) / price) * 100)}% off
                </span>
              </div>
            </div>
          ) : (
            <span className="text-foreground font-bold leading-none">{formatCurrency(price)}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
