"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ImageUploader, UploadedImageItem } from "@/components/ui/ImageUploader";
import { generateMarketplaceSKU, getSKUPreview, normalizeSKU, checkSKUExists } from "@/lib/skuGenerator";

export default function ProductForm({ storeId, categories }: { storeId: string; categories: Array<{ id: string; name: string }> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImageItem[]>([]);
  const router = useRouter();
  const supabase = createClient();

  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string || "").trim();

    // Check membership product limit
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: sellerProf } = await supabase
        .from("seller_profiles")
        .select("membership_plan")
        .eq("id", user.id)
        .single();
      const plan = sellerProf?.membership_plan || "BASIC";
      if (plan === "BASIC") {
        const { count } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId);
        if (count && count >= 10) {
          setError("Product limit reached (10/10) for your BASIC membership plan. Upgrade to PRO to add more products.");
          setLoading(false);
          return;
        }
      }
    }
    const description = (formData.get("description") as string || "").trim();
    const categoryId = formData.get("category_id") as string;
    const priceStr = formData.get("price") as string;
    const salePriceStr = (formData.get("sale_price") as string || "").trim();
    const skuStr = (formData.get("sku") as string || "").trim();
    const stockStr = formData.get("stock_quantity") as string;
    const status = formData.get("status") as string;

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
      const exists = await checkSKUExists(supabase, finalSku);
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
        const exists = await checkSKUExists(supabase, finalSku);
        if (!exists) {
          isUnique = true;
        }
        attempts++;
      }
    }

    const baseSlug = generateSlug(title);
    const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    const data = {
      store_id: storeId,
      title,
      slug,
      description: description || null,
      category_id: categoryId,
      price,
      sale_price: salePrice,
      stock_quantity: stockQuantity,
      sku: finalSku,
      status, // 'draft' or 'pending_review'
    };

    try {
      const { data: insertedProduct, error: insertError } = await supabase
        .from("products")
        .insert(data)
        .select()
        .single();

      if (insertError) throw insertError;

      if (insertedProduct && images.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || "unknown";

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          let finalUrl = img.url;

          if (img.file) {
            const filePath = `seller/${userId}/${insertedProduct.id}/${Date.now()}_${i}.webp`;
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
            product_id: insertedProduct.id,
            image_url: finalUrl,
            sort_order: i,
          });
        }
      }

      router.refresh();
      router.push(`/seller/products`);
    } catch (err: unknown) {
      console.error(err);
      setError((err as Error).message || "An error occurred while saving the product.");
    } finally {
      setLoading(false);
    }
  };

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-red-50 text-red-600 border border-red-200 p-3 rounded-md text-sm font-medium">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Product Title *</label>
        <input
          type="text"
          name="title"
          id="title"
          required
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          placeholder="e.g. Premium Cotton Shirt"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          name="description"
          id="description"
          rows={4}
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
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="999.00"
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
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="799.00"
          />
          <span className="text-xs text-gray-500 mt-1 block">Must be lower than Regular Price</span>
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
          {categories.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No categories available in database.</p>
          )}
        </div>

        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU (Auto-generated if blank)</label>
          <input
            type="text"
            name="sku"
            id="sku"
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border font-mono uppercase"
            placeholder={getSKUPreview({ categoryName: selectedCategoryObj?.name })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="stock_quantity" className="block text-sm font-medium text-gray-700">Initial Stock</label>
          <input
            type="number"
            name="stock_quantity"
            id="stock_quantity"
            min="0"
            defaultValue="0"
            required
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Initial Status</label>
          <select
            name="status"
            id="status"
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white"
          >
            <option value="draft">Save as Draft</option>
            <option value="pending_review">Submit for Review</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Products must be reviewed by an admin before becoming active.
          </p>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Create Product"}
        </button>
      </div>
    </form>
  );
}


