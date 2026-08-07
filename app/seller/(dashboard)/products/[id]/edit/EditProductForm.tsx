"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ImageUploader, UploadedImageItem } from "@/components/ui/ImageUploader";
import { extractStoragePath } from "@/lib/imageOptimizer";
import { generateMarketplaceSKU, getSKUPreview, normalizeSKU, checkSKUExists } from "@/lib/skuGenerator";

interface CategoryItem {
  id: string;
  name: string;
}

interface ProductData {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  sale_price?: number | null;
  stock_quantity?: number;
  sku?: string | null;
  status: string;
  category_id?: string | null;
  product_images?: Array<{ id: string; image_url: string }>;
}

export default function EditProductForm({ product, categories }: { product: ProductData; categories: CategoryItem[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(product.category_id || "");
  const [images, setImages] = useState<UploadedImageItem[]>(
    (product.product_images || []).map((img) => ({
      id: img.id,
      url: img.image_url,
      isExisting: true,
    }))
  );

  const router = useRouter();
  const supabase = createClient();
  const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string || "").trim();
    const description = (formData.get("description") as string || "").trim();
    const categoryId = formData.get("category_id") as string;
    const priceStr = formData.get("price") as string;
    const salePriceStr = (formData.get("sale_price") as string || "").trim();
    const skuStr = (formData.get("sku") as string || "").trim();
    const stockStr = formData.get("stock_quantity") as string;
    const requestedStatus = formData.get("status") as string;

    if (!title) {
      setError("Product title is required.");
      setLoading(false);
      return;
    }

    if (!categoryId) {
      setError("Please select a category.");
      setLoading(false);
      return;
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      setError("Regular price must be greater than ₹0.");
      setLoading(false);
      return;
    }

    let salePrice: number | null = null;
    if (salePriceStr !== "") {
      salePrice = parseFloat(salePriceStr);
      if (isNaN(salePrice) || salePrice <= 0 || salePrice >= price) {
        setError("Sale price must be greater than ₹0 and strictly lower than the regular price.");
        setLoading(false);
        return;
      }
    }

    const stockQuantity = parseInt(stockStr, 10);
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      setError("Stock quantity cannot be negative.");
      setLoading(false);
      return;
    }

    let finalSku = normalizeSKU(skuStr);
    if (finalSku) {
      const exists = await checkSKUExists(supabase, finalSku, product.id);
      if (exists) {
        setError(`SKU '${finalSku}' is already in use by another product.`);
        setLoading(false);
        return;
      }
    } else {
      const categoryObj = categories.find((c) => c.id === categoryId);
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 5) {
        finalSku = generateMarketplaceSKU({
          categoryName: categoryObj?.name,
        });
        const exists = await checkSKUExists(supabase, finalSku, product.id);
        if (!exists) {
          isUnique = true;
        }
        attempts++;
      }
    }

    const data = {
      title,
      description: description || null,
      category_id: categoryId,
      price,
      sale_price: salePrice,
      stock_quantity: stockQuantity,
      sku: finalSku,
      status: requestedStatus, // Trigger process_product_update will force to pending_review if active
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "unknown";

      const { error: updateError } = await supabase
        .from("products")
        .update(data)
        .eq("id", product.id);

      if (updateError) throw updateError;

      // 1. Detect removed images to delete from Supabase storage
      const { data: currentImgs } = await supabase
        .from("product_images")
        .select("image_url")
        .eq("product_id", product.id);

      const activeUrls = new Set(images.map((item) => item.url));
      const pathsToRemove: string[] = [];

      (currentImgs || []).forEach((row) => {
        if (!activeUrls.has(row.image_url)) {
          const storagePath = extractStoragePath(row.image_url);
          if (storagePath) pathsToRemove.push(storagePath);
        }
      });

      if (pathsToRemove.length > 0) {
        await supabase.storage.from("product-images").remove(pathsToRemove);
      }

      // 2. Update product_images table to match image order and new uploads
      await supabase.from("product_images").delete().eq("product_id", product.id);

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        let finalUrl = img.url;

        if (img.file) {
          const filePath = `seller/${userId}/${product.id}/${Date.now()}_${i}.webp`;
          const { error: uploadErr } = await supabase.storage
            .from("product-images")
            .upload(filePath, img.file, { contentType: "image/webp", upsert: true });

          if (uploadErr) {
            console.warn("Storage upload notice:", uploadErr.message);
          } else {
            const { data: pubData } = supabase.storage.from("product-images").getPublicUrl(filePath);
            if (pubData?.publicUrl) {
              finalUrl = pubData.publicUrl;
            }
          }
        }

        await supabase.from("product_images").insert({
          product_id: product.id,
          image_url: finalUrl,
          sort_order: i,
        });
      }

      router.refresh();
      router.push(`/seller/products`);
    } catch (err: unknown) {
      console.error(err);
      setError((err as Error).message || "An error occurred while updating the product.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-red-50 text-red-600 border border-red-200 p-3 rounded-md text-sm font-medium">
          {error}
        </div>
      )}

      {product.status === "active" && (
        <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-sm border border-amber-200">
          Note: Editing an active product will send it back for admin review (status will change to Pending Review).
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Product Title *</label>
        <input
          type="text"
          name="title"
          id="title"
          required
          defaultValue={product.title}
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          name="description"
          id="description"
          rows={4}
          defaultValue={product.description || ""}
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
        />
      </div>

      {/* Multi-Image Uploader */}
      <div>
        <ImageUploader
          images={images}
          onChange={setImages}
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">Regular Price (₹) *</label>
          <input
            type="number"
            name="price"
            id="price"
            min="0.01"
            step="0.01"
            required
            defaultValue={product.price}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          />
        </div>

        <div>
          <label htmlFor="sale_price" className="block text-sm font-medium text-gray-700">Sale Price (₹) (Optional)</label>
          <input
            type="number"
            name="sale_price"
            id="sale_price"
            min="0.01"
            step="0.01"
            defaultValue={product.sale_price || ""}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="category_id" className="block text-sm font-medium text-gray-700">Category *</label>
          <select
            name="category_id"
            id="category_id"
            required
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU (Auto-generated if blank)</label>
          <input
            type="text"
            name="sku"
            id="sku"
            defaultValue={product.sku || ""}
            placeholder={getSKUPreview({ categoryName: selectedCategoryObj?.name })}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border font-mono uppercase"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="stock_quantity" className="block text-sm font-medium text-gray-700">Stock Quantity</label>
          <input
            type="number"
            name="stock_quantity"
            id="stock_quantity"
            min="0"
            defaultValue={product.stock_quantity ?? 0}
            required
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
          <select
            name="status"
            id="status"
            defaultValue={product.status === "active" ? "pending_review" : product.status}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white"
          >
            <option value="draft">Save as Draft</option>
            <option value="pending_review">Submit for Review</option>
          </select>
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/seller/products")}
          className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Update Product"}
        </button>
      </div>
    </form>
  );
}


