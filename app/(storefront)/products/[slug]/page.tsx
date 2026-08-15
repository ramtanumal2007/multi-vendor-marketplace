"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Minus,
  Plus,
  ChevronRight,
  Truck,
  RefreshCw,
  MapPin,
  Store,
  Zap,
  ShoppingBag,
  Loader2,
  ArrowRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/context/CartContext";
import { useAuth } from "@/lib/context/AuthContext";
import { formatCurrency, formatDisplaySku, getDeliveryEstimateText } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
  const [product, setProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuyNowLoading, setIsBuyNowLoading] = useState(false);

  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [isRelatedLoading, setIsRelatedLoading] = useState(true);

  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState("description");
  const [pinCode, setPinCode] = useState("");

  const { addItem, setBuyNowItem, openDrawer, closeDrawer } = useCart();
  const { user, isLoading: authLoading } = useAuth();
  const { addToast } = useToast();
  const productImageRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function fetchProduct() {
      setIsLoading(true);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.slug);

      const selectStr =
        "*, categories(name), stores(id, name, slug, address_line1, city, state, postal_code), product_images(image_url), product_options(*, product_option_values(*)), product_variants(*)";

      let query = supabase.from("products").select(selectStr).eq("status", "active");
      if (isUuid) {
        query = query.eq("id", params.slug);
      } else {
        query = query.eq("slug", params.slug);
      }

      let { data, error } = await query.single();

      if (error || !data) {
        const fallbackKey = isUuid ? "slug" : "id";
        const fallback = await supabase
          .from("products")
          .select(selectStr)
          .eq("status", "active")
          .eq(fallbackKey, params.slug)
          .single();

        if (fallback.data) {
          data = fallback.data;
          error = null;
        }
      }

      if (error || !data) {
        addToast({ title: "Product not found", type: "error" });
        router.push("/products");
        return;
      }

      setProduct(data);
      setIsLoading(false);
    }
    fetchProduct();
  }, [params.slug]);

  // Fetch Related Products (Phase 3)
  useEffect(() => {
    if (!product) return;

    async function fetchRelatedProducts() {
      setIsRelatedLoading(true);
      const selectFields = "*, product_images(image_url), categories(name)";

      let sameCategory: any[] = [];
      if (product.category_id) {
        const { data } = await supabase
          .from("products")
          .select(selectFields)
          .eq("status", "active")
          .eq("category_id", product.category_id)
          .neq("id", product.id)
          .order("stock_quantity", { ascending: false })
          .limit(8);

        if (data) sameCategory = data;
      }

      let fallbacks: any[] = [];
      if (sameCategory.length < 8) {
        const excludeIds = [product.id, ...sameCategory.map((p) => p.id)];
        const needed = 8 - sameCategory.length;

        let fallbackQuery = supabase
          .from("products")
          .select(selectFields)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(needed);

        if (excludeIds.length > 0) {
          fallbackQuery = fallbackQuery.not("id", "in", `(${excludeIds.join(",")})`);
        }

        const { data: fbData } = await fallbackQuery;
        if (fbData) fallbacks = fbData;
      }

      setRelatedProducts([...sameCategory, ...fallbacks]);
      setIsRelatedLoading(false);
    }

    fetchRelatedProducts();
  }, [product?.id, product?.category_id]);

  const handleAddToCartWithCorrectPrice = (e: React.MouseEvent) => {
    if (!product) return;

    // Stock Validation
    if (product.track_inventory && product.stock_quantity !== null && product.stock_quantity !== undefined) {
      if (quantity > product.stock_quantity) {
        addToast({
          title: "Insufficient Stock",
          description: `Only ${product.stock_quantity} unit(s) available in stock.`,
          type: "error",
        });
        return;
      }
    }

    const hasDiscount = Boolean(
      product.sale_price && product.sale_price > 0 && product.sale_price < product.price
    );
    const effectivePrice = hasDiscount ? (product.sale_price as number) : product.price;

    addItem(
      {
        id: `${product.id}-${selectedSize}-${selectedColor}`,
        productId: product.id,
        title: product.title,
        price: effectivePrice,
        mrp: product.price,
        image: product.product_images?.[0]?.image_url || "",
        variantInfo: selectedSize ? `Variant: ${selectedSize}` : undefined,
      },
      quantity
    );

    if (productImageRef.current && product.product_images?.[0]?.image_url) {
      const rect = productImageRef.current.getBoundingClientRect();
      const ghost = document.createElement("img");
      ghost.src = product.product_images[0].image_url;
      ghost.style.position = "fixed";
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.objectFit = "cover";
      ghost.style.borderRadius = "8px";
      ghost.style.zIndex = "9999";
      ghost.style.transition = "all 0.8s cubic-bezier(0.25, 1, 0.5, 1)";
      document.body.appendChild(ghost);

      requestAnimationFrame(() => {
        ghost.style.transform = "scale(0.1) rotate(10deg)";
        ghost.style.left = `calc(100vw - 100px)`;
        ghost.style.top = `30px`;
        ghost.style.opacity = "0";
      });

      setTimeout(() => {
        document.body.removeChild(ghost);
        openDrawer();
      }, 800);
    } else {
      openDrawer();
    }
  };

  // Buy Now Handler (Phase 2 & Fix)
  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!product || isBuyNowLoading) return;

    // Stock Validation
    if (product.track_inventory && product.stock_quantity !== null && product.stock_quantity !== undefined) {
      if (quantity > product.stock_quantity) {
        addToast({
          title: "Insufficient Stock",
          description: `Only ${product.stock_quantity} unit(s) available in stock. Please select a smaller quantity.`,
          type: "error",
        });
        return;
      }
    }

    setIsBuyNowLoading(true);

    const hasDiscount = Boolean(
      product.sale_price && product.sale_price > 0 && product.sale_price < product.price
    );
    const effectivePrice = hasDiscount ? (product.sale_price as number) : product.price;

    const buyItem = {
      id: `${product.id}-${selectedSize}-${selectedColor}`,
      productId: product.id,
      title: product.title,
      price: effectivePrice,
      mrp: product.price,
      quantity,
      image: product.product_images?.[0]?.image_url || "",
      variantInfo: selectedSize ? `Variant: ${selectedSize}` : undefined,
    };

    setBuyNowItem(buyItem);
    closeDrawer();

    // Authentication Check & Redirect
    if (!authLoading && !user) {
      addToast({
        title: "Sign in to Checkout",
        description: "Please log in to complete your order.",
        type: "info",
      });
      router.push(`/login?redirect=${encodeURIComponent("/checkout?mode=buy_now")}`);
      return;
    }

    router.push("/checkout?mode=buy_now");
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-12 w-full pt-[80px] md:pt-[100px]">
        <div className="animate-pulse flex flex-col lg:flex-row gap-12 lg:gap-24">
          <div className="w-full lg:w-1/2 aspect-square bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="w-full lg:w-1/2 flex flex-col gap-6">
            <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
            <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded w-full mt-4" />
            <div className="h-14 bg-slate-200 dark:bg-slate-800 rounded w-full mt-8" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) return null;

  const images =
    product.product_images && product.product_images.length > 0
      ? product.product_images.map((img: any) => img.image_url)
      : ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"];

  const hasDiscount = Boolean(
    product.sale_price && product.sale_price > 0 && product.sale_price < product.price
  );
  const effectivePrice = hasDiscount ? (product.sale_price as number) : product.price;
  const mrpPrice = product.price;
  const discountPercent = hasDiscount ? Math.round(((mrpPrice - effectivePrice) / mrpPrice) * 100) : 0;

  const storeObj = Array.isArray(product.stores) ? product.stores[0] : product.stores;
  const sellerStoreName = storeObj?.name;

  const deliveryInfo = getDeliveryEstimateText(
    storeObj?.processing_time_days,
    pinCode,
    storeObj?.postal_code
  );

  const displaySku = formatDisplaySku(product.sku);

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-16 py-8 md:py-12 w-full pt-[80px] md:pt-[100px] mb-24 md:mb-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground-secondary mb-6 md:mb-8 overflow-x-auto whitespace-nowrap pb-2 no-scrollbar">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/products" className="hover:text-accent">
          Products
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground truncate max-w-[200px]">{product.title}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
        {/* Image Gallery */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4">
          <div
            ref={productImageRef}
            className="relative aspect-square w-full bg-background-secondary rounded-2xl overflow-hidden shadow-sm"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 h-full w-full"
              >
                <Image src={images[selectedImage]} alt={product.title} fill className="object-cover" priority />
              </motion.div>
            </AnimatePresence>
            {hasDiscount && (
              <div className="absolute top-4 left-4 bg-emerald-600 text-white font-bold px-3 py-1 rounded-lg text-sm shadow-md">
                {discountPercent}% OFF
              </div>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x no-scrollbar">
            {images.map((img: string, i: number) => (
              <button
                key={i}
                onClick={() => setSelectedImage(i)}
                className={`relative w-20 aspect-square rounded-xl overflow-hidden border-2 transition-all snap-start flex-shrink-0 ${
                  selectedImage === i ? "border-accent p-0.5" : "border-transparent"
                }`}
              >
                <div className="w-full h-full relative rounded-lg overflow-hidden">
                  <Image src={img} alt="" fill className="object-cover" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Product Details */}
        <div className="w-full lg:w-1/2 flex flex-col">
          <h1 className="text-2xl md:text-4xl font-bold mb-3 text-foreground leading-tight">{product.title}</h1>

          {/* Price Information */}
          <div className="flex items-end gap-3 mb-2">
            <span className="text-3xl font-bold text-foreground">{formatCurrency(effectivePrice)}</span>
            {hasDiscount && (
              <>
                <span className="text-lg text-foreground-secondary line-through mb-1">{formatCurrency(mrpPrice)}</span>
                <span className="text-sm font-bold text-emerald-600 mb-1.5">
                  (Save {formatCurrency(mrpPrice - effectivePrice)})
                </span>
              </>
            )}
          </div>

          {/* Stock Status Badge */}
          <div className="mb-4">
            {product.track_inventory ? (
              product.stock_quantity > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Package className="w-3.5 h-3.5 text-emerald-600" />
                  In Stock ({product.stock_quantity} available)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                  Out of Stock
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                In Stock
              </span>
            )}
          </div>

          <p className="text-foreground-secondary leading-relaxed mb-6 text-sm md:text-base">
            {product.description || "No description available for this product. High-quality assured."}
          </p>

          <div className="flex flex-col gap-6 mb-6 bg-background-secondary/30 p-6 rounded-2xl border border-border/50">
            {/* Quantity */}
            <div>
              <span className="text-sm font-bold text-foreground block mb-3">Quantity</span>
              <div className="flex items-center bg-background border border-border rounded-lg w-[140px] h-12 overflow-hidden shadow-sm">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="flex-1 flex justify-center items-center hover:bg-background-secondary hover:text-accent h-full transition-colors"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="flex-1 text-center font-bold text-lg">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="flex-1 flex justify-center items-center hover:bg-background-secondary hover:text-accent h-full transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Action Buttons: Add to Cart & Buy Now */}
          <div className="hidden md:grid grid-cols-2 gap-4 mb-8">
            <Button
              variant="outline"
              size="lg"
              className="h-14 text-base font-bold border-2 border-accent text-accent hover:bg-accent/10 transition-all flex items-center justify-center gap-2"
              onClick={handleAddToCartWithCorrectPrice}
            >
              <ShoppingBag className="w-5 h-5" /> Add to Cart
            </Button>

            <Button
              variant="primary"
              size="lg"
              disabled={isBuyNowLoading || (product.track_inventory && product.stock_quantity <= 0)}
              className="h-14 text-base font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all bg-gradient-to-r from-amber-600 to-orange-600 text-white border-none flex items-center justify-center gap-2 disabled:opacity-50"
              onClick={handleBuyNow}
            >
              {isBuyNowLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5 fill-current" />
              )}
              Buy Now — {formatCurrency(effectivePrice * quantity)}
            </Button>
          </div>

          {/* Dynamic Delivery & Serviceability Information */}
          <div className="flex flex-col gap-4 text-sm bg-background-secondary/50 p-6 rounded-2xl mb-8 border border-border">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 font-semibold text-foreground">
                <Truck className="w-5 h-5 text-accent flex-shrink-0" />
                <span>{deliveryInfo.message}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <MapPin className="w-4 h-4 text-foreground-secondary flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Enter PIN code for delivery check"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs w-52 focus:outline-none focus:ring-1 focus:ring-accent"
                  maxLength={6}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 font-medium text-foreground-secondary">
              <RefreshCw className="w-5 h-5 text-accent flex-shrink-0" /> Easy replacement if defective
            </div>
          </div>

          {/* Accordion Info */}
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            {[
              { id: "description", title: "Description", content: product.description || "High-quality assured." },
              {
                id: "details",
                title: "Product Details",
                content: displaySku
                  ? `SKU: ${displaySku}`
                  : `Category: ${product.categories?.name || "General Catalog Item"}`,
              },
              {
                id: "shipping",
                title: "Shipping Information",
                content: storeObj?.city
                  ? `Shipped directly from warehouse in ${storeObj.city}, ${storeObj.state || "India"}.`
                  : `Shipped directly via verified express courier partners.`,
              },
            ].map((tab) => (
              <div key={tab.id} className="border-b border-border last:border-none">
                <button
                  onClick={() => setActiveTab(activeTab === tab.id ? "" : tab.id)}
                  className="w-full flex justify-between items-center p-5 text-left font-bold text-base hover:text-accent transition-colors bg-background-secondary/20"
                >
                  {tab.title}
                  <Plus className={`w-5 h-5 transition-transform ${activeTab === tab.id ? "rotate-45" : ""}`} />
                </button>
                <AnimatePresence>
                  {activeTab === tab.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden text-foreground-secondary px-5 pb-5 text-sm"
                    >
                      {tab.content}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Seller Store Information Reference */}
          {sellerStoreName && (
            <div className="mt-4 p-3.5 bg-background-secondary/40 rounded-xl border border-border/60 flex items-center justify-between text-xs text-foreground-secondary">
              <div className="flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span>
                  Sold by <strong className="font-semibold text-foreground">{sellerStoreName}</strong>
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded">
                Verified Seller
              </span>
            </div>
          )}
        </div>
      </div>

      {/* PHASE 3: RELATED PRODUCTS SECTION */}
      <section className="mt-16 border-t border-border pt-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              You May Also Like
            </h2>
            <p className="text-sm text-foreground-secondary mt-1">
              Popular items recommended based on your current selection
            </p>
          </div>
          <Link
            href="/products"
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
          >
            <span>Explore All Products</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isRelatedLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="animate-pulse bg-background-secondary rounded-2xl h-72" />
            ))}
          </div>
        ) : relatedProducts.length > 0 ? (
          <div className="flex sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 overflow-x-auto pb-4 snap-x no-scrollbar">
            {relatedProducts.map((relProd: any) => {
              const relHasDiscount = Boolean(
                relProd.sale_price && relProd.sale_price > 0 && relProd.sale_price < relProd.price
              );
              const relEffectivePrice = relHasDiscount ? relProd.sale_price : relProd.price;
              const relMrp = relProd.price;
              const relDiscountPct = relHasDiscount
                ? Math.round(((relMrp - relEffectivePrice) / relMrp) * 100)
                : 0;
              const relImg =
                relProd.product_images?.[0]?.image_url ||
                "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80";

              return (
                <div
                  key={relProd.id}
                  className="min-w-[240px] sm:min-w-0 bg-card border border-border/70 hover:border-accent/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all group snap-start flex flex-col justify-between"
                >
                  <Link href={`/products/${relProd.slug || relProd.id}`} className="block relative aspect-square bg-background-secondary overflow-hidden">
                    <Image
                      src={relImg}
                      alt={relProd.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {relHasDiscount && (
                      <span className="absolute top-2.5 left-2.5 bg-emerald-600 text-white font-bold text-[11px] px-2 py-0.5 rounded shadow">
                        {relDiscountPct}% OFF
                      </span>
                    )}
                  </Link>

                  <div className="p-4 flex flex-col flex-1 justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-foreground-secondary uppercase tracking-wider block mb-1">
                        {relProd.categories?.name || "Catalog Item"}
                      </span>
                      <Link
                        href={`/products/${relProd.slug || relProd.id}`}
                        className="font-bold text-foreground text-sm line-clamp-1 hover:text-accent transition-colors block mb-2"
                      >
                        {relProd.title}
                      </Link>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-extrabold text-base text-foreground">
                          {formatCurrency(relEffectivePrice)}
                        </span>
                        {relHasDiscount && (
                          <span className="text-xs text-foreground-secondary line-through">
                            {formatCurrency(relMrp)}
                          </span>
                        )}
                      </div>

                      <Link href={`/products/${relProd.slug || relProd.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full font-bold text-xs h-9 hover:bg-accent hover:text-white transition-colors"
                        >
                          View Product
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-background-secondary/30 rounded-2xl border border-border">
            <p className="text-foreground-secondary text-sm">No related products found in this category.</p>
          </div>
        )}
      </section>

      {/* Sticky Mobile Add to Cart & Buy Now Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 flex items-center gap-2">
        <Button
          variant="outline"
          className="flex-1 h-12 text-xs font-bold border-accent text-accent"
          onClick={handleAddToCartWithCorrectPrice}
        >
          Add to Cart
        </Button>
        <Button
          variant="primary"
          disabled={isBuyNowLoading || (product.track_inventory && product.stock_quantity <= 0)}
          className="flex-1 h-12 text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white border-none shadow-md"
          onClick={handleBuyNow}
        >
          {isBuyNowLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buy Now"}
        </Button>
      </div>
    </div>
  );
}

