"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import {
  Heart,
  ShoppingBag,
  Trash2,
  ArrowRight,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";

interface WishlistJoinedItem {
  wishlistId: string;
  id: string;
  title: string;
  slug?: string;
  price: number;
  sale_price?: number | null;
  stock_quantity?: number | null;
  track_inventory?: boolean;
  status: string;
  category_name?: string;
  image_url: string;
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistJoinedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMovingAll, setIsMovingAll] = useState(false);
  const [actingItemId, setActingItemId] = useState<string | null>(null);

  const { user, isLoading: authLoading } = useAuth();
  const { addItem, openDrawer } = useCart();
  const { addToast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const fetchWishlist = React.useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("wishlist")
        .select(`
          id,
          product_id,
          created_at,
          products (
            id,
            title,
            slug,
            price,
            sale_price,
            stock_quantity,
            track_inventory,
            status,
            categories (name),
            product_images (image_url)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        interface RawWishlistRow {
          id: string;
          product_id: string;
          products?: {
            id: string;
            title: string;
            slug?: string;
            price: number;
            sale_price?: number | null;
            stock_quantity?: number | null;
            track_inventory?: boolean;
            status: string;
            categories?: { name: string } | { name: string }[] | null;
            product_images?: Array<{ image_url: string }>;
          } | null;
        }

        const parsed: WishlistJoinedItem[] = (data as unknown as RawWishlistRow[])
          .filter((row) => row.products && row.products.id)
          .map((row) => {
            const p = row.products!;
            const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
            const primaryImg = p.product_images?.[0]?.image_url || "/placeholder.jpg";

            return {
              wishlistId: row.id,
              id: p.id,
              title: p.title,
              slug: p.slug || p.id,
              price: Number(p.price || 0),
              sale_price: p.sale_price !== null && p.sale_price !== undefined ? Number(p.sale_price) : null,
              stock_quantity: p.stock_quantity ?? 0,
              track_inventory: p.track_inventory ?? true,
              status: p.status || "active",
              category_name: cat?.name || "Marketplace Item",
              image_url: primaryImg,
            };
          });

        setItems(parsed);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load wishlist";
      addToast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase, addToast]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/wishlist");
    } else if (user) {
      fetchWishlist();
    }
  }, [user, authLoading, router, fetchWishlist]);

  // Remove single item from wishlist
  const handleRemove = async (productId: string, wishlistId: string) => {
    if (!user) return;
    setActingItemId(productId);

    try {
      const { error } = await supabase
        .from("wishlist")
        .delete()
        .eq("id", wishlistId)
        .eq("user_id", user.id);

      if (error) throw error;

      setItems((prev) => prev.filter((i) => i.id !== productId));
      addToast({
        title: "Removed",
        description: "Product removed from your wishlist.",
        type: "info",
      });
    } catch {
      addToast({
        title: "Action Failed",
        description: "Could not remove item. Please try again.",
        type: "error",
      });
    } finally {
      setActingItemId(null);
    }
  };

  // Move single item to cart
  const handleMoveToCart = async (item: WishlistJoinedItem) => {
    if (!user) return;
    if (item.status !== "active" || (item.track_inventory && (item.stock_quantity ?? 0) <= 0)) {
      addToast({
        title: "Item Unavailable",
        description: "This product is currently out of stock.",
        type: "info",
      });
      return;
    }

    setActingItemId(item.id);

    try {
      const effectivePrice = item.sale_price || item.price;
      addItem(
        {
          id: item.id,
          productId: item.id,
          title: item.title,
          price: effectivePrice,
          mrp: item.price,
          image: item.image_url,
        },
        1,
        false
      );

      // Remove from wishlist
      await supabase
        .from("wishlist")
        .delete()
        .eq("id", item.wishlistId)
        .eq("user_id", user.id);

      setItems((prev) => prev.filter((i) => i.id !== item.id));

      addToast({
        title: "Moved to Cart",
        description: `Added "${item.title}" to your cart.`,
        type: "success",
      });
      openDrawer();
    } catch {
      addToast({
        title: "Error",
        description: "Failed to move item to cart.",
        type: "error",
      });
    } finally {
      setActingItemId(null);
    }
  };

  // Move all available items to cart
  const handleMoveAllToCart = async () => {
    if (!user || items.length === 0) return;
    setIsMovingAll(true);

    const availableItems = items.filter(
      (item) => item.status === "active" && (!item.track_inventory || (item.stock_quantity ?? 0) > 0)
    );

    if (availableItems.length === 0) {
      addToast({
        title: "No Available Items",
        description: "None of the items in your wishlist are currently in stock.",
        type: "info",
      });
      setIsMovingAll(false);
      return;
    }

    try {
      const wishlistIdsToDelete = availableItems.map((i) => i.wishlistId);

      availableItems.forEach((item) => {
        const effectivePrice = item.sale_price || item.price;
        addItem(
          {
            id: item.id,
            productId: item.id,
            title: item.title,
            price: effectivePrice,
            mrp: item.price,
            image: item.image_url,
          },
          1,
          false
        );
      });

      // Batch delete moved items from Supabase
      const { error } = await supabase
        .from("wishlist")
        .delete()
        .in("id", wishlistIdsToDelete)
        .eq("user_id", user.id);

      if (error) throw error;

      setItems((prev) => prev.filter((i) => !wishlistIdsToDelete.includes(i.wishlistId)));

      addToast({
        title: "Moved to Cart",
        description: `Successfully added ${availableItems.length} item(s) to your cart.`,
        type: "success",
      });

      openDrawer();
    } catch {
      addToast({
        title: "Move Failed",
        description: "Could not move all items to cart. Please try again.",
        type: "error",
      });
    } finally {
      setIsMovingAll(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-foreground-secondary">Loading your saved items...</p>
      </div>
    );
  }

  const inStockCount = items.filter(
    (i) => i.status === "active" && (!i.track_inventory || (i.stock_quantity ?? 0) > 0)
  ).length;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-16 py-8 md:py-12 w-full flex-1 flex flex-col">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-xs text-foreground-secondary mb-1">
            <Link href="/" className="hover:text-accent transition-colors">Home</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Wishlist</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-serif font-black tracking-tight text-foreground flex items-center gap-2.5">
              <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
              <span>Saved Items</span>
            </h1>
            {items.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>
        </div>

        {items.length > 0 && inStockCount > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleMoveAllToCart}
            disabled={isMovingAll}
            className="font-bold text-xs h-10 px-5 flex items-center gap-2 shadow-xs"
          >
            {isMovingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShoppingBag className="w-4 h-4" />
            )}
            <span>Move All In-Stock to Cart ({inStockCount})</span>
          </Button>
        )}
      </div>

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 bg-background-secondary/20 rounded-3xl border border-dashed border-border my-6">
          <div className="w-20 h-20 rounded-full bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center mb-5 text-rose-500 border border-rose-200 dark:border-rose-900/60">
            <Heart className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">
            Your Wishlist is Empty
          </h2>
          <p className="text-foreground-secondary text-sm max-w-md mx-auto mb-8 leading-relaxed">
            Save items you love from our marketplace catalog to easily find and purchase them later.
          </p>
          <Link href="/products">
            <Button variant="primary" size="lg" className="font-bold px-8 shadow-md">
              <span>Continue Shopping</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      ) : (
        /* Items Grid */
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {items.map((item) => {
              const hasDiscount = Boolean(item.sale_price && item.sale_price < item.price);
              const activePrice = item.sale_price || item.price;
              const discountPct = hasDiscount
                ? Math.round(((item.price - item.sale_price!) / item.price) * 100)
                : 0;

              const isOutOfStock =
                item.status !== "active" || (item.track_inventory && (item.stock_quantity ?? 0) <= 0);
              const isLowStock =
                !isOutOfStock && item.track_inventory && (item.stock_quantity ?? 0) > 0 && (item.stock_quantity ?? 0) <= 5;
              const isActing = actingItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="group flex flex-col bg-card rounded-2xl border border-border overflow-hidden hover:border-accent/40 hover:shadow-md transition-all duration-300"
                >
                  {/* Thumbnail & Badges */}
                  <div className="relative aspect-square w-full bg-background-secondary overflow-hidden">
                    <Link href={`/products/${item.slug || item.id}`} className="block w-full h-full">
                      <NextImage
                        src={item.image_url}
                        alt={item.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                      />
                    </Link>

                    {/* Stock Status Badge */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
                      {isOutOfStock ? (
                        <span className="bg-red-600/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          Out of Stock
                        </span>
                      ) : isLowStock ? (
                        <span className="bg-amber-600/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          Only {item.stock_quantity} Left
                        </span>
                      ) : (
                        <span className="bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          In Stock
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {discountPct}% OFF
                        </span>
                      )}
                    </div>

                    {/* Direct Remove Action */}
                    <button
                      onClick={() => handleRemove(item.id, item.wishlistId)}
                      disabled={isActing}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs text-foreground-secondary hover:text-red-600 shadow-sm flex items-center justify-center transition-colors z-10"
                      title="Remove from wishlist"
                      aria-label={`Remove ${item.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-foreground-secondary tracking-wider line-clamp-1 mb-1">
                        {item.category_name}
                      </span>
                      <Link
                        href={`/products/${item.slug || item.id}`}
                        className="text-xs sm:text-sm font-semibold text-foreground line-clamp-2 leading-snug hover:text-accent transition-colors"
                      >
                        {item.title}
                      </Link>
                    </div>

                    <div className="flex flex-col gap-3 pt-2 border-t border-border/60">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base sm:text-lg font-black text-foreground">
                          {formatCurrency(activePrice)}
                        </span>
                        {hasDiscount && (
                          <span className="text-xs text-foreground-secondary line-through">
                            {formatCurrency(item.price)}
                          </span>
                        )}
                      </div>

                      {/* Add to Cart CTA */}
                      <Button
                        variant={isOutOfStock ? "outline" : "primary"}
                        size="sm"
                        disabled={isOutOfStock || isActing}
                        onClick={() => handleMoveToCart(item)}
                        className={`w-full text-xs font-bold h-9 flex items-center justify-center gap-1.5 ${
                          isOutOfStock ? "opacity-60 cursor-not-allowed" : "shadow-xs"
                        }`}
                      >
                        {isActing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isOutOfStock ? (
                          <span>Out of Stock</span>
                        ) : (
                          <>
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Move to Cart</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Continue Shopping CTA Link */}
          <div className="pt-6 border-t border-border flex justify-between items-center flex-wrap gap-4">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline"
            >
              <span>Continue Shopping &amp; Explore Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <span className="text-xs text-foreground-secondary font-medium">
              Items in wishlist are saved to your account across devices.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
