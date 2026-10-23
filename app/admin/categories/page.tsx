"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Loader2,
  Save,
  Upload,
  Image as ImageIcon,
  FolderTree,
  Layers,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { validateStorageFile, generateSafeFileName, getPublicStorageUrl } from "@/lib/storage";

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  icon?: string | null;
  parent_id?: string | null;
  tax_rate?: number | null;
  is_active?: boolean;
  sort_order?: number;
  created_at: string;
}

export default function AdminCategoriesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "main" | "sub">("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubcategoryModal, setIsSubcategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    parent_id: "",
    icon: "",
    description: "",
    tax_rate: "",
    image_url: "",
    is_active: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      if (data) {
        setCategories(
          (data as Array<{
            id: string;
            name: string;
            slug: string;
            description?: string | null;
            image_url?: string | null;
            icon?: string | null;
            parent_id?: string | null;
            is_active?: boolean;
            sort_order?: number;
            tax_rate?: number | null;
            created_at?: string;
          }>).map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description || null,
            image_url: c.image_url || null,
            icon: c.icon || null,
            parent_id: c.parent_id || null,
            is_active: c.is_active !== false,
            sort_order: c.sort_order || 0,
            tax_rate: c.tax_rate !== null && c.tax_rate !== undefined ? Number(c.tax_rate) : null,
            created_at: c.created_at || new Date().toISOString(),
          }))
        );
      }
    } catch (err: unknown) {
      console.error("Failed to load categories:", err);
      addToast({
        title: "Error Loading Categories",
        description: err instanceof Error ? err.message : "Failed to load categories.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, addToast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const mainCategories = useMemo(() => {
    return categories.filter((c) => !c.parent_id);
  }, [categories]);

  const subcategories = useMemo(() => {
    return categories.filter((c) => Boolean(c.parent_id));
  }, [categories]);

  const handleOpenAddMainModal = () => {
    setEditingCategory(null);
    setIsSubcategoryModal(false);
    setFormData({
      name: "",
      slug: "",
      parent_id: "",
      icon: "",
      description: "",
      tax_rate: "",
      image_url: "",
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenAddSubModal = (defaultParentId?: string) => {
    setEditingCategory(null);
    setIsSubcategoryModal(true);
    setFormData({
      name: "",
      slug: "",
      parent_id: defaultParentId || (mainCategories[0]?.id || ""),
      icon: "",
      description: "",
      tax_rate: "",
      image_url: "",
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setIsSubcategoryModal(Boolean(cat.parent_id));
    setFormData({
      name: cat.name || "",
      slug: cat.slug || "",
      parent_id: cat.parent_id || "",
      icon: cat.icon || "",
      description: cat.description || "",
      tax_rate: cat.tax_rate !== null && cat.tax_rate !== undefined ? String(cat.tax_rate) : "",
      image_url: cat.image_url || "",
      is_active: cat.is_active !== false,
    });
    setIsModalOpen(true);
  };

  const handleUploadCategoryImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const validation = validateStorageFile(
      { name: file.name, size: file.size, type: file.type },
      "category-images"
    );

    if (!validation.valid) {
      addToast({
        title: "Validation error",
        description: validation.error || "File violates category-images policy.",
        type: "error",
      });
      return;
    }

    setIsUploadingImage(true);
    const safeName = generateSafeFileName(file.name, isSubcategoryModal ? "subcat" : "category");

    const { error: uploadError } = await supabase.storage
      .from("category-images")
      .upload(safeName, file, {
        contentType: file.type,
        upsert: false,
      });

    setIsUploadingImage(false);

    if (uploadError) {
      addToast({ title: "Upload failed", description: uploadError.message, type: "error" });
    } else {
      const publicUrl = getPublicStorageUrl("category-images", safeName);
      setFormData((prev) => ({ ...prev, image_url: publicUrl }));
      addToast({ title: "Image uploaded to category-images", type: "success" });
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (isSubcategoryModal && !formData.parent_id) {
      addToast({
        title: "Parent Category Required",
        description: "Please select a parent department for this subcategory.",
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const baseSlug = (formData.slug.trim() || formData.name.trim())
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        slug: editingCategory ? (formData.slug.trim() || editingCategory.slug) : baseSlug,
        description: formData.description.trim() || null,
        image_url: formData.image_url.trim() || null,
        parent_id: isSubcategoryModal ? formData.parent_id : null,
        is_active: formData.is_active,
      };

      if (formData.icon.trim()) {
        payload.icon = formData.icon.trim();
      }

      if (!isSubcategoryModal && formData.tax_rate.trim() !== "") {
        payload.tax_rate = parseFloat(formData.tax_rate);
      }

      if (editingCategory) {
        let { error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", editingCategory.id);

        // Fallback if icon or is_active column not yet migrated
        if (error && (error.code === "42703" || error.message?.includes("icon") || error.message?.includes("is_active"))) {
          delete payload.icon;
          delete payload.is_active;
          const retry = await supabase.from("categories").update(payload).eq("id", editingCategory.id);
          error = retry.error;
        }

        if (error) throw error;
        addToast({
          title: isSubcategoryModal ? "Subcategory Updated" : "Category Updated",
          description: `${payload.name} saved successfully.`,
          type: "success",
        });
      } else {
        let { error } = await supabase.from("categories").insert(payload);

        // Fallback if icon or is_active column not yet migrated
        if (error && (error.code === "42703" || error.message?.includes("icon") || error.message?.includes("is_active"))) {
          delete payload.icon;
          delete payload.is_active;
          const retry = await supabase.from("categories").insert(payload);
          error = retry.error;
        }

        if (error) throw error;
        addToast({
          title: isSubcategoryModal ? "Subcategory Created" : "Category Created",
          description: `${payload.name} added successfully.`,
          type: "success",
        });
      }

      setIsModalOpen(false);
      fetchCategories();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save category.";
      addToast({ title: "Save Failed", description: message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (cat: CategoryItem) => {
    const nextState = !cat.is_active;
    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: nextState })
        .eq("id", cat.id);

      if (error) throw error;
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: nextState } : c))
      );
      addToast({
        title: nextState ? "Category Enabled" : "Category Disabled",
        description: `"${cat.name}" is now ${nextState ? "visible" : "hidden"} on the storefront.`,
        type: "success",
      });
    } catch (err: unknown) {
      console.warn("Active status toggle notice:", err);
      // Local fallback if column is not yet present on remote DB
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: nextState } : c))
      );
      addToast({
        title: nextState ? "Enabled" : "Disabled",
        description: `Updated state locally for ${cat.name}.`,
        type: "info",
      });
    }
  };

  const handleDeleteCategory = async (cat: CategoryItem) => {
    const hasChildren = categories.some((c) => c.parent_id === cat.id);
    const msg = hasChildren
      ? `"${cat.name}" has subcategories. Deleting it will detach them. Are you sure?`
      : `Are you sure you want to delete "${cat.name}"?`;

    if (!window.confirm(msg)) return;

    try {
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) throw error;
      addToast({
        title: cat.parent_id ? "Subcategory Deleted" : "Category Deleted",
        description: `${cat.name} removed.`,
        type: "success",
      });
      fetchCategories();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not delete category.";
      addToast({ title: "Delete Failed", description: message, type: "error" });
    }
  };

  const filteredCategories = useMemo(() => {
    let list = categories;
    if (activeTab === "main") {
      list = categories.filter((c) => !c.parent_id);
    } else if (activeTab === "sub") {
      list = categories.filter((c) => Boolean(c.parent_id));
    }

    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.slug.toLowerCase().includes(term) ||
        (c.description || "").toLowerCase().includes(term)
    );
  }, [categories, activeTab, searchTerm]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <FolderTree className="w-6 h-6 text-indigo-600" />
            Categories & Subcategories Architecture
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative department hierarchy, storefront subcategory strips, and tax assignments.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => handleOpenAddSubModal()}
            className="flex items-center gap-2 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 border-indigo-200 text-xs font-bold"
          >
            <Plus className="w-4 h-4 text-indigo-600" /> Add Subcategory
          </Button>
          <Button
            variant="primary"
            onClick={handleOpenAddMainModal}
            className="flex items-center gap-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4" /> Add Department
          </Button>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-50/50">
          {/* Navigation Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl shrink-0">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "all"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Categories ({categories.length})
            </button>
            <button
              onClick={() => setActiveTab("main")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "main"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Departments ({mainCategories.length})
            </button>
            <button
              onClick={() => setActiveTab("sub")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "sub"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Subcategories ({subcategories.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search category name, slug or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Image / Icon</th>
                <th className="px-6 py-3.5">Category Name</th>
                <th className="px-6 py-3.5">Hierarchy Type</th>
                <th className="px-6 py-3.5">Slug</th>
                <th className="px-6 py-3.5">Subcategories</th>
                <th className="px-6 py-3.5">Tax Rate (%)</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-3">
                      <Loader2 className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading categories...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No categories found matching &quot;{searchTerm}&quot;.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => {
                  const parent = categories.find((c) => c.id === cat.parent_id);
                  const childCount = categories.filter((c) => c.parent_id === cat.id).length;
                  const isSub = Boolean(cat.parent_id);

                  return (
                    <tr
                      key={cat.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSub ? "bg-slate-50/30" : ""
                      }`}
                    >
                      {/* Image / Icon */}
                      <td className="px-6 py-3.5">
                        {cat.image_url ? (
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 bg-white p-0.5 shadow-2xs">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={cat.image_url}
                              alt={cat.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                            {cat.icon ? (
                              <span className="text-xs font-bold text-indigo-600">
                                {cat.icon.slice(0, 3)}
                              </span>
                            ) : (
                              <ImageIcon className="w-4 h-4" />
                            )}
                          </div>
                        )}
                      </td>

                      {/* Name & Description */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isSub && (
                            <span className="text-slate-300 font-normal">↳</span>
                          )}
                          <div>
                            <span className="font-bold text-slate-900 block leading-tight">
                              {cat.name}
                            </span>
                            {cat.description && (
                              <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {cat.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Hierarchy Type Badge */}
                      <td className="px-6 py-4">
                        {isSub ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Subcategory under {parent?.name || "Department"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Layers className="w-3 h-3" /> Main Department
                          </span>
                        )}
                      </td>

                      {/* Slug */}
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {cat.slug}
                      </td>

                      {/* Subcategories Count / Quick Add */}
                      <td className="px-6 py-4">
                        {!isSub ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">
                              {childCount} subcategories
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenAddSubModal(cat.id)}
                              className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              + Add
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Tax Rate */}
                      <td className="px-6 py-4">
                        {!isSub && cat.tax_rate !== null && cat.tax_rate !== undefined ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {cat.tax_rate}% GST
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Default Global</span>
                        )}
                      </td>

                      {/* Active Status */}
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(cat)}
                          className="flex items-center gap-1.5 group cursor-pointer"
                        >
                          {cat.is_active !== false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 group-hover:bg-emerald-200 transition-colors">
                              <Check className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500 group-hover:bg-slate-200 transition-colors">
                              <X className="w-3 h-3" /> Disabled
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(cat)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add or Edit Main Category or Subcategory */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingCategory
                    ? isSubcategoryModal
                      ? "Edit Subcategory"
                      : "Edit Department"
                    : isSubcategoryModal
                    ? "Add New Subcategory"
                    : "Add New Department"}
                </h2>
                <p className="text-xs text-slate-500">
                  {isSubcategoryModal
                    ? "Subcategories populate the secondary shortcut strip for their parent department."
                    : "Main departments anchor the storefront top navigation and category showcases."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              {/* Parent Category Selector (Only for subcategories) */}
              {isSubcategoryModal && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Parent Department *
                  </label>
                  <select
                    required
                    value={formData.parent_id}
                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Select Parent Department</option>
                    {mainCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {isSubcategoryModal ? "Subcategory Name *" : "Department Name *"}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    const autoSlug = newName
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/(^-|-$)+/g, "");
                    setFormData((prev) => ({
                      ...prev,
                      name: newName,
                      slug: prev.slug === "" || !editingCategory ? autoSlug : prev.slug,
                    }));
                  }}
                  placeholder={
                    isSubcategoryModal
                      ? "e.g. Rice & Dal, Birthday, Mobiles"
                      : "e.g. Grocery & Food, Cake & Bakery"
                  }
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Unique Slug
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g. rice-dal or grocery-food"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-mono text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Icon / Logo identifier */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Icon / Logo Name (Optional)
                </label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="e.g. Cake, ShoppingBag, Smartphone, or emoji"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Image Upload */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Image (Optional)
                  </label>
                  <label className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                    {isUploadingImage ? (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Upload to category-images
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      disabled={isUploadingImage}
                      onChange={handleUploadCategoryImage}
                      className="hidden"
                    />
                  </label>
                </div>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://... or click Upload above"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {formData.image_url && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image_url: "" })}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Clear Image
                    </button>
                  </div>
                )}
              </div>

              {/* Tax Rate (Main category only) */}
              {!isSubcategoryModal && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Department Tax Rate (%) (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    placeholder="e.g. 5, 12, 18 (Applied to products under this department)"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Storefront Visibility
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Enable to display this category on storefront navigation and shortcut strips.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className="text-indigo-600 focus:outline-none"
                >
                  {formData.is_active ? (
                    <ToggleRight className="w-8 h-8 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-400" />
                  )}
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Department or subcategory description..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  {editingCategory ? "Save Changes" : isSubcategoryModal ? "Create Subcategory" : "Create Department"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
