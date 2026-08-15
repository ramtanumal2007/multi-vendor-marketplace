"use client";

import React, { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Plus, 
  Trash2, 
  Save, 
  Eye, 
  EyeOff, 
  Image as ImageIcon,
  Sparkles,
  Zap,
  Sliders,
  Award,
  Flame,
  Pin
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

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

interface HomepageConfig {
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

export default function AdminHomepageManager() {
  const { addToast } = useToast();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"hero" | "campaign" | "spotlight" | "rules">("hero");
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Campaign & Rules Config
  const [campaignConfig, setCampaignConfig] = useState<HomepageConfig>({
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

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);

    const [heroRes, configRes] = await Promise.all([
      supabase.from("hero_slides").select("*").order("sort_order", { ascending: true }),
      supabase.from("page_seo").select("meta_description").eq("page_slug", "homepage_config").single()
    ]);

    if (heroRes.data) {
      setHeroSlides(heroRes.data);
    }

    if (configRes.data?.meta_description) {
      try {
        const parsed = JSON.parse(configRes.data.meta_description);
        setCampaignConfig((prev) => ({
          ...prev,
          ...parsed,
          section_rules: parsed.section_rules || prev.section_rules
        }));
      } catch (e) {
        console.error("Error parsing campaign config:", e);
      }
    }

    setIsLoading(false);
  }

  // Toggle slide active state
  async function toggleSlideActive(id: string, currentStatus: boolean) {
    const { error } = await supabase
      .from("hero_slides")
      .update({ is_active: !currentStatus })
      .eq("id", id);

    if (error) {
      addToast({ title: "Failed to update slide", type: "error" });
    } else {
      addToast({ title: "Slide status updated", type: "success" });
      setHeroSlides((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !currentStatus } : s))
      );
    }
  }

  // Add new hero slide
  async function handleAddSlide(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlide.heading || !newSlide.image_url) {
      addToast({ title: "Heading and image URL are required", type: "error" });
      return;
    }

    setIsSaving(true);
    const { data, error } = await supabase
      .from("hero_slides")
      .insert([newSlide])
      .select();

    setIsSaving(false);
    if (error) {
      addToast({ title: "Failed to add slide", type: "error" });
    } else if (data) {
      addToast({ title: "Hero slide added successfully", type: "success" });
      setHeroSlides((prev) => [...prev, data[0]]);
      setShowAddSlide(false);
      setNewSlide({
        heading: "",
        subheading: "",
        cta_text: "Shop Now",
        cta_link: "/products",
        image_url: "",
        sort_order: heroSlides.length + 1,
        is_active: true
      });
    }
  }

  // Delete slide
  async function handleDeleteSlide(id: string) {
    if (!confirm("Are you sure you want to delete this slide?")) return;

    const { error } = await supabase.from("hero_slides").delete().eq("id", id);
    if (error) {
      addToast({ title: "Failed to delete slide", type: "error" });
    } else {
      addToast({ title: "Slide deleted", type: "success" });
      setHeroSlides((prev) => prev.filter((s) => s.id !== id));
    }
  }

  // Save Campaign & Merchandising Config safely into page_seo
  async function handleSaveConfig() {
    setIsSaving(true);

    // Preserve existing fields
    const { error } = await supabase.from("page_seo").upsert(
      [
        {
          page_slug: "homepage_config",
          meta_title: "Homepage Configuration",
          meta_description: JSON.stringify(campaignConfig)
        }
      ],
      { onConflict: "page_slug" }
    );

    setIsSaving(false);
    if (error) {
      addToast({ title: "Failed to save configuration", type: "error" });
    } else {
      addToast({ title: "Homepage configuration & Merchandising Rules saved!", type: "success" });
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://images.unsplash.com/..."
                    value={newSlide.image_url}
                    onChange={(e) => setNewSlide({ ...newSlide, image_url: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-accent"
                  />
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

          {/* Slides List */}
          <div className="grid grid-cols-1 gap-4">
            {heroSlides.map((slide) => (
              <div key={slide.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="relative w-24 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 border border-slate-200">
                    <img src={slide.image_url} alt={slide.heading} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{slide.heading}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{slide.subheading}</p>
                    <span className="text-[11px] text-accent font-semibold mt-0.5 block">{slide.cta_text} → {slide.cta_link}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0">
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
                Change title from "Raksha Bandhan Specials" to "Diwali Sale" or "Durga Puja Specials" instantly
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
        </div>
      )}
    </div>
  );
}
