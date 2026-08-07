"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ImageUploader, UploadedImageItem } from "@/components/ui/ImageUploader";
import { extractStoragePath } from "@/lib/imageOptimizer";
import { generateMarketplaceSKU, getSKUPreview, normalizeSKU, checkSKUExists } from "@/lib/skuGenerator";
import { createClient } from "@/lib/supabase";

interface CategoryItem {
  id: string;
  name: string;
}

interface StoreItem {
  id: string;
  name: string;
}

interface ProductItem {
  id: string;
  title: string;
  slug?: string;
  description?: string | null;
  price: number;
  sale_price?: number | null;
  sku?: string | null;
  stock_quantity?: number;
  status: string;
  category_id?: string | null;
  store_id?: string | null;
  categories?: { id: string; name: string } | null;
  stores?: { id: string; name: string } | null;
  product_images?: Array<{ id?: string; image_url: string }>;
}

export default function AdminProductsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Modals & form state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    sale_price: "",
    category_id: "",
    store_id: "",
    sku: "",
    stock_quantity: "0",
    status: "active",
  });
  const [formImages, setFormImages] = useState<UploadedImageItem[]>([]);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchProductsData = async () => {
    setIsLoading(true);
    const { data: productsData, error: prodError } = await supabase
      .from("products")
      .select("*, categories(id, name), product_images(id, image_url), stores(id, name)")
      .order("created_at", { ascending: false });

    if (prodError) {
      addToast({ title: "Error", description: "Failed to load products.", type: "error" });
    } else {
      setProducts(productsData || []);
    }

    setIsLoading(false);
  };

  const fetchMetadata = async () => {
    setIsMetaLoading(true);
    setMetaError(null);
    try {
      const { data: catData, error: catErr } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");

      if (catErr) throw catErr;

      const { data: storeData, error: storeErr } = await supabase
        .from("stores")
        .select("id, name, status")
        .eq("status", "approved")
        .order("name");

      if (storeErr) throw storeErr;

      setCategories(catData || []);
      setStores(storeData || []);
    } catch (err: unknown) {
      console.error("Failed to load metadata:", err);
      setMetaError("Failed to load categories or stores.");
    } finally {
      setIsMetaLoading(false);
    }
  };

  useEffect(() => {
    fetchProductsData();
    fetchMetadata();
  }, []);

  const resetForm = () => {
    setFormError(null);
    setFormData({
      title: "",
      description: "",
      price: "",
      sale_price: "",
      category_id: categories[0]?.id || "",
      store_id: stores[0]?.id || "",
      sku: "",
      stock_quantity: "0",
      status: "active",
    });
    setFormImages([]);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (product: ProductItem) => {
    setFormError(null);
    setSelectedProduct(product);
    setFormData({
      title: product.title || "",
      description: product.description || "",
      price: product.price ? String(product.price) : "",
      sale_price: product.sale_price ? String(product.sale_price) : "",
      category_id: product.category_id || "",
      store_id: product.store_id || "",
      sku: product.sku || "",
      stock_quantity: product.stock_quantity ? String(product.stock_quantity) : "0",
      status: product.status || "active",
    });

    const existingImgs: UploadedImageItem[] = (product.product_images || []).map((img) => ({
      id: img.id,
      url: img.image_url,
      isExisting: true,
    }));
    setFormImages(existingImgs);
    setIsEditModalOpen(true);
  };

  const handleOpenDeleteModal = (product: ProductItem) => {
    setSelectedProduct(product);
    setIsDeleteModalOpen(true);
  };

  const generateSlug = (title: string) => {
    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
    return `${baseSlug}-${Date.now().toString().slice(-4)}`;
  };

  const validateProductForm = async (excludeProductId?: string) => {
    setFormError(null);

    if (!formData.title.trim()) {
      setFormError("Product title is required.");
      return null;
    }

    if (!formData.category_id) {
      setFormError("Please select a category.");
      return null;
    }

    if (!formData.store_id) {
      setFormError("Please select an approved store.");
      return null;
    }

    const priceNum = parseFloat(formData.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError("Regular price must be greater than ₹0.");
      return null;
    }

    let salePriceNum: number | null = null;
    if (formData.sale_price.trim() !== "") {
      salePriceNum = parseFloat(formData.sale_price);
      if (isNaN(salePriceNum) || salePriceNum <= 0 || salePriceNum >= priceNum) {
        setFormError("Sale price must be greater than ₹0 and strictly lower than the regular price.");
        return null;
      }
    }

    const stockNum = parseInt(formData.stock_quantity, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setFormError("Stock quantity cannot be negative.");
      return null;
    }

    // SKU Resolution & Uniqueness
    let finalSku = normalizeSKU(formData.sku);

    if (finalSku) {
      const exists = await checkSKUExists(supabase, finalSku, excludeProductId);
      if (exists) {
        setFormError(`SKU '${finalSku}' is already in use by another product.`);
        return null;
      }
    } else {
      const selectedStore = stores.find((s) => s.id === formData.store_id);
      const selectedCategory = categories.find((c) => c.id === formData.category_id);
      
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 5) {
        finalSku = generateMarketplaceSKU({
          storeName: selectedStore?.name,
          categoryName: selectedCategory?.name,
        });
        const exists = await checkSKUExists(supabase, finalSku, excludeProductId);
        if (!exists) {
          isUnique = true;
        }
        attempts++;
      }
    }

    return {
      priceNum,
      salePriceNum,
      stockNum,
      finalSku,
    };
  };

  const processAndSaveProductImages = async (productId: string, imageItems: UploadedImageItem[]) => {
    const { data: currentImgs } = await supabase
      .from("product_images")
      .select("image_url")
      .eq("product_id", productId);

    const activeUrls = new Set(imageItems.map((item) => item.url));
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

    await supabase.from("product_images").delete().eq("product_id", productId);

    for (let i = 0; i < imageItems.length; i++) {
      const item = imageItems[i];
      let finalUrl = item.url;

      if (item.file) {
        const filePath = `admin/${productId}/${Date.now()}_${i}.webp`;
        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(filePath, item.file, { contentType: "image/webp", upsert: true });

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
        product_id: productId,
        image_url: finalUrl,
        sort_order: i,
      });
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const validated = await validateProductForm();
      if (!validated) {
        setIsSubmitting(false);
        return;
      }

      const slug = generateSlug(formData.title);
      const productPayload = {
        title: formData.title.trim(),
        slug,
        description: formData.description.trim() || null,
        price: validated.priceNum,
        sale_price: validated.salePriceNum,
        category_id: formData.category_id,
        store_id: formData.store_id,
        sku: validated.finalSku,
        stock_quantity: validated.stockNum,
        status: formData.status,
      };

      const { data: newProd, error: insertErr } = await supabase
        .from("products")
        .insert(productPayload)
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (newProd && formImages.length > 0) {
        await processAndSaveProductImages(newProd.id, formImages);
      }

      addToast({ title: "Success", description: "Product created successfully.", type: "success" });
      setIsAddModalOpen(false);
      fetchProductsData();
    } catch (err: unknown) {
      console.error(err);
      setFormError((err as Error).message || "Failed to create product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setIsSubmitting(true);

    try {
      const validated = await validateProductForm(selectedProduct.id);
      if (!validated) {
        setIsSubmitting(false);
        return;
      }

      const productPayload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        price: validated.priceNum,
        sale_price: validated.salePriceNum,
        category_id: formData.category_id,
        store_id: formData.store_id,
        sku: validated.finalSku,
        stock_quantity: validated.stockNum,
        status: formData.status,
      };

      const { error: updateErr } = await supabase
        .from("products")
        .update(productPayload)
        .eq("id", selectedProduct.id);

      if (updateErr) throw updateErr;

      await processAndSaveProductImages(selectedProduct.id, formImages);

      addToast({ title: "Success", description: "Product updated successfully.", type: "success" });
      setIsEditModalOpen(false);
      fetchProductsData();
    } catch (err: unknown) {
      console.error(err);
      setFormError((err as Error).message || "Failed to update product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);

    try {
      const pathsToRemove: string[] = [];
      (selectedProduct.product_images || []).forEach((img) => {
        const path = extractStoragePath(img.image_url);
        if (path) pathsToRemove.push(path);
      });

      if (pathsToRemove.length > 0) {
        await supabase.storage.from("product-images").remove(pathsToRemove);
      }

      const { error: deleteErr } = await supabase
        .from("products")
        .delete()
        .eq("id", selectedProduct.id);

      if (deleteErr) throw deleteErr;

      addToast({ title: "Deleted", description: "Product deleted successfully.", type: "success" });
      setIsDeleteModalOpen(false);
      fetchProductsData();
    } catch (err: unknown) {
      console.error(err);
      addToast({ title: "Error", description: (err as Error).message || "Failed to delete product.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    (p.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your store&apos;s products, pricing, and inventory.</p>
        </div>
        <Button variant="primary" onClick={handleOpenAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Product
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
          </div>
          <Button variant="outline" className="flex items-center gap-2 text-slate-600 bg-white">
            <Filter className="w-4 h-4" /> Filters
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 w-10">
                  <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent" />
                </th>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Store</th>
                <th className="px-6 py-3 text-right">Price</th>
                <th className="px-6 py-3 text-right">Stock</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-4">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    No products found. Click &quot;Add Product&quot; to create one.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent" />
                    </td>
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded border border-slate-200 bg-slate-100 overflow-hidden relative flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={product.product_images?.[0]?.image_url || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"}
                          alt={product.title}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <span className="font-medium text-slate-900 group-hover:text-accent transition-colors cursor-pointer">
                        {product.title}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{product.sku || "N/A"}</td>
                    <td className="px-6 py-4 text-slate-600">{product.categories?.name || "Uncategorized"}</td>
                    <td className="px-6 py-4 text-slate-600">{product.stores?.name || "Platform"}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                      {product.sale_price && product.sale_price > 0 && product.sale_price < product.price ? (
                        <div className="flex flex-col items-end">
                          <span className="text-accent font-bold">{formatCurrency(product.sale_price)}</span>
                          <span className="text-slate-400 line-through text-xs font-normal">
                            {formatCurrency(product.price)}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-semibold">
                            {Math.round(((product.price - product.sale_price) / product.price) * 100)}% off
                          </span>
                        </div>
                      ) : (
                        <span>{formatCurrency(product.price)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">{product.stock_quantity ?? 0}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          product.status === "active"
                            ? "bg-green-100 text-green-800"
                            : product.status === "draft"
                            ? "bg-slate-100 text-slate-800"
                            : product.status === "pending_review"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {(product.status || "draft").replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEditModal(product)}
                          title="Edit Product"
                          className="p-1.5 text-slate-400 hover:text-accent hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(product)}
                          title="Delete Product"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm text-slate-500 bg-white">
          <span>Showing {filteredProducts.length} entries</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>
              Prev
            </button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Product">
        <form onSubmit={handleCreateProduct} className="space-y-4 text-left mt-2 max-h-[80vh] overflow-y-auto pr-1">
          {(formError || metaError) && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-xs font-medium">
              {formError || metaError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Product Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Premium Cotton T-Shirt"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product description..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category *</label>
              <select
                required
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                disabled={isMetaLoading}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:bg-slate-100"
              >
                <option value="">{isMetaLoading ? "Loading categories..." : "Select Category"}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!isMetaLoading && categories.length === 0 && (
                <span className="text-[11px] text-amber-600 mt-1 block">No categories available. Please seed default categories.</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Store *</label>
              <select
                required
                value={formData.store_id}
                onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                disabled={isMetaLoading}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:bg-slate-100"
              >
                <option value="">{isMetaLoading ? "Loading stores..." : stores.length === 0 ? "No approved stores available" : "Select Store"}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {!isMetaLoading && stores.length === 0 && (
                <span className="text-[11px] text-amber-600 mt-1 block">No approved stores available.</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Regular Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="999.00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Sale Price (₹) (Optional)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.sale_price}
                onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                placeholder="799.00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Must be lower than Regular Price</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">SKU (Auto if blank)</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                placeholder={getSKUPreview({
                  storeName: stores.find((s) => s.id === formData.store_id)?.name,
                  categoryName: categories.find((c) => c.id === formData.category_id)?.name,
                })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Stock Quantity</label>
              <input
                type="number"
                min="0"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                placeholder="100"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending Review</option>
                <option value="rejected">Rejected</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Multi-Image Uploader */}
          <div className="pt-2">
            <ImageUploader
              images={formImages}
              onChange={setFormImages}
              disabled={isSubmitting}
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Create Product"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Product">
        <form onSubmit={handleUpdateProduct} className="space-y-4 text-left mt-2 max-h-[80vh] overflow-y-auto pr-1">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-xs font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Product Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category *</label>
              <select
                required
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                disabled={isMetaLoading}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:bg-slate-100"
              >
                <option value="">{isMetaLoading ? "Loading categories..." : "Select Category"}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Store *</label>
              <select
                required
                value={formData.store_id}
                onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                disabled={isMetaLoading}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:bg-slate-100"
              >
                <option value="">{isMetaLoading ? "Loading stores..." : stores.length === 0 ? "No approved stores available" : "Select Store"}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Regular Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Sale Price (₹) (Optional)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.sale_price}
                onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">SKU (Auto if blank)</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Stock Quantity</label>
              <input
                type="number"
                min="0"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending Review</option>
                <option value="rejected">Rejected</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Multi-Image Uploader */}
          <div className="pt-2">
            <ImageUploader
              images={formImages}
              onChange={setFormImages}
              disabled={isSubmitting}
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Update Product"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Product">
        <div className="space-y-4 text-left mt-2">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{selectedProduct?.title}</strong>? This action cannot be undone.
          </p>
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteProduct}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete Product"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

