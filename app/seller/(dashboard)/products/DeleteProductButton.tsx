"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { extractStoragePath } from "@/lib/imageOptimizer";

export default function DeleteProductButton({ productId, productTitle }: { productId: string; productTitle: string }) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    setLoading(true);
    try {
      // 1. Fetch images to clean up storage objects
      const { data: prodImgs } = await supabase
        .from("product_images")
        .select("image_url")
        .eq("product_id", productId);

      const pathsToRemove: string[] = [];
      (prodImgs || []).forEach((img: any) => {
        const path = extractStoragePath(img.image_url);
        if (path) pathsToRemove.push(path);
      });

      if (pathsToRemove.length > 0) {
        await supabase.storage.from("product-images").remove(pathsToRemove);
      }

      // 2. Delete product record from database
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;
      
      setConfirming(false);
      router.refresh();
    } catch (err: unknown) {
      console.error(err);
      alert((err as Error).message || "Failed to delete product.");
    } finally {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1">
        <span className="text-xs text-red-600 font-normal">Delete {productTitle}?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded disabled:opacity-50"
        >
          {loading ? "..." : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-red-600 hover:text-red-900 inline-flex items-center"
      title="Delete Product"
    >
      <Trash2 className="h-4 w-4 mr-1" />
      Delete
    </button>
  );
}

