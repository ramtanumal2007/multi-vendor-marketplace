"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Minus, Plus, ChevronRight, Truck, RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/context/CartContext";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
  const [product, setProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState("description");
  
  const { addItem, openDrawer } = useCart();
  const { addToast } = useToast();
  const productImageRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function fetchProduct() {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), product_images(image_url), product_options(*, product_option_values(*)), product_variants(*)")
        .eq("slug", params.slug)
        .eq("status", "active")
        .single();
        
      if (error || !data) {
        addToast({ title: "Product not found", type: "error" });
        router.push("/products");
        return;
      }
      
      setProduct(data);
      setIsLoading(false);
    }
    fetchProduct();
  }, [params.slug, supabase, router, addToast]);

  const handleAddToCart = (e: React.MouseEvent) => {
    if (!product) return;
    
    addItem({
      id: `${product.id}-${selectedSize}-${selectedColor}`,
      productId: product.id,
      title: product.title,
      price: product.price,
      image: product.product_images?.[0]?.image_url || "",
      variantInfo: selectedSize ? `Variant: ${selectedSize}` : undefined,
    }, quantity);

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

  const images = product.product_images && product.product_images.length > 0 
    ? product.product_images.map((img: any) => img.image_url) 
    : ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"];

  const hasDiscount = Boolean(product.sale_price && product.sale_price > 0 && product.sale_price < product.price);
  const effectivePrice = hasDiscount ? (product.sale_price as number) : product.price;
  const mrpPrice = product.price;
  const discountPercent = hasDiscount ? Math.round(((mrpPrice - effectivePrice) / mrpPrice) * 100) : 0;

  const handleAddToCartWithCorrectPrice = (e: React.MouseEvent) => {
    if (!product) return;
    
    addItem({
      id: `${product.id}-${selectedSize}-${selectedColor}`,
      productId: product.id,
      title: product.title,
      price: effectivePrice,
      image: product.product_images?.[0]?.image_url || "",
      variantInfo: selectedSize ? `Variant: ${selectedSize}` : undefined,
    }, quantity);

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

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-16 py-8 md:py-12 w-full pt-[80px] md:pt-[100px] mb-24 md:mb-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground-secondary mb-6 md:mb-8 overflow-x-auto whitespace-nowrap pb-2 no-scrollbar">
        <Link href="/" className="hover:text-accent">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/products" className="hover:text-accent">Products</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground truncate max-w-[200px]">{product.title}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
        {/* Image Gallery */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4">
          <div ref={productImageRef} className="relative aspect-square w-full bg-background-secondary rounded-2xl overflow-hidden shadow-sm">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 h-full w-full"
              >
                <Image
                  src={images[selectedImage]}
                  alt={product.title}
                  fill
                  className="object-cover"
                  priority
                />
              </motion.div>
            </AnimatePresence>
            {hasDiscount && (
              <div className="absolute top-4 left-4 bg-secondary-accent text-white font-bold px-3 py-1 rounded-lg text-sm shadow-md">
                {discountPercent}% OFF
              </div>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x no-scrollbar">
            {images.map((img: string, i: number) => (
              <button
                key={i}
                onClick={() => setSelectedImage(i)}
                className={`relative w-20 aspect-square rounded-xl overflow-hidden border-2 transition-all snap-start flex-shrink-0 ${selectedImage === i ? "border-accent p-0.5" : "border-transparent"}`}
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
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1 text-xs font-bold text-brand-grocery bg-brand-grocery/10 px-2 py-1 rounded-md uppercase tracking-wider">
              <Store className="w-3 h-3" /> Local Express
            </span>
          </div>
          
          <h1 className="text-2xl md:text-4xl font-bold mb-4 text-foreground leading-tight">{product.title}</h1>
          
          <div className="flex items-end gap-3 mb-6 border-b border-border pb-6">
            <span className="text-3xl font-bold text-foreground">{formatCurrency(effectivePrice)}</span>
            {hasDiscount && (
              <>
                <span className="text-lg text-foreground-secondary line-through mb-1">{formatCurrency(mrpPrice)}</span>
                <span className="text-sm font-bold text-emerald-600 mb-1.5">(Save {formatCurrency(mrpPrice - effectivePrice)})</span>
              </>
            )}
          </div>

          <p className="text-foreground-secondary leading-relaxed mb-8 text-sm md:text-base">
            {product.description || "No description available for this product. High-quality assured."}
          </p>

          <div className="flex flex-col gap-6 mb-8 bg-background-secondary/30 p-6 rounded-2xl border border-border/50">
            {/* Quantity */}
            <div>
              <span className="text-sm font-bold text-foreground block mb-3">Quantity</span>
              <div className="flex items-center bg-background border border-border rounded-lg w-[140px] h-12 overflow-hidden shadow-sm">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex-1 flex justify-center items-center hover:bg-background-secondary hover:text-accent h-full transition-colors"><Minus className="w-5 h-5" /></button>
                <span className="flex-1 text-center font-bold text-lg">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="flex-1 flex justify-center items-center hover:bg-background-secondary hover:text-accent h-full transition-colors"><Plus className="w-5 h-5" /></button>
              </div>
            </div>
          </div>

          <div className="hidden md:block">
            <Button variant="primary" size="lg" className="w-full mb-8 h-14 text-lg font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all" onClick={handleAddToCartWithCorrectPrice}>
              Add to Cart - {formatCurrency(effectivePrice * quantity)}
            </Button>
          </div>

          <div className="flex flex-col gap-4 text-sm text-foreground-secondary bg-background-secondary/50 p-6 rounded-2xl mb-8">
            <div className="flex items-center gap-3 font-medium"><Truck className="w-5 h-5 text-accent" /> Delivery within 30-45 minutes</div>
            <div className="flex items-center gap-3 font-medium"><RefreshCw className="w-5 h-5 text-accent" /> Easy replacement if defective</div>
          </div>

          {/* Accordion Info */}
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            {[
              { id: "description", title: "Description", content: product.description || "High-quality assured." },
              { id: "details", title: "Product Details", content: "SKU: " + product.id.split('-')[0] + "..." },
              { id: "shipping", title: "Shipping Information", content: "Hyperlocal delivery usually fulfills within 45 minutes of order confirmation." }
            ].map(tab => (
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
        </div>
      </div>

      {/* Sticky Mobile Add to Cart Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-foreground-secondary">Total Price</span>
          <span className="font-bold text-lg leading-none">{formatCurrency(product.price * quantity)}</span>
        </div>
        <Button variant="primary" className="flex-1 h-12 font-bold shadow-md" onClick={handleAddToCart}>
          Add to Cart
        </Button>
      </div>
    </div>
  );
}
