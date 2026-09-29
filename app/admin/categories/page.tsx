"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, Edit, Trash2, Loader2, Save, Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { validateStorageFile, generateSafeFileName, getPublicStorageUrl } from "@/lib/storage";

function formatDate(dateString: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  tax_rate?: number | null;
  created_at: string;
}

export default function AdminCategoriesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal & Edit State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    tax_rate: "",
    image_url: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();

  const fetchCategories = React.useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCategories(
        data.map((c: { id: string; name: string; slug: string; description?: string | null; image_url?: string | null; tax_rate?: number | null; created_at: string }) => ({
          ...c,
          image_url: c.image_url || null,
          tax_rate: c.tax_rate !== null && c.tax_rate !== undefined ? Number(c.tax_rate) : null,
        }))
      );
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setFormData({ name: "", description: "", tax_rate: "", image_url: "" });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name || "",
      description: cat.description || "",
      tax_rate: cat.tax_rate !== null && cat.tax_rate !== undefined ? String(cat.tax_rate) : "",
      image_url: cat.image_url || "",
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
    const safeName = generateSafeFileName(file.name, "category");

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

    setIsSubmitting(true);
    try {
      const slug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      const payload = {
        name: formData.name.trim(),
        slug: editingCategory ? editingCategory.slug : `${slug}-${Date.now().toString().slice(-4)}`,
        description: formData.description.trim() || null,
        image_url: formData.image_url.trim() || null,
        tax_rate: formData.tax_rate.trim() !== "" ? parseFloat(formData.tax_rate) : null,
      };

      if (editingCategory) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editingCategory.id);
        if (error) throw error;
        addToast({ title: "Category Updated", description: `${payload.name} saved successfully.`, type: "success" });
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
        addToast({ title: "Category Created", description: `${payload.name} added successfully.`, type: "success" });
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

  const handleDeleteCategory = async (cat: CategoryItem) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    try {
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) throw error;
      addToast({ title: "Category Deleted", description: `${cat.name} removed.`, type: "success" });
      fetchCategories();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not delete category.";
      addToast({ title: "Delete Failed", description: message, type: "error" });
    }
  };

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories & Tax Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Organize products into categories and set category-default tax rates.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Category
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Image</th>
                <th className="px-6 py-3.5">Category Name</th>
                <th className="px-6 py-3.5">Slug</th>
                <th className="px-6 py-3.5">Category Tax Rate (%)</th>
                <th className="px-6 py-3.5">Description</th>
                <th className="px-6 py-3.5">Created Date</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-3">
                      <Loader2 className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading categories...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No categories found matching &quot;{searchTerm}&quot;.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => (
                  <tr key={category.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5">
                      {category.image_url ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={category.image_url} alt={category.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">{category.name}</td>
                    <td className="px-6 py-4 text-slate-500">{category.slug}</td>
                    <td className="px-6 py-4">
                      {category.tax_rate !== null && category.tax_rate !== undefined ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          {category.tax_rate}% GST
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Default Global</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 line-clamp-1 max-w-xs">
                      {category.description || "-"}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{formatDate(category.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(category)}
                          className="p-1.5 text-slate-400 hover:text-accent hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {editingCategory ? "Edit Category & Tax Rate" : "Add New Category"}
            </h2>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Groceries, Electronics..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Category Image (Optional)
                  </label>
                  <label className="cursor-pointer text-xs font-semibold text-accent hover:underline flex items-center gap-1">
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
                  placeholder="https://... or upload"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                {formData.image_url && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
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

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Category Tax Rate (%) (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  placeholder="e.g. 5, 12, 18 (Applied to products under this category)"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Category description..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSubmitting}>
                  <Save className="w-4 h-4 mr-1.5" /> Save Category
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
