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
  Store,
  X,
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
import { evaluateProductReturnPolicy, parseProductPolicyFromTags } from "@/lib/return-policy";


interface CategoryItem {
  id: string;
  name: string;
  slug?: string;
  parent_id?: string | null;
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
  display_style?: string | null;
  tax_rate?: number | null;
  delivery_fee?: number | null;
  categories?: { id: string; name: string } | null;
  stores?: { id: string; name: string; seller_id?: string } | null;
  product_images?: Array<{ id?: string; image_url: string }>;
  tags?: string[] | null;
  return_allowed?: boolean | null;
  return_window_days?: number | null;
  replacement_allowed?: boolean | null;
  replacement_window_days?: number | null;
  replacement_selectable?: boolean | null;
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

  // Subcategory inline add state
  const [newSubcatName, setNewSubcatName] = useState("");
  const [showAddSubcat, setShowAddSubcat] = useState(false);
  const [isCreatingSubcat, setIsCreatingSubcat] = useState(false);

  // Moderation state
  const [previewProduct, setPreviewProduct] = useState<ProductItem | null>(null);
  const [moderationProduct, setModerationProduct] = useState<ProductItem | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvalDisplayStyle, setApprovalDisplayStyle] = useState("standard");
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
    parent_category_id: "",
    subcategory_ids: [] as string[],
    category_id: "",
    store_ids: [] as string[],
    store_id: "",
    sku: "",
    stock_quantity: "0",
    status: "active",
    display_style: "standard",
    tax_rate: "",
    delivery_fee: "",
    return_allowed: true,
    return_window_days: "7",
    return_window_custom: "",
    replacement_allowed: true,
    replacement_window_days: "7",
    replacement_window_custom: "",
    replacement_selectable: true,
  });
  const [formImages, setFormImages] = useState<UploadedImageItem[]>([]);
  const [subcatSearch, setSubcatSearch] = useState("");
  const [storeSearch, setStoreSearch] = useState("");

  const supabase = createClient();
  const { addToast } = useToast();

  const parentCategories = React.useMemo(() => {
    return categories.filter((c) => !c.parent_id);
  }, [categories]);

  const getSubcategories = React.useCallback(
    (parentId: string): CategoryItem[] => {
      if (!parentId) return [];
      return categories.filter((c) => c.parent_id === parentId);
    },
    [categories]
  );

  const resolveCategoryId = React.useCallback(
    async (catId: string, parentId: string): Promise<string> => {
      return catId || parentId;
    },
    []
  );

  const fetchProductsData = React.useCallback(async () => {
    setIsLoading(true);
    const { data: productsData, error: prodError } = await supabase
      .from("products")
      .select("*, categories:categories!products_category_id_fkey(id, name), product_images(id, image_url), stores:stores!products_store_id_fkey(id, name, seller_id)")
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
        .select("id, name, slug, parent_id")
        .order("name");

      if (catErr) throw catErr;

      const { data: storeData, error: storeErr } = await supabase
        .from("stores")
        .select("id, name, status")
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

  const handleCreateSubcategory = async (parentId: string) => {
    if (!newSubcatName.trim() || !parentId || isCreatingSubcat) return;
    setIsCreatingSubcat(true);
    try {
      const baseSlug = newSubcatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
      const finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
      const { data: newCat, error } = await supabase
        .from("categories")
        .insert({
          name: newSubcatName.trim(),
          slug: finalSlug,
          parent_id: parentId,
        })
        .select("id, name, slug, parent_id")
        .single();

      if (error) throw error;
      setCategories((prev) => [...prev, newCat]);
      setFormData((prev) => ({
        ...prev,
        subcategory_id: newCat.id,
        category_id: newCat.id,
      }));
      setNewSubcatName("");
      setShowAddSubcat(false);
      addToast({ title: "Subcategory Added", description: `"${newCat.name}" is now available.`, type: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create subcategory";
      addToast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsCreatingSubcat(false);
    }
  };

  const resetForm = () => {
    setFormError(null);
    setShowAddSubcat(false);
    setNewSubcatName("");
    setSubcatSearch("");
    setStoreSearch("");
    const approvedStore = stores.find((s) => s.status === "approved") || stores[0];
    const firstParent = categories.find((c) => !c.parent_id);
    setFormData({
      title: "",
      description: "",
      price: "",
      sale_price: "",
      parent_category_id: firstParent?.id || "",
      subcategory_ids: [],
      category_id: firstParent?.id || "",
      store_ids: approvedStore?.id ? [approvedStore.id] : [],
      store_id: approvedStore?.id || "",
      sku: "",
      stock_quantity: "0",
      status: "active",
      display_style: "standard",
      tax_rate: "",
      delivery_fee: "",
      return_allowed: true,
      return_window_days: "7",
      return_window_custom: "",
      replacement_allowed: true,
      replacement_window_days: "7",
      replacement_window_custom: "",
      replacement_selectable: true,
    });
    setFormImages([]);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (product: ProductItem) => {
    setFormError(null);
    setShowAddSubcat(false);
    setNewSubcatName("");
    setSubcatSearch("");
    setStoreSearch("");
    setSelectedProduct(product);

    const currentCat = categories.find((c) => c.id === product.category_id);
    const parentId = currentCat?.parent_id ? currentCat.parent_id : currentCat?.id || "";
    const primarySubcatId = currentCat?.parent_id ? currentCat.id : "";

    // Extract any additional subcategories and stores saved in tags
    const savedTagSubcats = (product.tags || [])
      .filter((t) => t.startsWith("subcat:"))
      .map((t) => t.replace("subcat:", ""));
    const allSubcatIds = Array.from(
      new Set([primarySubcatId, ...savedTagSubcats].filter((x): x is string => Boolean(x)))
    );

    const savedTagStores = (product.tags || [])
      .filter((t) => t.startsWith("store:"))
      .map((t) => t.replace("store:", ""));
    const allStoreIds = Array.from(
      new Set([product.store_id, ...savedTagStores].filter((x): x is string => Boolean(x)))
    );

    // Extract policy from columns or tags
    const tagPolicy = parseProductPolicyFromTags(product.tags);
    const isRetAllowed =
      product.return_allowed !== undefined && product.return_allowed !== null
        ? product.return_allowed
        : (tagPolicy.return_allowed ?? true);

    const rawRetDays =
      product.return_window_days !== undefined && product.return_window_days !== null
        ? product.return_window_days
        : (tagPolicy.return_window_days ?? 7);

    const standardDays = ["1", "3", "5", "7", "10", "15", "30"];
    const isRetStandard = standardDays.includes(String(rawRetDays));

    const isReplAllowed =
      product.replacement_allowed !== undefined && product.replacement_allowed !== null
        ? product.replacement_allowed
        : (tagPolicy.replacement_allowed ?? true);

    const rawReplDays =
      product.replacement_window_days !== undefined && product.replacement_window_days !== null
        ? product.replacement_window_days
        : (tagPolicy.replacement_window_days ?? 7);

    const isReplStandard = standardDays.includes(String(rawReplDays));

    const isReplSelectable =
      product.replacement_selectable !== undefined && product.replacement_selectable !== null
        ? product.replacement_selectable
        : (tagPolicy.replacement_selectable ?? true);

    setFormData({
      title: product.title || "",
      description: product.description || "",
      price: product.price ? String(product.price) : "",
      sale_price: product.sale_price ? String(product.sale_price) : "",
      parent_category_id: parentId,
      subcategory_ids: allSubcatIds,
      category_id: product.category_id || "",
      store_ids: allStoreIds.length > 0 ? allStoreIds : (product.store_id ? [product.store_id] : []),
      store_id: product.store_id || "",
      sku: product.sku || "",
      stock_quantity: product.stock_quantity ? String(product.stock_quantity) : "0",
      status: product.status || "active",
      display_style: product.display_style || "standard",
      tax_rate: product.tax_rate !== null && product.tax_rate !== undefined ? String(product.tax_rate) : "",
      delivery_fee: product.delivery_fee !== null && product.delivery_fee !== undefined ? String(product.delivery_fee) : "",
      return_allowed: isRetAllowed,
      return_window_days: isRetStandard ? String(rawRetDays) : "custom",
      return_window_custom: isRetStandard ? "" : String(rawRetDays),
      replacement_allowed: isReplAllowed,
      replacement_window_days: isReplStandard ? String(rawReplDays) : "custom",
      replacement_window_custom: isReplStandard ? "" : String(rawReplDays),
      replacement_selectable: isReplSelectable,
    });

    const existingImgs: UploadedImageItem[] = (product.product_images || []).map((img) => ({
      id: img.id,
      url: img.image_url,
      isExisting: true,
    }));
    setFormImages(existingImgs);
    setIsEditModalOpen(true);

    // Also fetch any junction table assignments asynchronously to supplement tags
    (async () => {
      try {
        const [storesRes, catsRes] = await Promise.all([
          supabase.from("product_stores").select("store_id").eq("product_id", product.id),
          supabase.from("product_categories").select("category_id").eq("product_id", product.id),
        ]);

        if (storesRes.data && storesRes.data.length > 0) {
          const fetchedStoreIds = (storesRes.data as Array<{ store_id: string }>).map((r) => r.store_id);
          setFormData((prev) => ({
            ...prev,
            store_ids: Array.from(new Set([...prev.store_ids, ...fetchedStoreIds])),
          }));
        }
        if (catsRes.data && catsRes.data.length > 0) {
          const fetchedCatIds = (catsRes.data as Array<{ category_id: string }>).map((r) => r.category_id);
          setFormData((prev) => ({
            ...prev,
            subcategory_ids: Array.from(new Set([...prev.subcategory_ids, ...fetchedCatIds])),
          }));
        }
      } catch (e) {
        console.warn("Junction tables fetch fallback:", e);
      }
    })();
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

    const primarySubcat = formData.subcategory_ids.length > 0 ? formData.subcategory_ids[0] : "";
    const effectiveCatId = primarySubcat || formData.parent_category_id || formData.category_id;
    if (!effectiveCatId) {
      setFormError("Please select a category.");
      return null;
    }

    if (formData.subcategory_ids.length > 0) {
      const invalidSub = formData.subcategory_ids.find((subId) => {
        const subCat = categories.find((c) => c.id === subId);
        return !subCat || subCat.parent_id !== formData.parent_category_id;
      });
      if (invalidSub) {
        setFormError("One or more selected subcategories do not belong to the selected main category.");
        return null;
      }
    }

    const primaryStoreId = formData.store_ids.length > 0 ? formData.store_ids[0] : formData.store_id;
    if (!primaryStoreId) {
      setFormError("Please select at least one approved store.");
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
      const selectedCategory = categories.find((c) => c.id === effectiveCatId);
      
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
      effectiveCatId,
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

      const resolvedCatId = await resolveCategoryId(validated.effectiveCatId, formData.parent_category_id);
      const effectiveStoreId = formData.store_ids.length > 0 ? formData.store_ids[0] : formData.store_id;

      const finalRetDays = formData.return_window_days === "custom"
        ? Math.max(1, parseInt(formData.return_window_custom, 10) || 7)
        : parseInt(formData.return_window_days, 10) || 7;

      const finalReplDays = formData.replacement_window_days === "custom"
        ? Math.max(1, parseInt(formData.replacement_window_custom, 10) || 7)
        : parseInt(formData.replacement_window_days, 10) || 7;

      const tagsPayload: string[] = [
        ...formData.store_ids.map((id) => `store:${id}`),
        ...formData.subcategory_ids.map((id) => `subcat:${id}`),
        `policy:return=${formData.return_allowed}`,
        `policy:return_days=${finalRetDays}`,
        `policy:replace=${formData.replacement_allowed}`,
        `policy:replace_days=${finalReplDays}`,
        `policy:selectable=${formData.replacement_selectable}`,
      ];

      const slug = generateSlug(formData.title);
      const productPayload: Record<string, unknown> = {
        title: formData.title.trim(),
        slug,
        description: formData.description.trim() || null,
        price: validated.priceNum,
        sale_price: validated.salePriceNum,
        category_id: resolvedCatId,
        store_id: effectiveStoreId,
        sku: validated.finalSku,
        stock_quantity: validated.stockNum,
        status: formData.status,
        display_style: formData.display_style || "standard",
        tax_rate: formData.tax_rate.trim() !== "" ? parseFloat(formData.tax_rate) : null,
        delivery_fee: formData.delivery_fee.trim() !== "" ? parseFloat(formData.delivery_fee) : null,
        tags: tagsPayload.length > 0 ? tagsPayload : null,
        return_allowed: formData.return_allowed,
        return_window_days: finalRetDays,
        replacement_allowed: formData.replacement_allowed,
        replacement_window_days: finalReplDays,
        replacement_selectable: formData.replacement_selectable,
      };

      let insertRes = await supabase
        .from("products")
        .insert(productPayload)
        .select()
        .single();

      // Graceful fallback if display_style or policy columns not yet applied to database
      if (insertRes.error && (insertRes.error.code === "42703" || insertRes.error.message?.includes("display_style") || insertRes.error.message?.includes("return_allowed") || insertRes.error.message?.includes("replacement_"))) {
        delete productPayload.display_style;
        delete productPayload.return_allowed;
        delete productPayload.return_window_days;
        delete productPayload.replacement_allowed;
        delete productPayload.replacement_window_days;
        delete productPayload.replacement_selectable;
        insertRes = await supabase
          .from("products")
          .insert(productPayload)
          .select()
          .single();
      }

      if (insertRes.error) throw insertRes.error;
      const newProd = insertRes.data;

      if (newProd && formImages.length > 0) {
        await processAndSaveProductImages(newProd.id, formImages);
      }

      // Sync multi-store and multi-subcategory junction tables
      if (newProd) {
        try {
          if (formData.store_ids && formData.store_ids.length > 0) {
            const storeRows = formData.store_ids.map((sId) => ({
              product_id: newProd.id,
              store_id: sId,
              is_primary: sId === effectiveStoreId,
            }));
            await supabase.from("product_stores").delete().eq("product_id", newProd.id);
            await supabase.from("product_stores").upsert(storeRows);
          }
          if (formData.subcategory_ids && formData.subcategory_ids.length > 0) {
            const catRows = formData.subcategory_ids.map((cId) => ({
              product_id: newProd.id,
              category_id: cId,
              is_primary: cId === resolvedCatId,
            }));
            await supabase.from("product_categories").delete().eq("product_id", newProd.id);
            await supabase.from("product_categories").upsert(catRows);
          }
        } catch (junctionErr) {
          console.warn("Notice: product junction tables sync notice:", junctionErr);
        }
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

      const resolvedCatId = await resolveCategoryId(validated.effectiveCatId, formData.parent_category_id);
      const effectiveStoreId = formData.store_ids.length > 0 ? formData.store_ids[0] : formData.store_id;

      const finalRetDays = formData.return_window_days === "custom"
        ? Math.max(1, parseInt(formData.return_window_custom, 10) || 7)
        : parseInt(formData.return_window_days, 10) || 7;

      const finalReplDays = formData.replacement_window_days === "custom"
        ? Math.max(1, parseInt(formData.replacement_window_custom, 10) || 7)
        : parseInt(formData.replacement_window_days, 10) || 7;

      // Retain other existing tags
      const otherTags = (selectedProduct?.tags || []).filter(
        (t) => !t.startsWith("policy:") && !t.startsWith("store:") && !t.startsWith("subcat:")
      );

      const tagsPayload: string[] = [
        ...formData.store_ids.map((id) => `store:${id}`),
        ...formData.subcategory_ids.map((id) => `subcat:${id}`),
        `policy:return=${formData.return_allowed}`,
        `policy:return_days=${finalRetDays}`,
        `policy:replace=${formData.replacement_allowed}`,
        `policy:replace_days=${finalReplDays}`,
        `policy:selectable=${formData.replacement_selectable}`,
        ...otherTags,
      ];

      const productPayload: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        price: validated.priceNum,
        sale_price: validated.salePriceNum,
        category_id: resolvedCatId,
        store_id: effectiveStoreId,
        sku: validated.finalSku,
        stock_quantity: validated.stockNum,
        status: formData.status,
        display_style: formData.display_style || "standard",
        tax_rate: formData.tax_rate.trim() !== "" ? parseFloat(formData.tax_rate) : null,
        delivery_fee: formData.delivery_fee.trim() !== "" ? parseFloat(formData.delivery_fee) : null,
        tags: tagsPayload.length > 0 ? tagsPayload : null,
        return_allowed: formData.return_allowed,
        return_window_days: finalRetDays,
        replacement_allowed: formData.replacement_allowed,
        replacement_window_days: finalReplDays,
        replacement_selectable: formData.replacement_selectable,
      };

      let { error: updateErr } = await supabase
        .from("products")
        .update(productPayload)
        .eq("id", selectedProduct.id);

      // Graceful fallback if display_style or policy columns not yet applied
      if (updateErr && (updateErr.code === "42703" || updateErr.message?.includes("display_style") || updateErr.message?.includes("return_allowed") || updateErr.message?.includes("replacement_"))) {
        delete productPayload.display_style;
        delete productPayload.return_allowed;
        delete productPayload.return_window_days;
        delete productPayload.replacement_allowed;
        delete productPayload.replacement_window_days;
        delete productPayload.replacement_selectable;
        const retry = await supabase
          .from("products")
          .update(productPayload)
          .eq("id", selectedProduct.id);
        updateErr = retry.error;
      }

      if (updateErr) throw updateErr;

      await processAndSaveProductImages(selectedProduct.id, formImages);

      // Sync multi-store and multi-subcategory junction tables
      try {
        if (formData.store_ids && formData.store_ids.length > 0) {
          const storeRows = formData.store_ids.map((sId) => ({
            product_id: selectedProduct.id,
            store_id: sId,
            is_primary: sId === effectiveStoreId,
          }));
          await supabase.from("product_stores").delete().eq("product_id", selectedProduct.id);
          await supabase.from("product_stores").upsert(storeRows);
        }
        if (formData.subcategory_ids && formData.subcategory_ids.length > 0) {
          const catRows = formData.subcategory_ids.map((cId) => ({
            product_id: selectedProduct.id,
            category_id: cId,
            is_primary: cId === resolvedCatId,
          }));
          await supabase.from("product_categories").delete().eq("product_id", selectedProduct.id);
          await supabase.from("product_categories").upsert(catRows);
        }
      } catch (junctionErr) {
        console.warn("Notice: product junction tables sync notice:", junctionErr);
      }

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

  const handleQuickUpdateStyle = async (productId: string, newStyle: string) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ display_style: newStyle })
        .eq("id", productId);

      if (error && (error.code === "42703" || error.message?.includes("display_style"))) {
        // Migration not yet run in remote DB; update locally in state
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, display_style: newStyle } : p))
        );
        addToast({
          title: "Display Style Selected",
          description: `Grid style updated to ${newStyle.toUpperCase()} (schema migration pending).`,
          type: "info",
        });
        return;
      }

      if (error) throw error;

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, display_style: newStyle } : p))
      );
      addToast({
        title: "Display Style Updated",
        description: `Customer card style set to ${newStyle.toUpperCase()}.`,
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update display style.";
      addToast({ title: "Update Failed", description: msg, type: "error" });
    }
  };

  const handleApproveProduct = async (product: ProductItem) => {
    setIsSubmittingModeration(true);
    try {
      const updateData: Record<string, unknown> = {
        status: "active",
        display_style: approvalDisplayStyle || product.display_style || "standard",
      };

      let { error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", product.id);

      if (error && (error.code === "42703" || error.message?.includes("display_style"))) {
        delete updateData.display_style;
        const retry = await supabase.from("products").update(updateData).eq("id", product.id);
        error = retry.error;
      }

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
        description: `"${product.title}" is now active and published with ${approvalDisplayStyle.toUpperCase()} style.`,
        type: "success",
      });

      setIsApproveModalOpen(false);
      setModerationProduct(null);
      if (previewProduct?.id === product.id) {
        setPreviewProduct((prev) => (prev ? { ...prev, status: "active", display_style: approvalDisplayStyle } : null));
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
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (p.title || "").toLowerCase().includes(term) ||
      (p.sku || "").toLowerCase().includes(term) ||
      (p.categories?.name || "").toLowerCase().includes(term) ||
      (p.stores?.name || "").toLowerCase().includes(term);
    const matchesStatus = statusTab === "all" || p.status === statusTab;
    const matchesStore = storeFilter === "all" || p.store_id === storeFilter;
    return matchesSearch && matchesStatus && matchesStore;
  });

  const pendingCount = products.filter((p) => p.status === "pending_review").length;
  const activeCount = products.filter((p) => p.status === "active").length;
  const rejectedCount = products.filter((p) => p.status === "rejected").length;
  const draftCount = products.filter((p) => p.status === "draft").length;

  const renderCategoryAndStoreFields = () => {
    const parent = categories.find((c) => c.id === formData.parent_category_id);
    const allSubs = formData.parent_category_id ? getSubcategories(formData.parent_category_id) : [];
    const filteredSubs = allSubs.filter((s) =>
      s.name.toLowerCase().includes(subcatSearch.toLowerCase())
    );

    const eligibleStores = stores.filter(
      (s) => s.status === "approved" || formData.store_ids.includes(s.id) || formData.store_id === s.id
    );
    const filteredStores = eligibleStores.filter((s) =>
      s.name.toLowerCase().includes(storeSearch.toLowerCase())
    );

    return (
      <div className="space-y-4">
        {/* 1. Main Category & Multi-Select Subcategories */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Main Category *
            </label>
            <select
              required
              value={formData.parent_category_id}
              onChange={(e) => {
                const newParent = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  parent_category_id: newParent,
                  subcategory_ids: [],
                  category_id: newParent,
                }));
                setShowAddSubcat(false);
              }}
              disabled={isMetaLoading}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs sm:text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            >
              <option value="">{isMetaLoading ? "Loading categories..." : "Select Main Category"}</option>
              {parentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!isMetaLoading && parentCategories.length === 0 && (
              <span className="text-[11px] text-amber-600 mt-1 block">No categories found.</span>
            )}
          </div>

          {/* Subcategories Multi-Select Box */}
          {formData.parent_category_id && (
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Subcategories (Multi-Select)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Assign one or more subcategories under {parent?.name || "this department"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddSubcat(!showAddSubcat)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors shrink-0"
                >
                  {showAddSubcat ? "Cancel" : "+ Add Custom Subcategory"}
                </button>
              </div>

              {/* Search Bar for Subcategories */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subcategories..."
                  value={subcatSearch}
                  onChange={(e) => setSubcatSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Subcategories Checkbox List */}
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white p-1">
                {filteredSubs.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 text-center">
                    {subcatSearch
                      ? "No matching subcategories."
                      : "No subcategories found. Click '+ Add Custom Subcategory' above."}
                  </p>
                ) : (
                  filteredSubs.map((sub) => {
                    const isSelected = formData.subcategory_ids.includes(sub.id);
                    const isPrimary = formData.subcategory_ids[0] === sub.id;
                    return (
                      <label
                        key={sub.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData((prev) => ({
                                  ...prev,
                                  subcategory_ids: [...prev.subcategory_ids, sub.id],
                                  category_id: prev.subcategory_ids.length === 0 ? sub.id : prev.category_id,
                                }));
                              } else {
                                setFormData((prev) => {
                                  const next = prev.subcategory_ids.filter((id) => id !== sub.id);
                                  return {
                                    ...prev,
                                    subcategory_ids: next,
                                    category_id: next[0] || prev.parent_category_id,
                                  };
                                });
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-semibold text-slate-800">{sub.name}</span>
                        </div>
                        {isPrimary && (
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            Primary
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>

              {/* Selected Subcategory Badges */}
              {formData.subcategory_ids.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {formData.subcategory_ids.map((subId, idx) => {
                    const subObj = allSubs.find((s) => s.id === subId);
                    return (
                      <span
                        key={subId}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"
                      >
                        <span>{subObj?.name || subId}</span>
                        {idx === 0 && <span className="text-[10px] font-extrabold text-blue-900">(Primary)</span>}
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => {
                              const next = prev.subcategory_ids.filter((id) => id !== subId);
                              return {
                                ...prev,
                                subcategory_ids: next,
                                category_id: next[0] || prev.parent_category_id,
                              };
                            });
                          }}
                          className="hover:text-red-600 text-slate-500 transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  No subcategory selected. Product will belong directly to the primary category.
                </p>
              )}

              {/* Inline Quick Add Subcategory Box */}
              {showAddSubcat && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <input
                    type="text"
                    placeholder="New subcategory name..."
                    value={newSubcatName}
                    onChange={(e) => setNewSubcatName(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!newSubcatName.trim() || isCreatingSubcat}
                    onClick={() => handleCreateSubcategory(formData.parent_category_id)}
                    className="text-xs shrink-0"
                  >
                    {isCreatingSubcat ? "Adding..." : "Add"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Store / Vendor Multi-Store Selector */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Store / Vendor (Multi-Store Assignment) *
              </label>
              <p className="text-[11px] text-slate-500">
                Assign to a single store or multiple participating stores
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const eligibleIds = eligibleStores.map((s) => s.id);
                  setFormData((prev) => ({
                    ...prev,
                    store_ids: prev.store_ids.length === eligibleIds.length ? [] : eligibleIds,
                    store_id: eligibleIds[0] || "",
                  }));
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
              >
                {formData.store_ids.length > 0 && formData.store_ids.length === eligibleStores.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
              {formData.store_ids.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      store_ids: [],
                      store_id: "",
                    }))
                  }
                  className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Store Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search approved stores..."
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Store Checkbox List */}
          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white p-1">
            {filteredStores.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 text-center">
                {storeSearch ? "No matching stores found." : "No approved stores available."}
              </p>
            ) : (
              filteredStores.map((store) => {
                const isSelected = formData.store_ids.includes(store.id);
                const isPrimary = formData.store_ids[0] === store.id;
                return (
                  <label
                    key={store.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData((prev) => ({
                              ...prev,
                              store_ids: [...prev.store_ids, store.id],
                              store_id: prev.store_ids.length === 0 ? store.id : prev.store_id,
                            }));
                          } else {
                            setFormData((prev) => {
                              const next = prev.store_ids.filter((id) => id !== store.id);
                              return {
                                ...prev,
                                store_ids: next,
                                store_id: next[0] || "",
                              };
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold text-slate-800">{store.name}</span>
                      {store.status && store.status !== "approved" && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          {store.status}
                        </span>
                      )}
                    </div>
                    {isPrimary && (
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        Primary Store
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {/* Selected Store Badges & Counter */}
          {formData.store_ids.length > 0 ? (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Selected: <strong>{formData.store_ids.length}</strong> store(s)</span>
                <span className="text-[10px] text-slate-400">First selected is Primary</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {formData.store_ids.map((storeId, idx) => {
                  const storeObj = stores.find((s) => s.id === storeId);
                  return (
                    <span
                      key={storeId}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"
                    >
                      <Store className="w-3 h-3 text-emerald-700" />
                      <span>{storeObj?.name || storeId}</span>
                      {idx === 0 && <span className="text-[10px] font-extrabold text-emerald-950">(Primary)</span>}
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => {
                            const next = prev.store_ids.filter((id) => id !== storeId);
                            return {
                              ...prev,
                              store_ids: next,
                              store_id: next[0] || "",
                            };
                          });
                        }}
                        className="hover:text-red-600 text-slate-500 transition-colors ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-red-600 font-semibold">
              * Please select at least one store to assign this product.
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderReturnReplacementPolicyFields = () => {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Return & Replacement Policy
            </h4>
            <p className="text-[11px] text-slate-500">
              Admin authoritative settings for customer return & replacement eligibility.
            </p>
          </div>

          {/* Live Preview Mode Badge */}
          <div className="text-right">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black tracking-wide ${
                formData.return_allowed && formData.replacement_allowed
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : formData.return_allowed
                  ? "bg-blue-100 text-blue-800 border border-blue-300"
                  : formData.replacement_allowed
                  ? "bg-purple-100 text-purple-800 border border-purple-300"
                  : "bg-slate-200 text-slate-700 border border-slate-300"
              }`}
            >
              {formData.return_allowed && formData.replacement_allowed
                ? "ALL (Return + Replacement)"
                : formData.return_allowed
                ? "RETURN ONLY"
                : formData.replacement_allowed
                ? "REPLACEMENT ONLY"
                : "NONE"}
            </span>
          </div>
        </div>

        {/* Return Policy Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-slate-700 block">Return Allowed</label>
              <span className="text-[10px] text-slate-500">Can customer return for refund?</span>
            </div>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, return_allowed: !prev.return_allowed }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.return_allowed ? "bg-accent" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  formData.return_allowed ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {formData.return_allowed && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Return Window</label>
              <div className="flex gap-2">
                <select
                  value={formData.return_window_days}
                  onChange={(e) => setFormData((prev) => ({ ...prev, return_window_days: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="1">1 Day</option>
                  <option value="3">3 Days</option>
                  <option value="5">5 Days</option>
                  <option value="7">7 Days</option>
                  <option value="10">10 Days</option>
                  <option value="15">15 Days</option>
                  <option value="30">30 Days</option>
                  <option value="custom">Custom</option>
                </select>
                {formData.return_window_days === "custom" && (
                  <input
                    type="number"
                    min="1"
                    placeholder="Days"
                    value={formData.return_window_custom}
                    onChange={(e) => setFormData((prev) => ({ ...prev, return_window_custom: e.target.value }))}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Replacement Policy Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-slate-700 block">Replacement Allowed</label>
              <span className="text-[10px] text-slate-500">Can customer replace this item?</span>
            </div>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, replacement_allowed: !prev.replacement_allowed }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.replacement_allowed ? "bg-accent" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  formData.replacement_allowed ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {formData.replacement_allowed && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Replacement Window</label>
              <div className="flex gap-2">
                <select
                  value={formData.replacement_window_days}
                  onChange={(e) => setFormData((prev) => ({ ...prev, replacement_window_days: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="1">1 Day</option>
                  <option value="3">3 Days</option>
                  <option value="5">5 Days</option>
                  <option value="7">7 Days</option>
                  <option value="10">10 Days</option>
                  <option value="15">15 Days</option>
                  <option value="30">30 Days</option>
                  <option value="custom">Custom</option>
                </select>
                {formData.replacement_window_days === "custom" && (
                  <input
                    type="number"
                    min="1"
                    placeholder="Days"
                    value={formData.replacement_window_custom}
                    onChange={(e) => setFormData((prev) => ({ ...prev, replacement_window_custom: e.target.value }))}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Replacement Catalog Selectability */}
        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <label className="text-xs font-bold text-slate-700 block">
              Replacement Catalog (Can this product be selected as a replacement?)
            </label>
            <span className="text-[10px] text-slate-500">
              Controls whether this product appears in other customers&apos; replacement catalogs.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, replacement_selectable: !prev.replacement_selectable }))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.replacement_selectable ? "bg-emerald-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.replacement_selectable ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Live Summary Preview Bar */}
        <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[11px] flex flex-wrap items-center gap-3">
          <span>
            Return:{" "}
            <strong>
              {formData.return_allowed
                ? `✓ Allowed (${formData.return_window_days === "custom" ? formData.return_window_custom || "7" : formData.return_window_days} Days)`
                : "✕ Disabled"}
            </strong>
          </span>
          <span>•</span>
          <span>
            Replacement:{" "}
            <strong>
              {formData.replacement_allowed
                ? `✓ Allowed (${formData.replacement_window_days === "custom" ? formData.replacement_window_custom || "7" : formData.replacement_window_days} Days)`
                : "✕ Disabled"}
            </strong>
          </span>
          <span>•</span>
          <span>
            Catalog:{" "}
            <strong>{formData.replacement_selectable ? "✓ Selectable" : "✕ Excluded"}</strong>
          </span>
        </div>
      </div>
    );
  };

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
                <th className="px-4 py-3 text-center">Display Style</th>
                <th className="px-4 py-3 text-center">Policy</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-4">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
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
                    <td className="px-4 py-4 text-center">
                      <select
                        value={product.display_style || "standard"}
                        onChange={(e) => handleQuickUpdateStyle(product.id, e.target.value)}
                        className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-800 hover:border-accent focus:ring-1 focus:ring-accent cursor-pointer"
                        title="Change Customer Display Style"
                      >
                        <option value="standard">Standard</option>
                        <option value="compact">Compact</option>
                        <option value="deal">Deal</option>
                        <option value="featured">Featured</option>
                        <option value="horizontal">Horizontal</option>
                        <option value="minimal">Minimal</option>
                      </select>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {(() => {
                        const pol = evaluateProductReturnPolicy({
                          categoryId: product.category_id,
                          categorySlug: product.categories?.name,
                          tags: product.tags,
                          return_allowed: product.return_allowed,
                          return_window_days: product.return_window_days,
                          replacement_allowed: product.replacement_allowed,
                          replacement_window_days: product.replacement_window_days,
                          replacement_selectable: product.replacement_selectable,
                        });
                        return (
                          <div className="inline-flex flex-col items-center">
                            <span className="font-bold text-slate-800 text-[11px]">
                              {pol.mode === "ALL"
                                ? `${pol.returnWindowDays}D / ${pol.replacementWindowDays}D`
                                : pol.mode === "RETURN_ONLY"
                                ? `Return ${pol.returnWindowDays}D`
                                : pol.mode === "REPLACEMENT_ONLY"
                                ? `Repl ${pol.replacementWindowDays}D`
                                : "-"}
                            </span>
                            {pol.isReplacementSelectable && (
                              <span className="text-[10px] text-emerald-600 font-semibold">
                                Selectable
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {product.status === "pending_review" && (
                          <>
                            <button
                              onClick={() => {
                                setModerationProduct(product);
                                setApprovalDisplayStyle(product.display_style || "standard");
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

          {renderCategoryAndStoreFields()}

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

          {/* Customer Display Style */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Customer Display Style (Grid Card Style)
            </label>
            <select
              value={formData.display_style}
              onChange={(e) => setFormData({ ...formData, display_style: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            >
              <option value="standard">Standard (Default Marketplace Card)</option>
              <option value="compact">Compact (Dense Grid / Mobile Optimized)</option>
              <option value="deal">Deal (Promotional Offer / Highlighted Savings)</option>
              <option value="featured">Featured (Large Visual / Curated Section)</option>
              <option value="horizontal">Horizontal (Wide Row Layout)</option>
              <option value="minimal">Minimal (Image-First / Clean Metadata)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Controls visual presentation on storefront grids (e.g. deals, hero features, compact lists).
            </p>
          </div>

          {renderReturnReplacementPolicyFields()}

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

          {renderCategoryAndStoreFields()}

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

          {/* Customer Display Style */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Customer Display Style (Grid Card Style)
            </label>
            <select
              value={formData.display_style}
              onChange={(e) => setFormData({ ...formData, display_style: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            >
              <option value="standard">Standard (Default Marketplace Card)</option>
              <option value="compact">Compact (Dense Grid / Mobile Optimized)</option>
              <option value="deal">Deal (Promotional Offer / Highlighted Savings)</option>
              <option value="featured">Featured (Large Visual / Curated Section)</option>
              <option value="horizontal">Horizontal (Wide Row Layout)</option>
              <option value="minimal">Minimal (Image-First / Clean Metadata)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Controls visual presentation on storefront grids (e.g. deals, hero features, compact lists).
            </p>
          </div>

          {renderReturnReplacementPolicyFields()}

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

          <div className="pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Customer Display Style (Grid Card Style)
            </label>
            <select
              value={approvalDisplayStyle}
              onChange={(e) => setApprovalDisplayStyle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
            >
              <option value="standard">Standard (Default Marketplace Card)</option>
              <option value="compact">Compact (Dense Grid / Mobile Optimized)</option>
              <option value="deal">Deal (Promotional Offer / Highlighted Savings)</option>
              <option value="featured">Featured (Large Visual / Curated Section)</option>
              <option value="horizontal">Horizontal (Wide Row Layout)</option>
              <option value="minimal">Minimal (Image-First / Clean Metadata)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Admin can configure or change the customer card layout style before publishing.
            </p>
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
                <div>
                  <span className="text-slate-400 block">Display Style</span>
                  <span className="font-bold text-slate-800 capitalize">
                    {previewProduct.display_style || "Standard"}
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
                        setApprovalDisplayStyle(previewProduct.display_style || "standard");
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

