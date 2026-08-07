"use client";

import React, { useEffect, useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Heart } from "lucide-react";

export default function WishlistPage() {
  const [wishlistProducts, setWishlistProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/wishlist");
    } else if (user) {
      fetchWishlist();
    }
  }, [user, authLoading]);

  const fetchWishlist = async () => {
    setIsLoading(true);
    // Fetch wishlist items joined with products
    const { data, error } = await supabase
      .from("wishlist")
      .select(`
        product_id,
        products (*, product_images (image_url))
      `)
      .eq("user_id", user?.id);

    if (data) {
      const products = data.map((item: any) => ({
        ...item.products,
        product_images: item.products.product_images
      }));
      setWishlistProducts(products);
    }
    setIsLoading(false);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-16 py-12 w-full">
      <div className="flex items-center gap-3 mb-10 border-b border-border pb-6">
        <Heart className="w-8 h-8 text-accent" />
        <h1 className="text-3xl font-serif">Your Wishlist</h1>
      </div>

      {wishlistProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <Heart className="w-16 h-16 text-border mb-4" />
          <h2 className="text-2xl font-serif mb-2">It's empty here!</h2>
          <p className="text-foreground-secondary mb-8">You haven't saved any items to your wishlist yet.</p>
          <Link href="/products">
            <Button variant="primary">Explore Products</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
          {wishlistProducts.map(product => {
            const primaryImage = product.product_images?.[0]?.image_url || "/placeholder.jpg";
            return (
              <ProductCard 
                key={product.id}
                id={product.id}
                title={product.title}
                price={product.price}
                salePrice={product.sale_price}
                image={primaryImage}
                category={product.category_id} 
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
