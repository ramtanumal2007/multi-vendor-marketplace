"use client";

import React, { useEffect, useState, useCallback } from "react";
import { 
  Plus, 
  Trash2, 
  Save, 
  Eye, 
  EyeOff, 
  Image as ImageIcon,
  Sparkles,
  Zap,
  Sliders,
  Flame,
  Upload,
  Loader2,
  ArrowUp,
  ArrowDown,
  Edit2,
  LayoutGrid,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { validateStorageFile, generateSafeFileName, getPublicStorageUrl } from "@/lib/storage";

interface HeroSlide {
  id: string;
  heading: string;
  subheading: string;
  cta_text: string;
  cta_link: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

interface SpecialCard {
  title: string;
  image: string;
  link: string;
  offer: string;
}

interface SpotlightCard {
  title: string;
  subtitle: string;
  image: string;
  link: string;
  badge: string;
  bgGradient: string;
}

interface SectionRule {
  ranking_mode?: "auto" | "discount" | "trending" | "rating" | "newest";
  max_products?: number;
  min_discount?: number;
  min_stock?: number;
  featured_product_ids?: string[];
}

export type ProductLayoutStyle =
  | "standard"
  | "compact"
  | "featured"
  | "rail"
  | "carousel"
  | "two_card"
  | "dense"
  | "editorial";

export interface CategoryLayoutConfig {
  layout_style?: ProductLayoutStyle;
  desktop_cols?: number;
  tablet_cols?: number;
  mobile_cols?: number;
  mobile_rail?: boolean;
  section_limit?: number;
  active?: boolean;
}

export interface StorefrontGridConfig {
  desktop_cols?: number;
  tablet_cols?: number;
  mobile_cols?: number;
  section_limit?: number;
  category_layouts?: Record<string, CategoryLayoutConfig>;
}

interface HomepageConfig {
  storefront_grid?: StorefrontGridConfig;
  recently_viewed?: {
    is_active: boolean;
  };
  special_collection: {
    title: string;
    subtitle: string;
    banner_url: string;
    is_active: boolean;
    cards: SpecialCard[];
  };
  in_the_spotlight: {
    title: string;
    subtitle: string;
    is_active: boolean;
    cards: SpotlightCard[];
  };
  section_rules?: Record<string, SectionRule>;
}

const ADMIN_CONFIGURABLE_CATEGORIES = [
  { key: "cake", name: "Cake & Bakery", defaultLayout: "standard" },
  { key: "grocery-food", name: "Grocery & Food", defaultLayout: "rail" },
  { key: "mens-fashion", name: "Men's Fashion", defaultLayout: "featured" },
  { key: "womens-fashion", name: "Women's Fashion", defaultLayout: "standard" },
  { key: "electronics", name: "Electronics & Gadgets", defaultLayout: "dense" },
  { key: "home-living", name: "Home & Living", defaultLayout: "two_card" },
  { key: "beauty-care", name: "Beauty & Personal Care", defaultLayout: "compact" },
  { key: "footwear", name: "Footwear", defaultLayout: "standard" },
  { key: "sports-fitness", name: "Sports & Fitness", defaultLayout: "carousel" },
];

export default function AdminHomepageManager() {
  const { addToast } = useToast();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"hero" | "campaign" | "spotlight" | "rules" | "grid">("hero");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>("cake");
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // New slide form
  const [newSlide, setNewSlide] = useState({
    heading: "",
    subheading: "",
    cta_text: "Shop Now",
    cta_link: "/products",
    image_url: "",
    sort_order: 1,
    is_active: true
  });
  const [showAddSlide, setShowAddSlide] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  // Edit slide state
  const [editingSlide, setEditingSlide] = useState<HeroSlide | null>(null);
  const [isUploadingEditBanner, setIsUploadingEditBanner] = useState(false);

  const handleUploadHeroBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const validation = validateStorageFile(
      { name: file.name, size: file.size, type: file.type },
      "promotional-banners"
    );

    if (!validation.valid) {
      addToast({
        title: "Validation error",
        description: validation.error || "File violates promotional-banners policy.",
        type: "error",
      });
      return;
    }

    setIsUploadingBanner(true);
    const safeName = generateSafeFileName(file.name, "hero");

    const { error: uploadError } = await supabase.storage
      .from("promotional-banners")
      .upload(safeName, file, {
        contentType: file.type,
        upsert: false,
      });

    setIsUploadingBanner(false);

    if (uploadError) {
      addToast({ title: "Upload failed", description: uploadError.message, type: "error" });
    } else {
      const publicUrl = getPublicStorageUrl("promotional-banners", safeName);
      setNewSlide((prev) => ({ ...prev, image_url: publicUrl }));
      addToast({ title: "Banner uploaded to promotional-banners", type: "success" });
    }
  };

  const handleUploadEditHeroBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !editingSlide) return;
    const file = e.target.files[0];

    const validation = validateStorageFile(
      { name: file.name, size: file.size, type: file.type },
      "promotional-banners"
    );

    if (!validation.valid) {
      addToast({
        title: "Validation error",
        description: validation.error || "File violates promotional-banners policy.",
        type: "error",
      });
      return;
    }

    setIsUploadingEditBanner(true);
    const safeName = generateSafeFileName(file.name, "hero");

    const { error: uploadError } = await supabase.storage
      .from("promotional-banners")
      .upload(safeName, file, {
        contentType: file.type,
        upsert: false,
      });

    setIsUploadingEditBanner(false);

    if (uploadError) {
      addToast({ title: "Upload failed", description: uploadError.message, type: "error" });
    } else {
      const publicUrl = getPublicStorageUrl("promotional-banners", safeName);
      setEditingSlide((prev) => prev ? { ...prev, image_url: publicUrl } : null);
      addToast({ title: "Edit banner uploaded to promotional-banners", type: "success" });
    }
  };

  // Campaign & Rules Config
  const [campaignConfig, setCampaignConfig] = useState<HomepageConfig>({
    recently_viewed: {
      is_active: true
    },
    storefront_grid: {
      desktop_cols: 4,
      tablet_cols: 3,
      mobile_cols: 2,
      section_limit: 8
    },
    special_collection: {
      title: "Festival & Special Collection",
      subtitle: "Curated gifts, apparel & festive essentials for the season",
      banner_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=1600&auto=format&fit=crop",
      is_active: true,
      cards: [
        { title: "Rakhi & Festive Gifts", image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=500&q=80", link: "/categories/hand-craft", offer: "Up to 40% OFF" },
        { title: "Gifts & Hampers", image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500&q=80", link: "/categories/accessories", offer: "Special Bundles" },
        { title: "Sweets & Chocolates", image: "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=500&q=80", link: "/categories/grocery-food", offer: "Fresh Stock" },
        { title: "Watches & Accessories", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80", link: "/categories/accessories", offer: "Min 30% OFF" }
      ]
    },
    in_the_spotlight: {
      title: "In The Spotlight",
      subtitle: "Handpicked deals across top marketplace categories",
      is_active: true,
      cards: [
        { title: "Beauty & Grooming Sale", subtitle: "Skincare & Personal Care", image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80", link: "/categories/beauty-care", badge: "Up to 50% OFF", bgGradient: "from-pink-600 to-rose-400" },
        { title: "Electronics Mega Event", subtitle: "Smartphones & Gadgets", image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&q=80", link: "/categories/electronics", badge: "Hot Deals", bgGradient: "from-blue-600 to-cyan-500" }
      ]
    },
    section_rules: {
      deals: { max_products: 10, min_discount: 5, min_stock: 1, ranking_mode: "discount" },
      trending: { max_products: 10, min_stock: 1, ranking_mode: "trending" },
      top_selection: { max_products: 8, min_stock: 1, ranking_mode: "rating" }
    }
  });

  const fetchData = useCallback(async () => {
    try {
      const [heroApiRes, configRes] = await Promise.all([
        fetch("/api/admin/hero-slides")
          .then((r) => r.json())
          .catch(() => null),
        supabase.from("page_seo").select("meta_description").eq("page_slug", "homepage_config").single()
      ]);

      if (heroApiRes?.success && Array.isArray(heroApiRes.slides)) {
        setHeroSlides(heroApiRes.slides);
      } else {
        const { data: dbSlides } = await supabase.from("hero_slides").select("*").order("sort_order", { ascending: true });
        if (dbSlides) setHeroSlides(dbSlides);
      }

      if (configRes.data?.meta_description) {
        try {
          const parsed = JSON.parse(configRes.data.meta_description);
          setCampaignConfig((prev) => ({
            ...prev,
            ...parsed,
            recently_viewed: parsed.recently_viewed ?? prev.recently_viewed ?? { is_active: true },
            storefront_grid: parsed.storefront_grid || prev.storefront_grid,
            section_rules: parsed.section_rules || prev.section_rules
          }));
        } catch (e) {
          console.error("Error parsing campaign config:", e);
        }
      }
    } catch (err) {
      console.error("Error in fetchData:", err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle slide active state via server-side Admin API
  async function toggleSlideActive(id: string, currentStatus: boolean) {
    const newStatus = !currentStatus;
    try {
      const res = await fetch("/api/admin/hero-slides", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: newStatus }),
      });
      const result = await res.json();
      if (!res.ok || !result.success || !result.slide) {
        throw new Error(result.error || "Failed to update slide status");
      }
      // Authoritative UI update strictly from returned DB record
      setHeroSlides((prev) =>
        prev.map((s) => (s.id === id ? result.slide : s))
      );
      addToast({
        title: `Banner ${result.slide.is_active ? "Activated" : "Deactivated"}`,
        description: `Banner is now ${result.slide.is_active ? "Active" : "Inactive"}.`,
        type: "success",
      });
    } catch (err: unknown) {
      console.error("Toggle error:", err);
      const msg = err instanceof Error ? err.message : "Database update failed. Visual state reverted.";
      addToast({
        title: "Failed to update banner status",
        description: msg,
        type: "error",
      });
      fetchData();
    }
  }

  // Add new hero slide via server-side Admin API
  async function handleAddSlide(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlide.heading || !newSlide.image_url) {
      addToast({ title: "Heading and image URL are required", type: "error" });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/hero-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSlide),
      });
      const result = await res.json();
      if (!res.ok || !result.success || !result.slide) {
        throw new Error(result.error || "Failed to add slide");
      }
      addToast({ title: "Hero slide added successfully", type: "success" });
      setHeroSlides((prev) => [...prev, result.slide]);
      setShowAddSlide(false);
      setNewSlide({
        heading: "",
        subheading: "",
        cta_text: "Shop Now",
        cta_link: "/products",
        image_url: "",
        sort_order: heroSlides.length + 1,
        is_active: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add slide";
      addToast({ title: "Failed to add slide", description: msg, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  // Delete slide via server-side Admin API
  async function handleDeleteSlide(id: string) {
    if (!confirm("Are you sure you want to delete this slide?")) return;

    try {
      const res = await fetch(`/api/admin/hero-slides?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to delete slide");
      }
      addToast({ title: "Slide deleted", type: "success" });
      setHeroSlides((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete slide";
      addToast({ title: "Failed to delete slide", description: msg, type: "error" });
    }
  }

  // Update existing hero slide via server-side Admin API
  async function handleUpdateSlide(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSlide || !editingSlide.heading || !editingSlide.image_url) {
      addToast({ title: "Heading and image URL are required", type: "error" });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/hero-slides", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingSlide),
      });
      const result = await res.json();
      if (!res.ok || !result.success || !result.slide) {
        throw new Error(result.error || "Failed to update slide");
      }
      addToast({ title: "Hero slide updated successfully", type: "success" });
      setHeroSlides((prev) =>
        prev.map((s) => (s.id === editingSlide.id ? result.slide : s))
      );
      setEditingSlide(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update slide";
      addToast({ title: "Failed to update slide", description: msg, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  // Reorder slide via server-side Admin API
  async function handleMoveSlide(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= heroSlides.length) return;

    const current = heroSlides[index];
    const neighbor = heroSlides[targetIndex];

    const newCurrentOrder = neighbor.sort_order;
    const newNeighborOrder =
      current.sort_order === neighbor.sort_order
        ? direction === "up"
          ? neighbor.sort_order - 1
          : neighbor.sort_order + 1
        : current.sort_order;

    try {
      const res = await fetch("/api/admin/hero-slides", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reorder: [
            { id: current.id, sort_order: newCurrentOrder },
            { id: neighbor.id, sort_order: newNeighborOrder },
          ],
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to reorder slides");
      }
      addToast({ title: "Slide reordered successfully", type: "success" });
      if (result.slides) {
        setHeroSlides(result.slides);
      } else {
        fetchData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reorder slides";
      addToast({ title: "Failed to reorder slides", description: msg, type: "error" });
    }
  }

  // Save Campaign & Merchandising Config safely into page_seo, preserving unrelated live server keys
  async function handleSaveConfig() {
    setIsSaving(true);
    try {
      const { data: latestRecord } = await supabase
        .from("page_seo")
        .select("meta_description")
        .eq("page_slug", "homepage_config")
        .single();

      let liveParsed: Record<string, unknown> = {};
      if (latestRecord?.meta_description) {
        try {
          liveParsed = JSON.parse(latestRecord.meta_description);
        } catch (e) {
          console.error("Failed to parse live config:", e);
        }
      }

      // Preserve all live keys, layering local form state on top
      const mergedConfig = {
        ...liveParsed,
        ...campaignConfig,
      };

      const { error } = await supabase.from("page_seo").upsert(
        [
          {
            page_slug: "homepage_config",
            meta_title: "Homepage Configuration",
            meta_description: JSON.stringify(mergedConfig)
          }
        ],
        { onConflict: "page_slug" }
      );

      if (error) throw error;
      addToast({ title: "Homepage configuration & Merchandising Rules saved!", type: "success" });
    } catch (err: unknown) {
      console.error("Save config error:", err);
      const msg = err instanceof Error ? err.message : "Failed to save configuration";
      addToast({ title: "Failed to save configuration", description: msg, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  // Toggle Recently Viewed section independently, mutating ONLY recently_viewed and preserving 100% of live keys
  async function handleToggleRecentlyViewed(newIsActive: boolean) {
    setIsSaving(true);
    try {
      const { data: latestRecord, error: fetchErr } = await supabase
        .from("page_seo")
        .select("meta_description")
        .eq("page_slug", "homepage_config")
        .single();

      if (fetchErr && fetchErr.code !== "PGRST116") {
        throw fetchErr;
      }

      let liveConfig: Record<string, unknown> = {};
      if (latestRecord?.meta_description) {
        try {
          liveConfig = JSON.parse(latestRecord.meta_description);
        } catch (e) {
          console.error("Error parsing live config:", e);
        }
      }

      const existingRecentlyViewed =
        typeof liveConfig.recently_viewed === "object" && liveConfig.recently_viewed !== null
          ? (liveConfig.recently_viewed as Record<string, unknown>)
          : {};

      liveConfig.recently_viewed = {
        ...existingRecentlyViewed,
        is_active: newIsActive,
      };

      const { error: upsertErr } = await supabase.from("page_seo").upsert(
        [
          {
            page_slug: "homepage_config",
            meta_title: "Homepage Configuration",
            meta_description: JSON.stringify(liveConfig),
          }
        ],
        { onConflict: "page_slug" }
      );

      if (upsertErr) throw upsertErr;

      setCampaignConfig((prev) => ({
        ...prev,
        recently_viewed: { is_active: newIsActive },
      }));

      addToast({
        title: `Recently Viewed Section ${newIsActive ? "Enabled" : "Disabled"}`,
        type: "success",
      });
    } catch (err: unknown) {
      console.error("Toggle Recently Viewed error:", err);
      const msg = err instanceof Error ? err.message : "Failed to toggle setting";
      addToast({
        title: "Failed to update Recently Viewed setting",
        description: msg,
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Homepage Control & Merchandising</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage live hero slides, festival campaigns, and section merchandising rules safely in Supabase
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="bg-accent text-white hover:bg-accent/90 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Config to Live DB"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("hero")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === "hero"
              ? "border-accent text-accent"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Hero Banners ({heroSlides.length})
        </button>
        <button
          onClick={() => setActiveTab("grid")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === "grid"
              ? "border-accent text-accent"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <LayoutGrid className="w-4 h-4 text-purple-500" /> Storefront Grid & Layout
        </button>
        <button
          onClick={() => setActiveTab("campaign")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === "campaign"
              ? "border-accent text-accent"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" /> Special Festival Campaign
        </button>
        <button
          onClick={() => setActiveTab("spotlight")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === "spotlight"
              ? "border-accent text-accent"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Zap className="w-4 h-4 text-blue-500" /> Spotlight Offers
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === "rules"
              ? "border-accent text-accent"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sliders className="w-4 h-4 text-emerald-500" /> Merchandising & Ranking Rules
        </button>
      </div>

      {/* TAB 1: HERO SLIDES */}
      {activeTab === "hero" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-sm font-bold text-slate-700">Active Live Hero Banners</span>
            <Button
              onClick={() => setShowAddSlide(!showAddSlide)}
              className="bg-slate-900 text-white hover:bg-slate-800 text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> {showAddSlide ? "Cancel" : "Add Hero Slide"}
            </Button>
          </div>

          {/* Add Slide Form */}
          {showAddSlide && (
            <form onSubmit={handleAddSlide} className="bg-white p-6 rounded-xl border border-accent/20 shadow-md space-y-4">
              <h3 className="text-base font-bold text-slate-900">Add New Hero Banner</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Main Heading</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Diwali Mega Electronics Sale"
                    value={newSlide.heading}
                    onChange={(e) => setNewSlide({ ...newSlide, heading: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subheading</label>
                  <input
                    type="text"
                    placeholder="e.g. Get up to 60% OFF on premium gadgets"
                    value={newSlide.subheading}
                    onChange={(e) => setNewSlide({ ...newSlide, subheading: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Image URL or Upload</label>
                    <label className="cursor-pointer text-xs font-semibold text-accent hover:underline flex items-center gap-1">
                      {isUploadingBanner ? (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Upload to promotional-banners
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={isUploadingBanner}
                        onChange={handleUploadHeroBanner}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <input
                    type="url"
                    required
                    placeholder="https://... or uploaded image URL"
                    value={newSlide.image_url}
                    onChange={(e) => setNewSlide({ ...newSlide, image_url: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
                  {newSlide.image_url && (
                    <div className="mt-2 relative w-24 h-14 rounded-lg overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newSlide.image_url} alt="Banner Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CTA Text & Link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Shop Now"
                      value={newSlide.cta_text}
                      onChange={(e) => setNewSlide({ ...newSlide, cta_text: e.target.value })}
                      className="w-1/2 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      placeholder="/categories/electronics"
                      value={newSlide.cta_link}
                      onChange={(e) => setNewSlide({ ...newSlide, cta_link: e.target.value })}
                      className="w-1/2 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddSlide(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving} className="bg-accent text-white">Save Slide</Button>
              </div>
            </form>
          )}

          {/* Edit Slide Form Modal / Panel */}
          {editingSlide && (
            <form onSubmit={handleUpdateSlide} className="bg-white p-6 rounded-xl border-2 border-accent shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-accent" /> Edit Hero Slide #{editingSlide.sort_order}
                </h3>
                <span className="text-xs text-slate-400 font-mono">ID: {editingSlide.id.slice(0, 8)}...</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Main Heading</label>
                  <input
                    type="text"
                    required
                    value={editingSlide.heading}
                    onChange={(e) => setEditingSlide({ ...editingSlide, heading: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subheading</label>
                  <input
                    type="text"
                    value={editingSlide.subheading}
                    onChange={(e) => setEditingSlide({ ...editingSlide, subheading: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Image URL or Upload</label>
                    <label className="cursor-pointer text-xs font-semibold text-accent hover:underline flex items-center gap-1">
                      {isUploadingEditBanner ? (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Upload new banner
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={isUploadingEditBanner}
                        onChange={handleUploadEditHeroBanner}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <input
                    type="url"
                    required
                    value={editingSlide.image_url}
                    onChange={(e) => setEditingSlide({ ...editingSlide, image_url: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
                  {editingSlide.image_url && (
                    <div className="mt-2 relative w-28 h-16 rounded-lg overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editingSlide.image_url} alt="Slide Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">CTA Text & Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingSlide.cta_text}
                        onChange={(e) => setEditingSlide({ ...editingSlide, cta_text: e.target.value })}
                        className="w-1/2 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        value={editingSlide.cta_link}
                        onChange={(e) => setEditingSlide({ ...editingSlide, cta_link: e.target.value })}
                        className="w-1/2 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <label className="text-xs font-semibold text-slate-700">Display Order</label>
                    <input
                      type="number"
                      value={editingSlide.sort_order}
                      onChange={(e) => setEditingSlide({ ...editingSlide, sort_order: parseInt(e.target.value) || 1 })}
                      className="w-24 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setEditingSlide(null)}>Cancel</Button>
                <Button type="submit" disabled={isSaving} className="bg-accent text-white">Save Changes</Button>
              </div>
            </form>
          )}

          {/* Slides List */}
          <div className="grid grid-cols-1 gap-4">
            {heroSlides.map((slide, idx) => (
              <div key={slide.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  {/* Reorder Buttons (Move Up / Move Down) */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveSlide(idx, "up")}
                      disabled={idx === 0}
                      className="p-1 rounded text-slate-400 hover:text-slate-800 disabled:opacity-20 disabled:hover:text-slate-400 hover:bg-slate-100 transition-colors"
                      title="Move Up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveSlide(idx, "down")}
                      disabled={idx === heroSlides.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-slate-800 disabled:opacity-20 disabled:hover:text-slate-400 hover:bg-slate-100 transition-colors"
                      title="Move Down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative w-24 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 border border-slate-200">
                    <img src={slide.image_url} alt={slide.heading} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        Order #{slide.sort_order}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900">{slide.heading}</h4>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{slide.subheading}</p>
                    <span className="text-[11px] text-accent font-semibold mt-0.5 block">{slide.cta_text} → {slide.cta_link}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0">
                  <button
                    onClick={() => setEditingSlide(slide)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => toggleSlideActive(slide.id, slide.is_active)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      slide.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {slide.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {slide.is_active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => handleDeleteSlide(slide.id)}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete slide"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: SPECIAL CAMPAIGN */}
      {activeTab === "campaign" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Festival & Special Campaign Settings</h3>
              <p className="text-xs text-slate-500">
                Change title from &quot;Raksha Bandhan Specials&quot; to &quot;Diwali Sale&quot; or &quot;Durga Puja Specials&quot; instantly
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={campaignConfig.special_collection?.is_active ?? true}
                onChange={(e) =>
                  setCampaignConfig({
                    ...campaignConfig,
                    special_collection: {
                      ...campaignConfig.special_collection,
                      is_active: e.target.checked
                    }
                  })
                }
                className="rounded border-slate-300 text-accent focus:ring-accent"
              />
              Campaign Section Active
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign Title</label>
              <input
                type="text"
                value={campaignConfig.special_collection?.title || ""}
                onChange={(e) =>
                  setCampaignConfig({
                    ...campaignConfig,
                    special_collection: {
                      ...campaignConfig.special_collection,
                      title: e.target.value
                    }
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign Subtitle</label>
              <input
                type="text"
                value={campaignConfig.special_collection?.subtitle || ""}
                onChange={(e) =>
                  setCampaignConfig({
                    ...campaignConfig,
                    special_collection: {
                      ...campaignConfig.special_collection,
                      subtitle: e.target.value
                    }
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SPOTLIGHT OFFERS */}
      {activeTab === "spotlight" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">In The Spotlight Banners</h3>
              <p className="text-xs text-slate-500">Configure promotional highlight offer cards</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={campaignConfig.in_the_spotlight?.is_active ?? true}
                onChange={(e) =>
                  setCampaignConfig({
                    ...campaignConfig,
                    in_the_spotlight: {
                      ...campaignConfig.in_the_spotlight,
                      is_active: e.target.checked
                    }
                  })
                }
                className="rounded border-slate-300 text-accent focus:ring-accent"
              />
              Spotlight Active
            </label>
          </div>
        </div>
      )}

      {/* TAB 4: MERCHANDISING RULES & PINNED PRODUCTS */}
      {activeTab === "rules" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-600" /> Merchandising & Ranking Rules
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure maximum products, min stock, min discount, and manual pinned product overrides per section
            </p>
          </div>

          {/* Deals of the Day Rule */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3 bg-slate-50/50">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-500" /> Deals of the Day Section Rules
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Products Shown</label>
                <input
                  type="number"
                  value={campaignConfig.section_rules?.deals?.max_products || 10}
                  onChange={(e) => {
                    const rules = campaignConfig.section_rules || {};
                    setCampaignConfig({
                      ...campaignConfig,
                      section_rules: {
                        ...rules,
                        deals: { ...rules.deals, max_products: parseInt(e.target.value) || 10 }
                      }
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Discount (%)</label>
                <input
                  type="number"
                  value={campaignConfig.section_rules?.deals?.min_discount || 5}
                  onChange={(e) => {
                    const rules = campaignConfig.section_rules || {};
                    setCampaignConfig({
                      ...campaignConfig,
                      section_rules: {
                        ...rules,
                        deals: { ...rules.deals, min_discount: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Stock Required</label>
                <input
                  type="number"
                  value={campaignConfig.section_rules?.deals?.min_stock || 1}
                  onChange={(e) => {
                    const rules = campaignConfig.section_rules || {};
                    setCampaignConfig({
                      ...campaignConfig,
                      section_rules: {
                        ...rules,
                        deals: { ...rules.deals, min_stock: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* Trending Section Rule */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3 bg-slate-50/50">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" /> Trending Now Section Rules
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Products Shown</label>
                <input
                  type="number"
                  value={campaignConfig.section_rules?.trending?.max_products || 10}
                  onChange={(e) => {
                    const rules = campaignConfig.section_rules || {};
                    setCampaignConfig({
                      ...campaignConfig,
                      section_rules: {
                        ...rules,
                        trending: { ...rules.trending, max_products: parseInt(e.target.value) || 10 }
                      }
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Stock Required</label>
                <input
                  type="number"
                  value={campaignConfig.section_rules?.trending?.min_stock || 1}
                  onChange={(e) => {
                    const rules = campaignConfig.section_rules || {};
                    setCampaignConfig({
                      ...campaignConfig,
                      section_rules: {
                        ...rules,
                        trending: { ...rules.trending, min_stock: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* Recently Viewed Storefront Section Toggle */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Recently Viewed Section Visibility</h4>
                  <p className="text-xs text-slate-500">
                    Control display of the &quot;Recently Viewed&quot; section on the homepage. Toggling updates immediately without overwriting other configs.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={campaignConfig.recently_viewed?.is_active ?? true}
                  disabled={isSaving}
                  onChange={(e) => handleToggleRecentlyViewed(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-accent focus:ring-accent"
                />
                <span className="text-slate-800 font-bold">
                  {(campaignConfig.recently_viewed?.is_active ?? true) ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STOREFRONT GRID & RESPONSIVE LAYOUT */}
      {activeTab === "grid" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-8">
          {/* Header */}
          <div className="border-b border-slate-200 pb-4">
            <h3 className="font-bold text-slate-900 text-lg">Storefront Multi-Layout & Grid Engine Controls</h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure layout styles (Standard, Compact, Featured, Horizontal Rail, Carousel, Two-Card, Dense, Editorial) per category. Real approved seller products automatically take the leading slots; demo products fill remaining fallback slots up to the section limit.
            </p>
          </div>

          {/* Section A: Global Fallback Defaults */}
          <div className="p-5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                1. Global Fallback Grid Settings
              </h4>
              <span className="text-[11px] text-slate-500">Applies when no category-specific override is set</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Desktop Columns (≥ 1024px)</label>
                <select
                  value={campaignConfig.storefront_grid?.desktop_cols ?? 4}
                  onChange={(e) => {
                    setCampaignConfig({
                      ...campaignConfig,
                      storefront_grid: {
                        ...(campaignConfig.storefront_grid || { desktop_cols: 4, tablet_cols: 3, mobile_cols: 2, section_limit: 8 }),
                        desktop_cols: parseInt(e.target.value) || 4
                      }
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent bg-white"
                >
                  <option value={3}>3 Columns</option>
                  <option value={4}>4 Columns (Recommended)</option>
                  <option value={5}>5 Columns</option>
                  <option value={6}>6 Columns (Dense)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tablet Columns (640px – 1023px)</label>
                <select
                  value={campaignConfig.storefront_grid?.tablet_cols ?? 3}
                  onChange={(e) => {
                    setCampaignConfig({
                      ...campaignConfig,
                      storefront_grid: {
                        ...(campaignConfig.storefront_grid || { desktop_cols: 4, tablet_cols: 3, mobile_cols: 2, section_limit: 8 }),
                        tablet_cols: parseInt(e.target.value) || 3
                      }
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent bg-white"
                >
                  <option value={2}>2 Columns</option>
                  <option value={3}>3 Columns (Recommended)</option>
                  <option value={4}>4 Columns</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Columns (&lt; 640px)</label>
                <select
                  value={campaignConfig.storefront_grid?.mobile_cols ?? 2}
                  onChange={(e) => {
                    setCampaignConfig({
                      ...campaignConfig,
                      storefront_grid: {
                        ...(campaignConfig.storefront_grid || { desktop_cols: 4, tablet_cols: 3, mobile_cols: 2, section_limit: 8 }),
                        mobile_cols: parseInt(e.target.value) || 2
                      }
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent bg-white"
                >
                  <option value={1}>1 Column (Full Width)</option>
                  <option value={2}>2 Columns (Recommended)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Section Product Limit</label>
                <select
                  value={campaignConfig.storefront_grid?.section_limit ?? 8}
                  onChange={(e) => {
                    setCampaignConfig({
                      ...campaignConfig,
                      storefront_grid: {
                        ...(campaignConfig.storefront_grid || { desktop_cols: 4, tablet_cols: 3, mobile_cols: 2, section_limit: 8 }),
                        section_limit: parseInt(e.target.value) || 8
                      }
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent bg-white"
                >
                  <option value={4}>4 Products</option>
                  <option value={6}>6 Products</option>
                  <option value={8}>8 Products (Recommended)</option>
                  <option value={10}>10 Products</option>
                  <option value={12}>12 Products</option>
                  <option value={16}>16 Products</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section B: Category-Specific Multi-Layout Overrides */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  2. Category-Specific Layout Configurations
                </h4>
                <p className="text-xs text-slate-500">
                  Select a category to independently customize its layout style, column density, and product capacity.
                </p>
              </div>
            </div>

            {/* Category Selector Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {ADMIN_CONFIGURABLE_CATEGORIES.map((cat) => {
                const isSelected = selectedCategoryKey === cat.key;
                const catConfig = campaignConfig.storefront_grid?.category_layouts?.[cat.key];
                const activeStyle = catConfig?.layout_style || cat.defaultLayout;

                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategoryKey(cat.key)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-mono ${
                      isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {activeStyle}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Configuration Box for Currently Selected Category */}
            {(() => {
              const currentCatMeta = ADMIN_CONFIGURABLE_CATEGORIES.find((c) => c.key === selectedCategoryKey) || ADMIN_CONFIGURABLE_CATEGORIES[0];
              const currentCatConfig = campaignConfig.storefront_grid?.category_layouts?.[selectedCategoryKey] || {};
              const currentStyle = currentCatConfig.layout_style || currentCatMeta.defaultLayout;
              const currentDesktopCols = currentCatConfig.desktop_cols ?? campaignConfig.storefront_grid?.desktop_cols ?? 4;
              const currentTabletCols = currentCatConfig.tablet_cols ?? campaignConfig.storefront_grid?.tablet_cols ?? 3;
              const currentMobileCols = currentCatConfig.mobile_cols ?? campaignConfig.storefront_grid?.mobile_cols ?? 2;
              const currentMobileRail = currentCatConfig.mobile_rail ?? false;
              const currentSectionLimit = currentCatConfig.section_limit ?? campaignConfig.storefront_grid?.section_limit ?? 8;

              const updateCurrent = (updates: Partial<CategoryLayoutConfig>) => {
                const currentGrid = campaignConfig.storefront_grid || { desktop_cols: 4, tablet_cols: 3, mobile_cols: 2, section_limit: 8 };
                const currentCategoryLayouts = currentGrid.category_layouts || {};
                const existing = currentCategoryLayouts[selectedCategoryKey] || {};

                setCampaignConfig({
                  ...campaignConfig,
                  storefront_grid: {
                    ...currentGrid,
                    category_layouts: {
                      ...currentCategoryLayouts,
                      [selectedCategoryKey]: {
                        ...existing,
                        ...updates,
                      },
                    },
                  },
                });
              };

              return (
                <div className="p-5 rounded-2xl bg-white border-2 border-slate-200/90 shadow-sm space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-xs font-bold uppercase text-accent tracking-wider">Active Configuration</span>
                      <h4 className="text-base font-extrabold text-slate-900">{currentCatMeta.name}</h4>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-accent/10 text-accent">
                      Style: {currentStyle}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Layout Style */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Product Layout Style
                      </label>
                      <select
                        value={currentStyle}
                        onChange={(e) => updateCurrent({ layout_style: e.target.value as ProductLayoutStyle })}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl focus:outline-none focus:border-accent bg-white"
                      >
                        <option value="standard">Standard Marketplace Grid (Multi-row)</option>
                        <option value="compact">Compact Dense Grid (Groceries &amp; Daily Items)</option>
                        <option value="featured">Featured Prominent Grid (Fashion &amp; Apparel)</option>
                        <option value="rail">Horizontal Product Rail (Smooth Scrolling)</option>
                        <option value="carousel">Product Carousel (With Controls)</option>
                        <option value="two_card">Two-Card Featured (Wide Cards)</option>
                        <option value="dense">Dense Multi-Card Grid (5-6 Columns)</option>
                        <option value="editorial">Editorial / Mixed Spotlight Grid</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Changes visual card structure and scroll behavior</p>
                    </div>

                    {/* Desktop Columns */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Desktop Columns (≥ 1024px)
                      </label>
                      <select
                        value={currentDesktopCols}
                        onChange={(e) => updateCurrent({ desktop_cols: parseInt(e.target.value) || 4 })}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl focus:outline-none focus:border-accent bg-white"
                      >
                        <option value={3}>3 Columns</option>
                        <option value={4}>4 Columns</option>
                        <option value={5}>5 Columns</option>
                        <option value={6}>6 Columns (Dense)</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Columns per row (Cards do not stretch into 10 columns)</p>
                    </div>

                    {/* Tablet Columns */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Tablet Columns (640px – 1023px)
                      </label>
                      <select
                        value={currentTabletCols}
                        onChange={(e) => updateCurrent({ tablet_cols: parseInt(e.target.value) || 3 })}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl focus:outline-none focus:border-accent bg-white"
                      >
                        <option value={2}>2 Columns</option>
                        <option value={3}>3 Columns</option>
                        <option value={4}>4 Columns</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Medium screen density</p>
                    </div>

                    {/* Mobile Columns */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Mobile Columns (&lt; 640px)
                      </label>
                      <select
                        value={currentMobileCols}
                        onChange={(e) => updateCurrent({ mobile_cols: parseInt(e.target.value) || 2 })}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl focus:outline-none focus:border-accent bg-white"
                      >
                        <option value={1}>1 Column (Full Width)</option>
                        <option value={2}>2 Columns (Compact Grid)</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Mobile grid density</p>
                    </div>

                    {/* Section Capacity Limit */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Section Product Capacity Limit
                      </label>
                      <select
                        value={currentSectionLimit}
                        onChange={(e) => updateCurrent({ section_limit: parseInt(e.target.value) || 8 })}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl focus:outline-none focus:border-accent bg-white"
                      >
                        <option value={4}>4 Products</option>
                        <option value={6}>6 Products</option>
                        <option value={8}>8 Products (Standard)</option>
                        <option value={10}>10 Products</option>
                        <option value={12}>12 Products</option>
                        <option value={16}>16 Products</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Real products fill leading slots; demo items fill remaining</p>
                    </div>

                    {/* Mobile Horizontal Rail Mode */}
                    <div className="flex flex-col justify-center">
                      <label className="flex items-center gap-2 cursor-pointer mt-2">
                        <input
                          type="checkbox"
                          checked={currentMobileRail}
                          onChange={(e) => updateCurrent({ mobile_rail: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-accent focus:ring-accent"
                        />
                        <span className="text-xs font-bold text-slate-700">Enable Mobile Horizontal Rail</span>
                      </label>
                      <p className="text-[11px] text-slate-400 mt-1">
                        When checked, mobile view automatically transforms into a touch-swipeable horizontal rail
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Section C: Category Layout Overview Table / Matrix */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
              3. Storefront Category Layout Overview
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ADMIN_CONFIGURABLE_CATEGORIES.map((cat) => {
                const catConfig = campaignConfig.storefront_grid?.category_layouts?.[cat.key];
                const activeStyle = catConfig?.layout_style || cat.defaultLayout;
                const limit = catConfig?.section_limit ?? campaignConfig.storefront_grid?.section_limit ?? 8;
                const isSelected = selectedCategoryKey === cat.key;

                return (
                  <div
                    key={cat.key}
                    onClick={() => setSelectedCategoryKey(cat.key)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "border-accent bg-accent/5 ring-1 ring-accent"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">{cat.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Capacity: {limit} products</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-white border border-slate-200 text-slate-700 shadow-2xs">
                      {activeStyle}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Architecture Explanatory Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
            <LayoutGrid className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800">Dynamic Progressive Slot Replacement Active</p>
              <p className="mt-0.5">
                Whenever a seller or admin adds a real active product to any category, it immediately occupies Slot 1, Slot 2, etc. using its exact uploaded storage image. Remaining slots up to the Section Product Capacity are automatically filled with curated demo fallback items.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
