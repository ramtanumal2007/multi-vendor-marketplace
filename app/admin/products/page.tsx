"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  Download,
  AlertTriangle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ImageUploader, UploadedImageItem } from "@/components/ui/ImageUploader";
import { extractStoragePath } from "@/lib/imageOptimizer";
import { generateMarketplaceSKU, getSKUPreview, normalizeSKU, checkSKUExists } from "@/lib/skuGenerator";
import { createClient } from "@/lib/supabase";
import { downloadCsv } from "@/lib/exportCsv";

interface CategoryItem {
  id: string;
  name: string;
}

interface StoreItem {
  id: string;
  name: string;
  seller_id?: string;
  status?: string;
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
  tax_rate?: number | null;
  delivery_fee?: number | null;
  categories?: { id: string; name: string } | null;
  stores?: { id: string; name: string; seller_id?: string } | null;
  product_images?: Array<{ id?: string; image_url: string }>;
}

export default function AdminProductsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "pending_review" | "active" | "rejected" | "draft">("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Moderation state
  const [previewProduct, setPreviewProduct] = useState<ProductItem | null>(null);
  const [moderationProduct, setModerationProduct] = useState<ProductItem | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingModeration, setIsSubmittingModeration] = useState(false);

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
    tax_rate: "",
    delivery_fee: "",
  });
  const [formImages, setFormImages] = useState<UploadedImageItem[]>([]);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchProductsData = React.useCallback(async () => {
    setIsLoading(true);
    const { data: productsData, error: prodError } = await supabase
      .from("products")
      .select("*, categories(id, name), product_images(id, image_url), stores(id, name, seller_id)")
      .order("created_at", { ascending: false });

    if (prodError) {
      addToast({ title: "Error", description: "Failed to load products.", type: "error" });
    } else {
      setProducts(productsData || []);
    }

    setIsLoading(false);
  }, [supabase, addToast]);

  const fetchMetadata = React.useCallback(async () => {
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
  }, [supabase]);

  useEffect(() => {
    fetchProductsData();
    fetchMetadata();
  }, [fetchProductsData, fetchMetadata]);

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
      tax_rate: "",
      delivery_fee: "",
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
      tax_rate: product.tax_rate !== null && product.tax_rate !== undefined ? String(product.tax_rate) : "",
      delivery_fee: product.delivery_fee !== null && product.delivery_fee !== undefined ? String(product.delivery_fee) : "",
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

    (currentImgs || []).forEach((row: { image_url: string }) => {
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
        tax_rate: formData.tax_rate.trim() !== "" ? parseFloat(formData.tax_rate) : null,
        delivery_fee: formData.delivery_fee.trim() !== "" ? parseFloat(formData.delivery_fee) : null,
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
        tax_rate: formData.tax_rate.trim() !== "" ? parseFloat(formData.tax_rate) : null,
        delivery_fee: formData.delivery_fee.trim() !== "" ? parseFloat(formData.delivery_fee) : null,
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

  const handleApproveProduct = async (product: ProductItem) => {
    setIsSubmittingModeration(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ status: "active" })
        .eq("id", product.id);

      if (error) throw error;

      // Notify seller if store has seller_id
      const sellerId = product.stores?.seller_id;
      if (sellerId) {
        await supabase.from("seller_notifications").insert({
          seller_id: sellerId,
          title: "Product Listing Approved",
          message: `Your product "${product.title}" has been reviewed, approved, and published live to the marketplace.`,
          type: "approval",
          priority: "high",
        });
      }

      addToast({
        title: "Product Approved",
        description: `"${product.title}" is now active and published.`,
        type: "success",
      });

      setIsApproveModalOpen(false);
      setModerationProduct(null);
      if (previewProduct?.id === product.id) {
        setPreviewProduct((prev) => (prev ? { ...prev, status: "active" } : null));
      }
      fetchProductsData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve product.";
      addToast({ title: "Approval Failed", description: msg, type: "error" });
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleRejectProduct = async (product: ProductItem) => {
    if (!rejectionReason.trim()) {
      addToast({
        title: "Rejection Reason Required",
        description: "Please specify why this product is being rejected so the seller can rectify it.",
        type: "info",
      });
      return;
    }

    setIsSubmittingModeration(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ status: "rejected" })
        .eq("id", product.id);

      if (error) throw error;

      // Notify seller with reason
      const sellerId = product.stores?.seller_id;
      if (sellerId) {
        await supabase.from("seller_notifications").insert({
          seller_id: sellerId,
          title: "Product Listing Rejected",
          message: `Your product "${product.title}" was not approved. Reason: ${rejectionReason.trim()}`,
          type: "warning",
          priority: "high",
        });
      }

      addToast({
        title: "Product Rejected",
        description: `"${product.title}" was marked as rejected and seller was notified.`,
        type: "info",
      });

      setIsRejectModalOpen(false);
      setModerationProduct(null);
      setRejectionReason("");
      if (previewProduct?.id === product.id) {
        setPreviewProduct((prev) => (prev ? { ...prev, status: "rejected" } : null));
      }
      fetchProductsData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject product.";
      addToast({ title: "Rejection Failed", description: msg, type: "error" });
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredProducts.length === 0) {
      addToast({ title: "No Data", description: "No products match current filters to export.", type: "info" });
      return;
    }

    const headers = [
      "Product ID",
      "Title",
      "SKU",
      "Category",
      "Store Name",
      "Regular Price",
      "Sale Price",
      "Stock Quantity",
      "Status",
      "Tax Rate (%)",
      "Delivery Fee",
    ];

    const rows = filteredProducts.map((p) => [
      p.id,
      p.title,
      p.sku || "N/A",
      p.categories?.name || "Uncategorized",
      p.stores?.name || "Platform",
      p.price,
      p.sale_price || "",
      p.stock_quantity ?? 0,
      p.status,
      p.tax_rate ?? 0,
      p.delivery_fee ?? 0,
    ]);

    downloadCsv(`products_${statusTab}`, headers, rows);
    addToast({
      title: "Export Completed",
      description: `Exported ${filteredProducts.length} product(s) to CSV.`,
      type: "success",
    });
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      (p.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusTab === "all" || p.status === statusTab;
    const matchesStore = storeFilter === "all" || p.store_id === storeFilter;
    return matchesSearch && matchesStatus && matchesStore;
  });

  const pendingCount = products.filter((p) => p.status === "pending_review").length;
  const activeCount = products.filter((p) => p.status === "active").length;
  const rejectedCount = products.filter((p) => p.status === "rejected").length;
  const draftCount = products.filter((p) => p.status === "draft").length;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products & Moderation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review merchant listings, manage catalog pricing, and supervise marketplace inventory.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            className="flex items-center gap-2 text-slate-700 bg-white hover:bg-slate-50 border-slate-300 rounded-xl text-xs font-bold"
          >
            <Download className="w-4 h-4 text-slate-500" /> Export CSV
          </Button>
          <Button variant="primary" onClick={handleOpenAddModal} className="flex items-center gap-2 text-xs font-bold">
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Moderation Status Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setStatusTab("all")}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
            statusTab === "all"
              ? "border-blue-600 text-blue-600 bg-white shadow-2xs"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          All Products
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-semibold">
            {products.length}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("pending_review")}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
            statusTab === "pending_review"
              ? "border-amber-500 text-amber-800 bg-amber-50/60 shadow-2xs"
              : "border-transparent text-slate-500 hover:text-amber-700 hover:bg-amber-50/30"
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Pending Moderation
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              pendingCount > 0
                ? "bg-amber-500 text-white animate-pulse"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {pendingCount}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("active")}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
            statusTab === "active"
              ? "border-emerald-600 text-emerald-800 bg-emerald-50/60 shadow-2xs"
              : "border-transparent text-slate-500 hover:text-emerald-700 hover:bg-emerald-50/30"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Active
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
            {activeCount}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("rejected")}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
            statusTab === "rejected"
              ? "border-red-600 text-red-800 bg-red-50/60 shadow-2xs"
              : "border-transparent text-slate-500 hover:text-red-700 hover:bg-red-50/30"
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-red-600" />
          Rejected
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-800 font-semibold">
            {rejectedCount}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("draft")}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
            statusTab === "draft"
              ? "border-slate-600 text-slate-900 bg-slate-100/60 shadow-2xs"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          Draft
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-semibold">
            {draftCount}
          </span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by title or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">All Merchant Stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchProductsData}
              className="flex items-center gap-1.5 text-slate-700 bg-white hover:bg-slate-50 border-slate-300 rounded-xl text-xs font-semibold h-9"
              title="Refresh products"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
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
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          product.status === "active"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : product.status === "draft"
                            ? "bg-slate-100 text-slate-700 border border-slate-200"
                            : product.status === "pending_review"
                            ? "bg-amber-100 text-amber-900 border border-amber-300 font-extrabold"
                            : "bg-red-100 text-red-800 border border-red-200"
                        }`}
                      >
                        {product.status === "pending_review" && <Clock className="w-3 h-3 text-amber-700" />}
                        {product.status === "active" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {product.status === "rejected" && <XCircle className="w-3 h-3 text-red-600" />}
                        {(product.status || "draft").replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {product.status === "pending_review" && (
                          <>
                            <button
                              onClick={() => {
                                setModerationProduct(product);
                                setIsApproveModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs"
                              title="Approve Listing"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => {
                                setModerationProduct(product);
                                setRejectionReason("");
                                setIsRejectModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs"
                              title="Reject Listing"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setPreviewProduct(product)}
                          title="Preview Product"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(product)}
                          title="Edit Product"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(product)}
                          title="Delete Product"
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Product Tax Rate (%) (Optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.tax_rate}
                onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                placeholder="e.g. 5, 12, 18 (Overrides category/default)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Custom Delivery Fee (₹) (Optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.delivery_fee}
                onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                placeholder="e.g. 0 for Free Delivery or ₹40"
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

      {/* Moderation Approve Confirmation Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve Product Listing"
      >
        <div className="space-y-4 text-left mt-2">
          <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-950">
              <span className="font-bold block">Ready to Publish Live</span>
              Approving will publish <strong>{moderationProduct?.title}</strong> to the marketplace customer storefront.
              The merchant will be notified.
            </div>
          </div>
          <div className="text-xs text-slate-500 space-y-1">
            <p><strong>Merchant Store:</strong> {moderationProduct?.stores?.name || "Platform"}</p>
            <p><strong>Price:</strong> {formatCurrency(moderationProduct?.price || 0)}</p>
            <p><strong>SKU:</strong> {moderationProduct?.sku || "N/A"}</p>
          </div>
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsApproveModalOpen(false)}
              disabled={isSubmittingModeration}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              onClick={() => moderationProduct && handleApproveProduct(moderationProduct)}
              isLoading={isSubmittingModeration}
            >
              Approve & Publish
            </Button>
          </div>
        </div>
      </Modal>

      {/* Moderation Reject Confirmation Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Product Listing"
      >
        <div className="space-y-4 text-left mt-2">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-950">
              <span className="font-bold block">Listing Rejection</span>
              Rejecting will keep <strong>{moderationProduct?.title}</strong> off the storefront and dispatch your reason
              directly to the seller.
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Incomplete description, blurry images, or copyright trademark violation..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRejectModalOpen(false)}
              disabled={isSubmittingModeration}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
              onClick={() => moderationProduct && handleRejectProduct(moderationProduct)}
              isLoading={isSubmittingModeration}
              disabled={!rejectionReason.trim()}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Product Preview Drawer / Modal */}
      {previewProduct && (
        <Modal
          isOpen={!!previewProduct}
          onClose={() => setPreviewProduct(null)}
          title={`Product Preview: ${previewProduct.title}`}
        >
          <div className="space-y-5 text-left mt-2 max-h-[75vh] overflow-y-auto pr-1">
            {/* Image Preview Carousel / Gallery */}
            <div className="w-full h-56 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center p-2 relative">
              {previewProduct.product_images?.[0]?.image_url ? (
                <img
                  src={previewProduct.product_images[0].image_url}
                  alt={previewProduct.title}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-slate-400 text-xs">No product image uploaded</div>
              )}
              <span
                className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold shadow-xs ${
                  previewProduct.status === "active"
                    ? "bg-emerald-600 text-white"
                    : previewProduct.status === "pending_review"
                    ? "bg-amber-500 text-white"
                    : previewProduct.status === "rejected"
                    ? "bg-red-600 text-white"
                    : "bg-slate-700 text-white"
                }`}
              >
                {previewProduct.status.toUpperCase()}
              </span>
            </div>

            {/* Pricing & Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Regular Price</span>
                <span className="font-bold text-slate-900 text-sm">{formatCurrency(previewProduct.price)}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Sale Price</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {previewProduct.sale_price ? formatCurrency(previewProduct.sale_price) : "None"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Inventory Stock</span>
                <span className="font-bold text-slate-900 text-sm">{previewProduct.stock_quantity ?? 0} units</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Tax Rate</span>
                <span className="font-bold text-slate-900 text-sm">{previewProduct.tax_rate ?? 0}%</span>
              </div>
            </div>

            {/* Specifications */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Listing Specifications</h4>
              <div className="grid grid-cols-2 gap-2 p-3 bg-white rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block">SKU</span>
                  <span className="font-mono font-bold text-slate-800">{previewProduct.sku || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Category</span>
                  <span className="font-bold text-slate-800">{previewProduct.categories?.name || "Uncategorized"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Merchant Store</span>
                  <span className="font-bold text-blue-700">{previewProduct.stores?.name || "Platform Direct"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Delivery Fee</span>
                  <span className="font-bold text-slate-800">
                    {previewProduct.delivery_fee ? formatCurrency(previewProduct.delivery_fee) : "Standard"}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Description</h4>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed max-h-32 overflow-y-auto">
                {previewProduct.description || "No description provided."}
              </div>
            </div>

            {/* Moderation Controls in Preview */}
            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
              <div className="flex gap-2">
                {previewProduct.status === "pending_review" && (
                  <>
                    <Button
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                      onClick={() => {
                        setModerationProduct(previewProduct);
                        setIsApproveModalOpen(true);
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      type="button"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                      onClick={() => {
                        setModerationProduct(previewProduct);
                        setRejectionReason("");
                        setIsRejectModalOpen(true);
                      }}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                  </>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewProduct(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

